import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { classifyFreshness, type FreshnessThresholds } from "@/lib/market/freshness";
import type { DisplayStatus } from "@/lib/market/types";

export type InstrumentRow = typeof s.instruments.$inferSelect;
export type QuoteRow = typeof s.quotes.$inferSelect;

export interface InstrumentWithQuote extends InstrumentRow {
  quote: QuoteRow | null;
  displayStatus: DisplayStatus;
}

const instrumentQuoteSelect = {
  instrument: s.instruments,
  quote: s.quotes,
};

function withStatus(
  rows: { instrument: InstrumentRow; quote: QuoteRow | null }[],
  thresholds?: FreshnessThresholds,
): InstrumentWithQuote[] {
  const now = new Date();
  return rows.map((r) => ({
    ...r.instrument,
    quote: r.quote,
    displayStatus: classifyFreshness(r.quote?.dataStatus, r.quote?.asOf, now, thresholds),
  }));
}

function quoteJoin(sourceId: string) {
  return and(eq(s.quotes.instrumentId, s.instruments.id), eq(s.quotes.sourceId, sourceId));
}

export async function listInstrumentsWithQuotes(
  db: Database,
  sourceId: string,
  opts: { types?: string[]; ids?: number[]; exchange?: string } = {},
): Promise<InstrumentWithQuote[]> {
  const conds = [eq(s.instruments.sourceId, sourceId)];
  if (opts.types?.length) conds.push(inArray(s.instruments.instrumentType, opts.types));
  if (opts.ids) {
    if (opts.ids.length === 0) return [];
    conds.push(inArray(s.instruments.id, opts.ids));
  }
  if (opts.exchange) conds.push(eq(s.instruments.exchange, opts.exchange));
  const rows = await db
    .select(instrumentQuoteSelect)
    .from(s.instruments)
    .leftJoin(s.quotes, quoteJoin(sourceId))
    .where(and(...conds))
    .orderBy(asc(s.instruments.symbol), asc(s.instruments.exchange));
  return withStatus(rows);
}

export async function searchInstruments(db: Database, sourceId: string, query: string, limit = 12) {
  const q = query.trim();
  if (!q) return [];
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const like = `%${escaped}%`;
  const prefix = `${escaped}%`;
  const rows = await db
    .select(instrumentQuoteSelect)
    .from(s.instruments)
    .leftJoin(s.quotes, quoteJoin(sourceId))
    .where(
      and(
        eq(s.instruments.sourceId, sourceId),
        or(ilike(s.instruments.symbol, like), ilike(s.instruments.name, like), ilike(s.instruments.isin, like), eq(s.instruments.exchangeCode, q)),
      ),
    )
    .orderBy(
      sql`case when ${s.instruments.symbol} ilike ${prefix} then 0 when ${s.instruments.name} ilike ${prefix} then 1 else 2 end`,
      sql`case ${s.instruments.exchange} when 'INDEX' then 0 when 'NSE' then 1 else 2 end`,
      asc(s.instruments.symbol),
    )
    .limit(Math.min(Math.max(limit, 1), 50));
  return withStatus(rows);
}

export async function getInstrument(db: Database, sourceId: string, exchange: string, symbol: string) {
  const rows = await db
    .select(instrumentQuoteSelect)
    .from(s.instruments)
    .leftJoin(s.quotes, quoteJoin(sourceId))
    .where(and(eq(s.instruments.sourceId, sourceId), eq(s.instruments.exchange, exchange), eq(s.instruments.symbol, symbol)))
    .limit(1);
  return withStatus(rows)[0] ?? null;
}

export async function getInstrumentById(db: Database, id: number) {
  const rows = await db
    .select(instrumentQuoteSelect)
    .from(s.instruments)
    .leftJoin(s.quotes, and(eq(s.quotes.instrumentId, s.instruments.id), eq(s.quotes.sourceId, s.instruments.sourceId)))
    .where(eq(s.instruments.id, id))
    .limit(1);
  return withStatus(rows)[0] ?? null;
}

export async function getBars(db: Database, instrumentId: number, sourceId: string, from?: string | null, to?: string | null) {
  const conds = [eq(s.priceBars.instrumentId, instrumentId), eq(s.priceBars.sourceId, sourceId)];
  if (from) conds.push(gte(s.priceBars.date, from));
  if (to) conds.push(lte(s.priceBars.date, to));
  return db
    .select({
      date: s.priceBars.date,
      open: s.priceBars.open,
      high: s.priceBars.high,
      low: s.priceBars.low,
      close: s.priceBars.close,
      volume: s.priceBars.volume,
    })
    .from(s.priceBars)
    .where(and(...conds))
    .orderBy(asc(s.priceBars.date));
}

export async function getBarsForMany(db: Database, ids: number[], sourceId: string, from?: string | null) {
  if (ids.length === 0) return new Map<number, { date: string; close: number }[]>();
  const conds = [inArray(s.priceBars.instrumentId, ids), eq(s.priceBars.sourceId, sourceId)];
  if (from) conds.push(gte(s.priceBars.date, from));
  const rows = await db
    .select({ id: s.priceBars.instrumentId, date: s.priceBars.date, close: s.priceBars.close })
    .from(s.priceBars)
    .where(and(...conds))
    .orderBy(asc(s.priceBars.date));
  const out = new Map<number, { date: string; close: number }[]>();
  for (const r of rows) {
    if (!out.has(r.id)) out.set(r.id, []);
    out.get(r.id)!.push({ date: r.date, close: r.close });
  }
  return out;
}

export async function latestBarDate(db: Database, sourceId: string): Promise<string | null> {
  const [row] = await db
    .select({ d: sql<string | null>`max(${s.priceBars.date})::text` })
    .from(s.priceBars)
    .where(eq(s.priceBars.sourceId, sourceId));
  return row?.d ?? null;
}

export async function getIndices(db: Database, sourceId: string) {
  const rows = await listInstrumentsWithQuotes(db, sourceId, { types: ["INDEX"] });
  const order = ["NIFTY50", "NIFTYBANK", "SENSEX"];
  return rows.sort((a, b) => {
    const ia = order.indexOf(a.symbol);
    const ib = order.indexOf(b.symbol);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.symbol.localeCompare(b.symbol);
  });
}

export async function getMovers(db: Database, sourceId: string, limit = 8, exchange = "NSE") {
  const equities = (await listInstrumentsWithQuotes(db, sourceId, { types: ["EQUITY", "ETF"], exchange })).filter(
    (r) => r.quote?.changePct != null,
  );
  const byChange = [...equities].sort((a, b) => b.quote!.changePct! - a.quote!.changePct!);
  return {
    gainers: byChange.filter((r) => r.quote!.changePct! > 0).slice(0, limit),
    losers: byChange.filter((r) => r.quote!.changePct! < 0).reverse().slice(0, limit),
    active: [...equities]
      .filter((r) => r.quote?.volume != null)
      .sort((a, b) => b.quote!.price * b.quote!.volume! - a.quote!.price * a.quote!.volume!)
      .slice(0, limit),
  };
}

/** Advancers / decliners from constituent quotes. Returns null without constituent data. */
export async function getBreadth(db: Database, indexId: number, sourceId: string) {
  const rows = await db
    .select({ changePct: s.quotes.changePct, price: s.quotes.price })
    .from(s.indexConstituents)
    .leftJoin(s.quotes, and(eq(s.quotes.instrumentId, s.indexConstituents.instrumentId), eq(s.quotes.sourceId, sourceId)))
    .where(eq(s.indexConstituents.indexId, indexId));
  if (rows.length === 0) return null;
  const withQuote = rows.filter((r) => r.changePct != null);
  return {
    constituents: rows.length,
    covered: withQuote.length,
    advancers: withQuote.filter((r) => r.changePct! > 0).length,
    decliners: withQuote.filter((r) => r.changePct! < 0).length,
    unchanged: withQuote.filter((r) => r.changePct === 0).length,
  };
}

export async function getIndexConstituents(db: Database, indexId: number, sourceId: string) {
  const rows = await db
    .select({ instrument: s.instruments, quote: s.quotes, weight: s.indexConstituents.weight })
    .from(s.indexConstituents)
    .innerJoin(s.instruments, eq(s.instruments.id, s.indexConstituents.instrumentId))
    .leftJoin(s.quotes, quoteJoin(sourceId))
    .where(eq(s.indexConstituents.indexId, indexId))
    .orderBy(desc(s.indexConstituents.weight));
  return withStatus(rows).map((r, i) => ({ ...r, weight: rows[i]!.weight }));
}

export async function getIndexMetadata(db: Database, indexId: number) {
  const [row] = await db.select().from(s.indexMetadata).where(eq(s.indexMetadata.instrumentId, indexId));
  return row ?? null;
}

export async function getFundamentals(db: Database, instrumentId: number, sourceId: string) {
  const [row] = await db
    .select()
    .from(s.companyFundamentals)
    .where(and(eq(s.companyFundamentals.instrumentId, instrumentId), eq(s.companyFundamentals.sourceId, sourceId)));
  return row ?? null;
}

export async function getAllFundamentals(db: Database, sourceId: string) {
  return db.select().from(s.companyFundamentals).where(eq(s.companyFundamentals.sourceId, sourceId));
}

export async function getStatements(db: Database, instrumentId: number, sourceId: string) {
  return db
    .select()
    .from(s.financialStatements)
    .where(and(eq(s.financialStatements.instrumentId, instrumentId), eq(s.financialStatements.sourceId, sourceId)))
    .orderBy(asc(s.financialStatements.fiscalYear));
}

export async function getCorporateActions(
  db: Database,
  sourceId: string,
  opts: { instrumentId?: number; type?: string; from?: string; to?: string; limit?: number } = {},
) {
  const conds = [eq(s.corporateActions.sourceId, sourceId)];
  if (opts.instrumentId) conds.push(eq(s.corporateActions.instrumentId, opts.instrumentId));
  if (opts.type) conds.push(eq(s.corporateActions.actionType, opts.type));
  if (opts.from) conds.push(gte(s.corporateActions.exDate, opts.from));
  if (opts.to) conds.push(lte(s.corporateActions.exDate, opts.to));
  return db
    .select({ action: s.corporateActions, symbol: s.instruments.symbol, exchange: s.instruments.exchange, name: s.instruments.name })
    .from(s.corporateActions)
    .innerJoin(s.instruments, eq(s.instruments.id, s.corporateActions.instrumentId))
    .where(and(...conds))
    .orderBy(desc(s.corporateActions.exDate))
    .limit(Math.min(opts.limit ?? 500, 2000));
}

export async function getPeers(db: Database, inst: InstrumentRow, limit = 8) {
  if (!inst.sector) return [];
  const rows = await db
    .select({ instrument: s.instruments, quote: s.quotes, f: s.companyFundamentals })
    .from(s.instruments)
    .leftJoin(s.quotes, quoteJoin(inst.sourceId))
    .leftJoin(
      s.companyFundamentals,
      and(eq(s.companyFundamentals.instrumentId, s.instruments.id), eq(s.companyFundamentals.sourceId, inst.sourceId)),
    )
    .where(
      and(
        eq(s.instruments.sourceId, inst.sourceId),
        eq(s.instruments.sector, inst.sector),
        eq(s.instruments.exchange, inst.exchange),
        ne(s.instruments.id, inst.id),
      ),
    )
    .orderBy(desc(s.companyFundamentals.marketCapCr))
    .limit(limit);
  return rows;
}

export async function getOtherListings(db: Database, inst: InstrumentRow) {
  if (!inst.issuerKey) return [];
  return db
    .select()
    .from(s.instruments)
    .where(and(eq(s.instruments.issuerKey, inst.issuerKey), eq(s.instruments.sourceId, inst.sourceId), ne(s.instruments.id, inst.id)));
}

export async function getSectors(db: Database, sourceId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ sector: s.instruments.sector })
    .from(s.instruments)
    .where(and(eq(s.instruments.sourceId, sourceId), ne(s.instruments.instrumentType, "INDEX")));
  return rows.map((r) => r.sector).filter((x): x is string => Boolean(x)).sort();
}

/** Summary used by the global status bar. */
export async function getMarketDataStatus(db: Database, sourceId: string) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      lastAsOf: sql<Date | null>`max(${s.quotes.asOf})`,
      lastFetched: sql<Date | null>`max(${s.quotes.fetchedAt})`,
      statuses: sql<string[] | null>`array_agg(distinct ${s.quotes.dataStatus})`,
    })
    .from(s.quotes)
    .where(eq(s.quotes.sourceId, sourceId));
  const [src] = await db.select().from(s.dataSources).where(eq(s.dataSources.id, sourceId));
  const toDate = (v: Date | string | null | undefined) => (v ? new Date(v) : null);
  return {
    sourceId,
    sourceName: src?.name ?? sourceId,
    quoteCount: Number(row?.count ?? 0),
    lastAsOf: toDate(row?.lastAsOf),
    lastFetched: toDate(row?.lastFetched),
    statuses: (row?.statuses ?? []).filter(Boolean),
    lastSuccessAt: src?.lastSuccessAt ?? null,
    lastError: src?.lastError ?? null,
    lastErrorAt: src?.lastErrorAt ?? null,
  };
}
