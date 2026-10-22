/**
 * Idempotent importer for end-of-day exchange data.
 *
 *  - Bars are upserted on (instrument, source, date): re-running an import
 *    never creates duplicates.
 *  - A file whose SHA-256 was already imported successfully is skipped.
 *  - Official exchange files take precedence over the third-party archive:
 *    an archive row never overwrites a bar written from an official file.
 *  - Every bar records the import that wrote it; every import records the
 *    file name, hash, URL (if downloaded), format, mode and timestamps.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { istDateTime } from "@/lib/dates";
import { ensureDataSources } from "@/lib/ingest";
import { expandFile, parseRawFile, type EodRow, type IndexRow, type ParseOptions, type ParsedFile, type RawFile } from "./parse";
import { refreshTechnicalSnapshots } from "./technicals";

export const EOD_SOURCE = "eod";

export type ImportMode = "daily" | "backfill" | "manual" | "archive";

export interface ImportMeta {
  mode: ImportMode;
  sourceUrl?: string | null;
  userId?: string | null;
  force?: boolean;
  parse?: ParseOptions;
  /** Skip quote/technical refresh (callers doing many files refresh once at the end). */
  deferRefresh?: boolean;
}

export interface FileResult {
  importId: number | null;
  fileName: string;
  format: string | null;
  exchange: string | null;
  status: "success" | "skipped" | "error";
  message: string;
  dates: string[];
  rowsRead: number;
  rowsAccepted: number;
  rowsRejected: number;
  barsWritten: number;
  rejectedSample: { line: number; reason: string }[];
  instrumentIds: number[];
}

export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

const g = globalThis as unknown as { __ofEodLock?: Promise<unknown> };

/** Run imports one at a time per process (PGlite is single-writer). */
export async function withImportLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = g.__ofEodLock ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  g.__ofEodLock = prev.then(() => next);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

const originFor = (format: string) => (format === "tej_parquet" ? "archive" : "official");

async function findDuplicate(db: Database, hash: string) {
  const [row] = await db
    .select({ id: s.importFiles.id, importedAt: s.importFiles.importedAt })
    .from(s.importFiles)
    .where(and(eq(s.importFiles.sha256, hash), eq(s.importFiles.status, "success"), eq(s.importFiles.sourceId, EOD_SOURCE)))
    .limit(1);
  return row ?? null;
}

async function recordImport(db: Database, values: typeof s.importFiles.$inferInsert) {
  const [row] = await db.insert(s.importFiles).values(values).returning({ id: s.importFiles.id });
  return row!.id;
}

/* ---------------------------- Instruments ----------------------------- */

interface InstrumentRef {
  id: number;
  symbol: string;
  isin: string | null;
}

async function loadInstruments(db: Database, exchange: string) {
  const rows = await db
    .select({ id: s.instruments.id, symbol: s.instruments.symbol, isin: s.instruments.isin })
    .from(s.instruments)
    .where(and(eq(s.instruments.sourceId, EOD_SOURCE), eq(s.instruments.exchange, exchange)));
  const bySymbol = new Map<string, InstrumentRef>(rows.map((r) => [r.symbol, r]));
  const byIsin = new Map<string, InstrumentRef>();
  for (const r of rows) if (r.isin) byIsin.set(r.isin, r);
  return { bySymbol, byIsin };
}

async function lastBarDate(db: Database, instrumentId: number): Promise<string | null> {
  const [r] = await db
    .select({ d: sql<string | null>`max(${s.priceBars.date})::text` })
    .from(s.priceBars)
    .where(and(eq(s.priceBars.instrumentId, instrumentId), eq(s.priceBars.sourceId, EOD_SOURCE)));
  return r?.d ?? null;
}

/**
 * Map each symbol to an instrument id, creating instruments as needed.
 * A symbol not seen before whose ISIN belongs to an instrument that stopped
 * trading before this file is treated as a rename: the instrument keeps its
 * history and takes the new symbol.
 */
async function resolveInstruments(db: Database, exchange: "NSE" | "BSE", rows: EodRow[], mode: ImportMode): Promise<Map<string, number>> {
  const { bySymbol, byIsin } = await loadInstruments(db, exchange);
  const latest = new Map<string, EodRow>();
  for (const r of rows) {
    const cur = latest.get(r.symbol);
    if (!cur || r.date > cur.date) latest.set(r.symbol, r);
  }
  const firstDate = new Map<string, string>();
  for (const r of rows) if (!firstDate.has(r.symbol) || r.date < firstDate.get(r.symbol)!) firstDate.set(r.symbol, r.date);

  const out = new Map<string, number>();
  const toCreate: (typeof s.instruments.$inferInsert)[] = [];
  for (const [symbol, r] of latest) {
    const existing = bySymbol.get(symbol);
    if (existing) {
      out.set(symbol, existing.id);
      continue;
    }
    const prior = r.isin ? byIsin.get(r.isin) : undefined;
    if (prior && !latest.has(prior.symbol)) {
      const last = await lastBarDate(db, prior.id);
      if (last && last < firstDate.get(symbol)!) {
        await db.update(s.instruments).set({ symbol }).where(eq(s.instruments.id, prior.id));
        bySymbol.delete(prior.symbol);
        bySymbol.set(symbol, { ...prior, symbol });
        out.set(symbol, prior.id);
        continue;
      }
    }
    toCreate.push({
      symbol,
      exchange,
      name: r.name ?? symbol,
      isin: r.isin,
      exchangeCode: r.exchangeCode,
      issuerKey: r.isin,
      series: r.series,
      instrumentType: "EQUITY",
      currency: "INR",
      sourceId: EOD_SOURCE,
      description: null,
    });
  }
  for (let i = 0; i < toCreate.length; i += 500) {
    const created = await db
      .insert(s.instruments)
      .values(toCreate.slice(i, i + 500))
      .onConflictDoNothing()
      .returning({ id: s.instruments.id, symbol: s.instruments.symbol });
    for (const c of created) out.set(c.symbol, c.id);
  }
  // Anything lost to a concurrent insert: look it up.
  const unresolved = [...latest.keys()].filter((k) => !out.has(k));
  if (unresolved.length) {
    const again = await loadInstruments(db, exchange);
    for (const k of unresolved) {
      const r = again.bySymbol.get(k);
      if (r) out.set(k, r.id);
    }
  }
  // Refresh metadata from the newest row (archives only fill gaps).
  for (const [symbol, r] of latest) {
    const id = out.get(symbol);
    if (!id || !bySymbol.has(symbol)) continue;
    const patch: Partial<typeof s.instruments.$inferInsert> = {};
    if (mode === "archive") {
      if (r.isin) await db.update(s.instruments).set({ isin: sql`coalesce(${s.instruments.isin}, ${r.isin})` }).where(eq(s.instruments.id, id));
    } else {
      if (r.name) patch.name = r.name;
      if (r.isin) {
        patch.isin = r.isin;
        patch.issuerKey = r.isin;
      }
      if (r.series) patch.series = r.series;
      if (r.exchangeCode) patch.exchangeCode = r.exchangeCode;
    }
    if (Object.keys(patch).length) await db.update(s.instruments).set(patch).where(eq(s.instruments.id, id));
  }
  return out;
}

async function resolveIndexInstruments(db: Database, rows: IndexRow[]) {
  const names = new Map(rows.map((r) => [r.symbol, r.name]));
  if (names.size === 0) return new Map<string, number>();
  await db
    .insert(s.instruments)
    .values([...names].map(([symbol, name]) => ({ symbol, exchange: "INDEX", name, instrumentType: "INDEX", currency: "INR", sourceId: EOD_SOURCE, description: "Index closing values from the NSE index closing file. Index data is owned by NSE Indices Ltd." })))
    .onConflictDoNothing();
  const found = await db
    .select({ id: s.instruments.id, symbol: s.instruments.symbol })
    .from(s.instruments)
    .where(and(eq(s.instruments.sourceId, EOD_SOURCE), eq(s.instruments.exchange, "INDEX"), inArray(s.instruments.symbol, [...names.keys()])));
  return new Map(found.map((f) => [f.symbol, f.id]));
}

/* -------------------------------- Bars -------------------------------- */

async function writeBars(
  db: Database,
  bars: (typeof s.priceBars.$inferInsert)[],
): Promise<number> {
  let written = 0;
  for (let i = 0; i < bars.length; i += 2000) {
    const res = await db
      .insert(s.priceBars)
      .values(bars.slice(i, i + 2000))
      .onConflictDoUpdate({
        target: [s.priceBars.instrumentId, s.priceBars.sourceId, s.priceBars.date],
        set: {
          open: sql`excluded.open`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          close: sql`excluded.close`,
          volume: sql`excluded.volume`,
          prevClose: sql`excluded.prev_close`,
          turnover: sql`excluded.turnover`,
          trades: sql`excluded.trades`,
          importId: sql`excluded.import_id`,
          origin: sql`excluded.origin`,
        },
        // Never let an archive overwrite a bar that came from an official file.
        setWhere: sql`${s.priceBars.origin} is distinct from 'official' or excluded.origin = 'official'`,
      })
      .returning({ id: s.priceBars.instrumentId });
    written += res.length;
  }
  return written;
}

async function writeParsed(db: Database, parsed: ParsedFile, importId: number, mode: ImportMode) {
  const origin = originFor(parsed.format);
  const ids = new Set<number>();
  let written = 0;
  if (parsed.rows.length) {
    const byEx = new Map<"NSE" | "BSE", EodRow[]>();
    for (const r of parsed.rows) { const _l = byEx.get(r.exchange); if (_l) _l.push(r); else byEx.set(r.exchange, [r]); }
    for (const [ex, rows] of byEx) {
      const map = await resolveInstruments(db, ex, rows, mode);
      const bars = rows.flatMap((r) => {
        const id = map.get(r.symbol);
        if (!id) return [];
        ids.add(id);
        return [
          {
            instrumentId: id,
            sourceId: EOD_SOURCE,
            date: r.date,
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            volume: r.volume,
            prevClose: r.prevClose,
            turnover: r.turnover,
            trades: r.trades,
            importId,
            origin,
          },
        ];
      });
      written += await writeBars(db, bars);
    }
  }
  if (parsed.indexRows.length) {
    const map = await resolveIndexInstruments(db, parsed.indexRows);
    const bars = parsed.indexRows.flatMap((r) => {
      const id = map.get(r.symbol);
      if (!id) return [];
      ids.add(id);
      return [{ instrumentId: id, sourceId: EOD_SOURCE, date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? 0, prevClose: null, turnover: r.turnover, trades: null, importId, origin }];
    });
    written += await writeBars(db, bars);
  }
  return { written, ids: [...ids] };
}

/* ------------------------------- Quotes ------------------------------- */

/** Rebuild the latest quote for each instrument from its two most recent bars. */
export async function refreshQuotes(db: Database, instrumentIds: number[]) {
  if (instrumentIds.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < instrumentIds.length; i += 500) {
    const chunk = instrumentIds.slice(i, i + 500);
    const res = await db.execute(sql`
      select i.id as instrument_id, b.date::text as date, b.open, b.high, b.low, b.close, b.volume, b.prev_close,
             row_number() over (partition by i.id order by b.date desc) as rn, f.mode
      from instruments i
      cross join lateral (
        select pb.date, pb.open, pb.high, pb.low, pb.close, pb.volume, pb.prev_close, pb.import_id
        from price_bars pb
        where pb.instrument_id = i.id and pb.source_id = ${EOD_SOURCE}
        order by pb.date desc
        limit 2
      ) b
      left join import_files f on f.id = b.import_id
      where i.id in (${sql.join(chunk.map((x) => sql`${x}`), sql`, `)})
    `);
    const rows = (res as unknown as { rows: Record<string, unknown>[] }).rows;
    const byId = new Map<number, Record<string, unknown>[]>();
    for (const r of rows) {
      const id = Number(r.instrument_id);
      { const _l = byId.get(id); if (_l) _l.push(r); else byId.set(id, [r]); }
    }
    const values: (typeof s.quotes.$inferInsert)[] = [];
    for (const [id, bars] of byId) {
      const latest = bars.find((b) => Number(b.rn) === 1);
      if (!latest) continue;
      const prevBar = bars.find((b) => Number(b.rn) === 2);
      const close = Number(latest.close);
      const prev = latest.prev_close != null ? Number(latest.prev_close) : prevBar ? Number(prevBar.close) : null;
      const change = prev != null && prev > 0 ? Math.round((close - prev) * 100) / 100 : null;
      const mode = String(latest.mode ?? "daily");
      values.push({
        instrumentId: id,
        sourceId: EOD_SOURCE,
        price: close,
        open: Number(latest.open),
        high: Number(latest.high),
        low: Number(latest.low),
        prevClose: prev,
        change,
        changePct: change != null && prev ? Math.round((change / prev) * 1e6) / 1e4 : null,
        volume: Number(latest.volume),
        asOf: istDateTime(String(latest.date), 15, 30),
        fetchedAt: new Date(),
        dataStatus: mode === "backfill" || mode === "archive" ? "historical" : "eod",
      });
    }
    if (values.length) {
      await db
        .insert(s.quotes)
        .values(values)
        .onConflictDoUpdate({
          target: [s.quotes.instrumentId, s.quotes.sourceId],
          set: {
            price: sql`excluded.price`,
            open: sql`excluded.open`,
            high: sql`excluded.high`,
            low: sql`excluded.low`,
            prevClose: sql`excluded.prev_close`,
            change: sql`excluded.change`,
            changePct: sql`excluded.change_pct`,
            volume: sql`excluded.volume`,
            asOf: sql`excluded.as_of`,
            fetchedAt: sql`excluded.fetched_at`,
            dataStatus: sql`excluded.data_status`,
          },
        });
      n += values.length;
    }
  }
  return n;
}

export async function refreshDerived(db: Database, instrumentIds: number[]) {
  const ids = [...new Set(instrumentIds)];
  await refreshQuotes(db, ids);
  await refreshTechnicalSnapshots(db, EOD_SOURCE, ids);
  const now = new Date();
  await db.update(s.dataSources).set({ lastSuccessAt: now, updatedAt: now }).where(eq(s.dataSources.id, EOD_SOURCE));
}

/* -------------------------------- Entry -------------------------------- */

/** Import one or more raw files (CSV, ZIP of CSVs, or parquet archive). */
export async function importFiles(db: Database, files: RawFile[], meta: ImportMeta): Promise<FileResult[]> {
  return withImportLock(async () => {
    await ensureDataSources(db);
    // An import still "running" after 30 minutes was interrupted (process stopped mid-import).
    await db
      .update(s.importFiles)
      .set({ status: "error", message: "Interrupted before completion; bars written so far are kept and the file can be imported again" })
      .where(and(eq(s.importFiles.status, "running"), sql`${s.importFiles.importedAt} < now() - interval '30 minutes'`));
    const results: FileResult[] = [];
    const touched = new Set<number>();
    for (const outer of files) {
      let members: RawFile[];
      try {
        members = expandFile(outer);
      } catch (err) {
        results.push(errorResult(outer.name, err));
        continue;
      }
      for (const f of members) {
        const hash = sha256(f.bytes);
        const base = { fileName: f.name, sha256: hash, sourceId: EOD_SOURCE, sourceUrl: meta.sourceUrl ?? null, importedBy: meta.userId ?? null };
        const dup = meta.force ? null : await findDuplicate(db, hash);
        if (dup) {
          results.push({ ...emptyResult(f.name), status: "skipped", message: `Already imported (identical file, import #${dup.id}); bars unchanged.`, importId: dup.id });
          continue;
        }
        let parsed: ParsedFile;
        try {
          parsed = await parseRawFile(f, meta.parse);
        } catch (err) {
          const r = errorResult(f.name, err);
          r.importId = await recordImport(db, { ...base, format: "unknown", origin: "official", mode: meta.mode, status: "error", message: r.message });
          results.push(r);
          continue;
        }
        const mode: ImportMode = parsed.format === "tej_parquet" ? "archive" : meta.mode;
        const importId = await recordImport(db, {
          ...base,
          format: parsed.format,
          exchange: parsed.exchange,
          origin: originFor(parsed.format),
          mode,
          tradeDateFrom: parsed.dates[0] ?? null,
          tradeDateTo: parsed.dates.at(-1) ?? null,
          rowsRead: parsed.rowsRead,
          rowsAccepted: parsed.rows.length + parsed.indexRows.length,
          rowsRejected: parsed.rejected.length,
          status: "running",
        });
        try {
          const { written, ids } = await writeParsed(db, parsed, importId, mode);
          ids.forEach((id) => touched.add(id));
          const accepted = parsed.rows.length + parsed.indexRows.length;
          const message =
            `${accepted} rows accepted, ${parsed.filtered} outside configured series or no trades, ${parsed.rejected.length} rejected` +
            (written < accepted ? `; ${accepted - written} kept from an official file` : "");
          await db.update(s.importFiles).set({ status: "success", barsWritten: written, message }).where(eq(s.importFiles.id, importId));
          results.push({
            importId,
            fileName: f.name,
            format: parsed.format,
            exchange: parsed.exchange,
            status: "success",
            message,
            dates: parsed.dates,
            rowsRead: parsed.rowsRead,
            rowsAccepted: accepted,
            rowsRejected: parsed.rejected.length,
            barsWritten: written,
            rejectedSample: parsed.rejected.slice(0, 10),
            instrumentIds: ids,
          });
        } catch (err) {
          const r = errorResult(f.name, err);
          await db.update(s.importFiles).set({ status: "error", message: r.message }).where(eq(s.importFiles.id, importId));
          results.push({ ...r, importId, format: parsed.format, exchange: parsed.exchange });
        }
      }
    }
    if (!meta.deferRefresh && touched.size) await refreshDerived(db, [...touched]);
    return results;
  });
}

function emptyResult(fileName: string): FileResult {
  return { importId: null, fileName, format: null, exchange: null, status: "success", message: "", dates: [], rowsRead: 0, rowsAccepted: 0, rowsRejected: 0, barsWritten: 0, rejectedSample: [], instrumentIds: [] };
}

function errorResult(fileName: string, err: unknown): FileResult {
  return { ...emptyResult(fileName), status: "error", message: err instanceof Error ? err.message : String(err) };
}

/* ------------------------------- Queries ------------------------------- */

export async function listImports(db: Database, limit = 50) {
  return db.select().from(s.importFiles).where(eq(s.importFiles.sourceId, EOD_SOURCE)).orderBy(desc(s.importFiles.importedAt), desc(s.importFiles.id)).limit(limit);
}

/** Latest trading date successfully imported from an official file, per exchange. */
export async function lastOfficialDate(db: Database, exchange: "NSE" | "BSE"): Promise<string | null> {
  const [r] = await db
    .select({ d: sql<string | null>`max(${s.importFiles.tradeDateTo})::text` })
    .from(s.importFiles)
    .where(and(eq(s.importFiles.sourceId, EOD_SOURCE), eq(s.importFiles.exchange, exchange), eq(s.importFiles.status, "success"), eq(s.importFiles.origin, "official"), sql`${s.importFiles.format} <> 'nse_index'`));
  return r?.d ?? null;
}

export async function importedOfficialDates(db: Database, exchange: "NSE" | "BSE", from: string, to: string, kind: "equity" | "index" = "equity"): Promise<Set<string>> {
  const rows = await db
    .select({ d: sql<string>`${s.importFiles.tradeDateTo}::text` })
    .from(s.importFiles)
    .where(
      and(
        eq(s.importFiles.sourceId, EOD_SOURCE),
        eq(s.importFiles.exchange, exchange),
        eq(s.importFiles.status, "success"),
        eq(s.importFiles.origin, "official"),
        kind === "index" ? sql`${s.importFiles.format} = 'nse_index'` : sql`${s.importFiles.format} <> 'nse_index'`,
        sql`${s.importFiles.tradeDateTo} between ${from} and ${to}`,
      ),
    );
  return new Set(rows.map((r) => r.d));
}

export async function eodSummary(db: Database) {
  const res = await db.execute(sql`
    select i.exchange, count(distinct i.id)::int as instruments, count(pb.*)::int as bars,
           min(pb.date)::text as first_date, max(pb.date)::text as last_date
    from instruments i
    join price_bars pb on pb.instrument_id = i.id and pb.source_id = ${EOD_SOURCE}
    where i.source_id = ${EOD_SOURCE}
    group by i.exchange order by i.exchange`);
  return (res as unknown as { rows: { exchange: string; instruments: number; bars: number; first_date: string; last_date: string }[] }).rows.map((r) => ({
    exchange: r.exchange,
    instruments: Number(r.instruments),
    bars: Number(r.bars),
    firstDate: r.first_date,
    lastDate: r.last_date,
  }));
}

export async function hasEodData(db: Database): Promise<boolean> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(s.quotes).where(eq(s.quotes.sourceId, EOD_SOURCE));
  return Number(r?.n ?? 0) > 0;
}
