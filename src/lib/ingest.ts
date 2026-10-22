import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import type {
  CorporateActionRecord,
  EconomicEventRecord,
  EconomicSeriesRecord,
  Exchange,
  FinancialStatementRecord,
  FundamentalsRecord,
  IndexRecord,
  InstrumentRecord,
  NewsRecord,
  PriceBar,
  QuoteRecord,
} from "@/lib/market/types";
import { PriceBarSchema, QuoteRecordSchema } from "@/lib/market/types";

type Ref = `${Exchange}:${string}`;
const ref = (exchange: Exchange, symbol: string): Ref => `${exchange}:${symbol}`;

export const DATA_SOURCE_DEFS: (typeof s.dataSources.$inferInsert)[] = [
  {
    id: "demo",
    name: "OpenFinance Demo Data",
    kind: "market",
    enabled: true,
    defaultStatus: "demo",
    termsNote: "Synthetic data generated locally about fictional companies. Not real market data.",
    refreshIntervalMinutes: 0,
  },
  {
    id: "alphavantage",
    name: "Alpha Vantage",
    kind: "market",
    enabled: false,
    defaultStatus: "eod",
    homepage: "https://www.alphavantage.co",
    termsNote: "Subject to Alpha Vantage terms of service. Free tier is rate limited.",
    refreshIntervalMinutes: 24 * 60,
  },
  {
    id: "fred",
    name: "FRED (St. Louis Fed)",
    kind: "economic",
    enabled: false,
    defaultStatus: "eod",
    homepage: "https://fred.stlouisfed.org",
    termsNote: "Subject to the FRED API Terms of Use. Some series are third-party copyrighted.",
    refreshIntervalMinutes: 24 * 60,
  },
  {
    id: "rss",
    name: "Configured RSS/Atom feeds",
    kind: "news",
    enabled: false,
    defaultStatus: "live",
    termsNote: "Headlines and feed-provided summaries only. Confirm each publisher's terms.",
    refreshIntervalMinutes: 30,
  },
  {
    id: "eod",
    name: "NSE/BSE end-of-day bhavcopy",
    kind: "market",
    enabled: true,
    defaultStatus: "eod",
    homepage: "https://www.nseindia.com/all-reports",
    termsNote:
      "Official exchange bhavcopy files (and optionally the TejHQ archive) imported by you. Exchange terms govern use; redistribution is not assumed to be permitted.",
    refreshIntervalMinutes: 24 * 60,
  },
  {
    id: "user",
    name: "User-supplied data",
    kind: "economic",
    enabled: true,
    defaultStatus: "eod",
    termsNote: "Data imported by a user from a CSV file. Accuracy and usage rights are the user's responsibility.",
    refreshIntervalMinutes: 0,
  },
];

export async function ensureDataSources(db: Database) {
  for (const def of DATA_SOURCE_DEFS) {
    await db.insert(s.dataSources).values(def).onConflictDoNothing();
  }
}

async function chunked<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export async function upsertInstruments(
  db: Database,
  sourceId: string,
  records: InstrumentRecord[],
): Promise<Map<Ref, number>> {
  await chunked(records, 200, (chunk) =>
    db
      .insert(s.instruments)
      .values(chunk.map((r) => ({ ...r, sourceId })))
      .onConflictDoUpdate({
        target: [s.instruments.exchange, s.instruments.symbol, s.instruments.sourceId],
        set: {
          name: sql`excluded.name`,
          isin: sql`excluded.isin`,
          sector: sql`excluded.sector`,
          industry: sql`excluded.industry`,
          description: sql`excluded.description`,
        },
      }),
  );
  return instrumentIdMap(db, sourceId);
}

export async function instrumentIdMap(db: Database, sourceId: string): Promise<Map<Ref, number>> {
  const rows = await db
    .select({ id: s.instruments.id, symbol: s.instruments.symbol, exchange: s.instruments.exchange })
    .from(s.instruments)
    .where(eq(s.instruments.sourceId, sourceId));
  return new Map(rows.map((r) => [ref(r.exchange as Exchange, r.symbol), r.id]));
}

function need(map: Map<Ref, number>, exchange: Exchange, symbol: string): number {
  const id = map.get(ref(exchange, symbol));
  if (id == null) throw new Error(`Unknown instrument ${exchange}:${symbol}`);
  return id;
}

export async function upsertBars(
  db: Database,
  sourceId: string,
  instrumentId: number,
  bars: PriceBar[],
): Promise<number> {
  const valid = bars.filter((b) => PriceBarSchema.safeParse(b).success);
  await chunked(valid, 1000, (chunk) =>
    db
      .insert(s.priceBars)
      .values(chunk.map((b) => ({ ...b, instrumentId, sourceId })))
      .onConflictDoUpdate({
        target: [s.priceBars.instrumentId, s.priceBars.sourceId, s.priceBars.date],
        set: {
          open: sql`excluded.open`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          close: sql`excluded.close`,
          volume: sql`excluded.volume`,
        },
      }),
  );
  return valid.length;
}

export async function upsertQuotes(
  db: Database,
  sourceId: string,
  ids: Map<Ref, number>,
  quotes: QuoteRecord[],
): Promise<number> {
  const valid = quotes.filter((q) => QuoteRecordSchema.safeParse(q).success && ids.has(ref(q.exchange, q.symbol)));
  const now = new Date();
  await chunked(valid, 500, (chunk) =>
    db
      .insert(s.quotes)
      .values(
        chunk.map((q) => ({
          instrumentId: need(ids, q.exchange, q.symbol),
          sourceId,
          price: q.price,
          open: q.open,
          high: q.high,
          low: q.low,
          prevClose: q.prevClose,
          change: q.change,
          changePct: q.changePct,
          volume: q.volume,
          asOf: q.asOf,
          fetchedAt: now,
          dataStatus: q.dataStatus,
        })),
      )
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
      }),
  );
  return valid.length;
}

export async function upsertFundamentals(
  db: Database,
  sourceId: string,
  ids: Map<Ref, number>,
  rows: FundamentalsRecord[],
) {
  await chunked(rows, 200, (chunk) =>
    db
      .insert(s.companyFundamentals)
      .values(
        chunk.map(({ symbol, exchange, ...f }) => ({
          ...f,
          instrumentId: need(ids, exchange, symbol),
          sourceId,
        })),
      )
      .onConflictDoNothing(),
  );
}

export async function upsertStatements(
  db: Database,
  sourceId: string,
  ids: Map<Ref, number>,
  rows: FinancialStatementRecord[],
) {
  await chunked(rows, 300, (chunk) =>
    db
      .insert(s.financialStatements)
      .values(
        chunk.map(({ symbol, exchange, ...r }) => ({
          ...r,
          instrumentId: need(ids, exchange, symbol),
          sourceId,
        })),
      )
      .onConflictDoNothing(),
  );
}

export async function insertCorporateActions(
  db: Database,
  sourceId: string,
  ids: Map<Ref, number>,
  rows: CorporateActionRecord[],
) {
  const instrumentIds = [...new Set(rows.map((r) => need(ids, r.exchange, r.symbol)))];
  if (instrumentIds.length) {
    await db
      .delete(s.corporateActions)
      .where(and(eq(s.corporateActions.sourceId, sourceId), inArray(s.corporateActions.instrumentId, instrumentIds)));
  }
  await chunked(rows, 300, (chunk) =>
    db.insert(s.corporateActions).values(
      chunk.map(({ symbol, exchange, ...r }) => ({
        ...r,
        instrumentId: need(ids, exchange, symbol),
        sourceId,
      })),
    ),
  );
}

export async function upsertIndices(
  db: Database,
  ids: Map<Ref, number>,
  indices: IndexRecord[],
) {
  for (const idx of indices) {
    const indexId = need(ids, "INDEX", idx.instrument.symbol);
    await db
      .insert(s.indexMetadata)
      .values({
        instrumentId: indexId,
        family: idx.family,
        baseValue: idx.baseValue,
        baseDate: idx.baseDate,
        methodology: idx.methodology,
      })
      .onConflictDoNothing();
    await db.delete(s.indexConstituents).where(eq(s.indexConstituents.indexId, indexId));
    if (idx.constituents.length) {
      await db.insert(s.indexConstituents).values(
        idx.constituents.map((c) => ({
          indexId,
          instrumentId: need(ids, c.exchange, c.symbol),
          weight: c.weight,
        })),
      );
    }
  }
}

export async function upsertNews(db: Database, sourceId: string, rows: NewsRecord[]): Promise<number> {
  await chunked(rows, 200, (chunk) =>
    db
      .insert(s.newsArticles)
      .values(chunk.map((r) => ({ ...r, sourceId })))
      .onConflictDoNothing(),
  );
  return rows.length;
}

export async function upsertEconomicSeries(
  db: Database,
  sourceId: string,
  rows: EconomicSeriesRecord[],
): Promise<number> {
  let count = 0;
  const fetchedAt = new Date();
  for (const { observations, ...meta } of rows) {
    await db
      .insert(s.economicSeries)
      .values({ ...meta, sourceId, fetchedAt })
      .onConflictDoUpdate({
        target: s.economicSeries.id,
        set: { name: meta.name, unit: meta.unit, publishedAt: meta.publishedAt, fetchedAt, description: meta.description },
      });
    await chunked(observations, 1000, (chunk) =>
      db
        .insert(s.economicObservations)
        .values(chunk.map((o) => ({ ...o, seriesId: meta.id })))
        .onConflictDoUpdate({
          target: [s.economicObservations.seriesId, s.economicObservations.periodDate],
          set: { value: sql`excluded.value` },
        }),
    );
    count += observations.length;
  }
  return count;
}

export async function insertSampleEvents(db: Database, sourceId: string, rows: EconomicEventRecord[]) {
  await db.delete(s.economicEvents).where(and(eq(s.economicEvents.sourceId, sourceId), eq(s.economicEvents.isSample, true)));
  if (rows.length) await db.insert(s.economicEvents).values(rows.map((r) => ({ ...r, sourceId })));
}

export async function startRun(db: Database, sourceId: string, dataset: string) {
  const [run] = await db
    .insert(s.dataRefreshRuns)
    .values({ sourceId, dataset, status: "running" })
    .returning({ id: s.dataRefreshRuns.id });
  return run!.id;
}

export async function finishRun(
  db: Database,
  runId: number,
  sourceId: string,
  outcome: { status: "success" | "error" | "skipped"; recordCount?: number; message?: string },
) {
  const now = new Date();
  await db
    .update(s.dataRefreshRuns)
    .set({ status: outcome.status, finishedAt: now, recordCount: outcome.recordCount ?? 0, message: outcome.message })
    .where(eq(s.dataRefreshRuns.id, runId));
  if (outcome.status === "success") {
    await db.update(s.dataSources).set({ lastSuccessAt: now, updatedAt: now }).where(eq(s.dataSources.id, sourceId));
  } else if (outcome.status === "error") {
    await db
      .update(s.dataSources)
      .set({ lastErrorAt: now, lastError: outcome.message?.slice(0, 500) ?? "Unknown error", updatedAt: now })
      .where(eq(s.dataSources.id, sourceId));
  }
}
