import { and, asc, desc, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { parseCsv } from "@/lib/csv";
import type { Database } from "@/lib/db/client";
import * as s from "@/lib/db/schema";

export interface DatasetColumn {
  name: string;
  type: string;
  description: string;
}

export interface DatasetDef {
  id: string;
  name: string;
  description: string;
  columns: DatasetColumn[];
  filters: ("symbol" | "series" | "from" | "to" | "type")[];
  maxRange?: string;
}

export const DATASETS: DatasetDef[] = [
  {
    id: "instruments",
    name: "Instruments",
    description: "Securities and indices with identifiers (symbol, exchange, ISIN, BSE code) and classification.",
    filters: ["symbol", "type"],
    columns: [
      { name: "symbol", type: "text", description: "Exchange trading symbol" },
      { name: "exchange", type: "text", description: "NSE, BSE or INDEX" },
      { name: "name", type: "text", description: "Company or index name" },
      { name: "isin", type: "text", description: "ISIN (demo uses non-real ZZDEMO codes)" },
      { name: "exchange_code", type: "text", description: "Exchange-specific code, e.g. BSE scrip code" },
      { name: "instrument_type", type: "text", description: "EQUITY, ETF or INDEX" },
      { name: "sector", type: "text", description: "Sector classification" },
      { name: "source_id", type: "text", description: "Data source" },
    ],
  },
  {
    id: "price_bars",
    name: "Daily price bars",
    description: "End-of-day OHLCV bars per instrument. Query one instrument at a time.",
    filters: ["symbol", "from", "to"],
    maxRange: "Up to 3 years per query",
    columns: [
      { name: "date", type: "date", description: "Trading date" },
      { name: "symbol", type: "text", description: "Instrument symbol" },
      { name: "exchange", type: "text", description: "Exchange" },
      { name: "open", type: "numeric(20,4)", description: "Open price (INR)" },
      { name: "high", type: "numeric(20,4)", description: "High price (INR)" },
      { name: "low", type: "numeric(20,4)", description: "Low price (INR)" },
      { name: "close", type: "numeric(20,4)", description: "Close price (INR, split-adjusted in demo)" },
      { name: "volume", type: "bigint", description: "Shares traded" },
      { name: "source_id", type: "text", description: "Data source" },
    ],
  },
  {
    id: "quotes",
    name: "Latest quotes",
    description: "Most recent quote per instrument and source, with the source timestamp and status label.",
    filters: ["symbol"],
    columns: [
      { name: "symbol", type: "text", description: "Instrument symbol" },
      { name: "exchange", type: "text", description: "Exchange" },
      { name: "price", type: "numeric", description: "Last price" },
      { name: "change_pct", type: "numeric", description: "Change vs previous close, %" },
      { name: "volume", type: "bigint", description: "Volume" },
      { name: "as_of", type: "timestamptz", description: "Time the price applies to (source)" },
      { name: "fetched_at", type: "timestamptz", description: "Time stored by this app" },
      { name: "data_status", type: "text", description: "demo | live | delayed | eod" },
    ],
  },
  {
    id: "fundamentals",
    name: "Company fundamentals",
    description: "Valuation and profitability ratios. Missing values stay empty.",
    filters: ["symbol"],
    columns: [
      { name: "symbol", type: "text", description: "Instrument symbol" },
      { name: "exchange", type: "text", description: "Exchange" },
      { name: "as_of", type: "date", description: "As-of date" },
      { name: "market_cap_cr", type: "numeric", description: "Market cap, INR crore" },
      { name: "pe", type: "numeric", description: "Price / earnings" },
      { name: "pb", type: "numeric", description: "Price / book" },
      { name: "eps", type: "numeric", description: "Earnings per share, INR" },
      { name: "roe", type: "numeric", description: "Return on equity, %" },
      { name: "debt_to_equity", type: "numeric", description: "Debt / equity (blank for banks in demo)" },
      { name: "dividend_yield", type: "numeric", description: "Dividend yield, %" },
    ],
  },
  {
    id: "corporate_actions",
    name: "Corporate actions",
    description: "Dividends, splits, bonus and rights issues.",
    filters: ["symbol", "from", "to", "type"],
    columns: [
      { name: "ex_date", type: "date", description: "Ex-date" },
      { name: "symbol", type: "text", description: "Instrument symbol" },
      { name: "exchange", type: "text", description: "Exchange" },
      { name: "action_type", type: "text", description: "DIVIDEND | SPLIT | BONUS | RIGHTS" },
      { name: "description", type: "text", description: "Description" },
    ],
  },
  {
    id: "economic_observations",
    name: "Economic observations",
    description: "Observations for one economic series. Period date is the period described, not the release time.",
    filters: ["series", "from", "to"],
    columns: [
      { name: "series_id", type: "text", description: "Series identifier" },
      { name: "period_date", type: "date", description: "Observation period" },
      { name: "value", type: "numeric", description: "Value in the series unit" },
      { name: "unit", type: "text", description: "Unit" },
      { name: "source_id", type: "text", description: "Data source" },
    ],
  },
];

export const QuerySchema = z
  .object({
    dataset: z.enum(DATASETS.map((d) => d.id) as [string, ...string[]]),
    symbol: z.string().trim().max(40).optional(),
    series: z.string().trim().max(60).optional(),
    type: z.string().trim().max(20).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(10).max(500).default(100),
  })
  .superRefine((q, ctx) => {
    if (q.from && q.to && q.from > q.to) ctx.addIssue({ code: "custom", path: ["to"], message: "End date must be on or after start date" });
    if (q.dataset === "price_bars") {
      if (!q.symbol) ctx.addIssue({ code: "custom", path: ["symbol"], message: "Choose an instrument symbol for price bars" });
      if (q.from && q.to && Date.parse(q.to) - Date.parse(q.from) > 3 * 366 * 86_400_000) ctx.addIssue({ code: "custom", path: ["from"], message: "Date range is limited to 3 years per query" });
    }
    if (q.dataset === "economic_observations" && !q.series) ctx.addIssue({ code: "custom", path: ["series"], message: "Choose a series" });
  });
export type DataQuery = z.infer<typeof QuerySchema>;

const like = (v: string) => `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  sourceIds: string[];
}

/** Run a bounded, validated query. Never returns more than pageSize rows. */
export async function runDatasetQuery(db: Database, sourceId: string, q: DataQuery, opts: { limitOverride?: number } = {}): Promise<QueryResult> {
  const limit = opts.limitOverride ?? q.pageSize;
  const offset = opts.limitOverride ? 0 : (q.page - 1) * q.pageSize;
  const instCond = (extra: SQL[] = []) => and(eq(s.instruments.sourceId, sourceId), ...(q.symbol ? [eq(s.instruments.symbol, q.symbol.toUpperCase())] : []), ...extra);

  switch (q.dataset) {
    case "instruments": {
      const where = and(eq(s.instruments.sourceId, sourceId), q.symbol ? ilike(s.instruments.symbol, like(q.symbol)) : undefined, q.type ? eq(s.instruments.instrumentType, q.type.toUpperCase()) : undefined);
      const rows = await db
        .select({ symbol: s.instruments.symbol, exchange: s.instruments.exchange, name: s.instruments.name, isin: s.instruments.isin, exchange_code: s.instruments.exchangeCode, instrument_type: s.instruments.instrumentType, sector: s.instruments.sector, source_id: s.instruments.sourceId })
        .from(s.instruments)
        .where(where)
        .orderBy(asc(s.instruments.symbol), asc(s.instruments.exchange))
        .limit(limit)
        .offset(offset);
      const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(s.instruments).where(where);
      return { columns: DATASETS[0]!.columns.map((x) => x.name), rows, total: Number(c?.n ?? 0), sourceIds: [sourceId] };
    }
    case "price_bars": {
      const where = and(instCond(), eq(s.priceBars.sourceId, sourceId), q.from ? gte(s.priceBars.date, q.from) : undefined, q.to ? lte(s.priceBars.date, q.to) : undefined);
      const base = () => db.select().from(s.priceBars).innerJoin(s.instruments, eq(s.instruments.id, s.priceBars.instrumentId));
      const rows = (
        await base()
          .where(where)
          .orderBy(desc(s.priceBars.date), asc(s.instruments.exchange))
          .limit(limit)
          .offset(offset)
      ).map((r) => ({ date: r.price_bars.date, symbol: r.instruments.symbol, exchange: r.instruments.exchange, open: r.price_bars.open, high: r.price_bars.high, low: r.price_bars.low, close: r.price_bars.close, volume: r.price_bars.volume, source_id: r.price_bars.sourceId }));
      const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(s.priceBars).innerJoin(s.instruments, eq(s.instruments.id, s.priceBars.instrumentId)).where(where);
      return { columns: DATASETS[1]!.columns.map((x) => x.name), rows, total: Number(c?.n ?? 0), sourceIds: [sourceId] };
    }
    case "quotes": {
      const where = and(instCond(), eq(s.quotes.sourceId, sourceId));
      const rows = (await db.select().from(s.quotes).innerJoin(s.instruments, eq(s.instruments.id, s.quotes.instrumentId)).where(where).orderBy(asc(s.instruments.symbol)).limit(limit).offset(offset)).map((r) => ({
        symbol: r.instruments.symbol,
        exchange: r.instruments.exchange,
        price: r.quotes.price,
        change_pct: r.quotes.changePct,
        volume: r.quotes.volume,
        as_of: r.quotes.asOf.toISOString(),
        fetched_at: r.quotes.fetchedAt.toISOString(),
        data_status: r.quotes.dataStatus,
      }));
      const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(s.quotes).innerJoin(s.instruments, eq(s.instruments.id, s.quotes.instrumentId)).where(where);
      return { columns: DATASETS[2]!.columns.map((x) => x.name), rows, total: Number(c?.n ?? 0), sourceIds: [sourceId] };
    }
    case "fundamentals": {
      const where = and(instCond(), eq(s.companyFundamentals.sourceId, sourceId));
      const rows = (await db.select().from(s.companyFundamentals).innerJoin(s.instruments, eq(s.instruments.id, s.companyFundamentals.instrumentId)).where(where).orderBy(asc(s.instruments.symbol)).limit(limit).offset(offset)).map((r) => ({
        symbol: r.instruments.symbol,
        exchange: r.instruments.exchange,
        as_of: r.company_fundamentals.asOf,
        market_cap_cr: r.company_fundamentals.marketCapCr,
        pe: r.company_fundamentals.pe,
        pb: r.company_fundamentals.pb,
        eps: r.company_fundamentals.eps,
        roe: r.company_fundamentals.roe,
        debt_to_equity: r.company_fundamentals.debtToEquity,
        dividend_yield: r.company_fundamentals.dividendYield,
      }));
      const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(s.companyFundamentals).innerJoin(s.instruments, eq(s.instruments.id, s.companyFundamentals.instrumentId)).where(where);
      return { columns: DATASETS[3]!.columns.map((x) => x.name), rows, total: Number(c?.n ?? 0), sourceIds: [sourceId] };
    }
    case "corporate_actions": {
      const where = and(instCond(), eq(s.corporateActions.sourceId, sourceId), q.from ? gte(s.corporateActions.exDate, q.from) : undefined, q.to ? lte(s.corporateActions.exDate, q.to) : undefined, q.type ? eq(s.corporateActions.actionType, q.type.toUpperCase()) : undefined);
      const rows = (await db.select().from(s.corporateActions).innerJoin(s.instruments, eq(s.instruments.id, s.corporateActions.instrumentId)).where(where).orderBy(desc(s.corporateActions.exDate)).limit(limit).offset(offset)).map((r) => ({
        ex_date: r.corporate_actions.exDate,
        symbol: r.instruments.symbol,
        exchange: r.instruments.exchange,
        action_type: r.corporate_actions.actionType,
        description: r.corporate_actions.description,
      }));
      const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(s.corporateActions).innerJoin(s.instruments, eq(s.instruments.id, s.corporateActions.instrumentId)).where(where);
      return { columns: DATASETS[4]!.columns.map((x) => x.name), rows, total: Number(c?.n ?? 0), sourceIds: [sourceId] };
    }
    case "economic_observations": {
      const where = and(eq(s.economicObservations.seriesId, q.series!), q.from ? gte(s.economicObservations.periodDate, q.from) : undefined, q.to ? lte(s.economicObservations.periodDate, q.to) : undefined);
      const res = await db.select().from(s.economicObservations).innerJoin(s.economicSeries, eq(s.economicSeries.id, s.economicObservations.seriesId)).where(where).orderBy(desc(s.economicObservations.periodDate)).limit(limit).offset(offset);
      const rows = res.map((r) => ({ series_id: r.economic_observations.seriesId, period_date: r.economic_observations.periodDate, value: r.economic_observations.value, unit: r.economic_series.unit, source_id: r.economic_series.sourceId }));
      const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(s.economicObservations).where(where);
      const [meta] = await db.select({ sourceId: s.economicSeries.sourceId }).from(s.economicSeries).where(eq(s.economicSeries.id, q.series!));
      return { columns: DATASETS[5]!.columns.map((x) => x.name), rows, total: Number(c?.n ?? 0), sourceIds: meta ? [meta.sourceId] : [] };
    }
  }
  return { columns: [], rows: [], total: 0, sourceIds: [] };
}

/** Record counts and freshness per dataset for the catalog view. */
export async function datasetCatalog(db: Database, sourceId: string) {
  const one = async (q: Promise<{ n: number; t: unknown }[]>) => {
    const [r] = await q;
    return { count: Number(r?.n ?? 0), latest: r?.t ? String(r.t) : null };
  };
  const [instruments, bars, quotes, fundamentals, actions, econ] = await Promise.all([
    one(db.select({ n: sql<number>`count(*)::int`, t: sql<unknown>`null` }).from(s.instruments).where(eq(s.instruments.sourceId, sourceId))),
    one(db.select({ n: sql<number>`count(*)::int`, t: sql<unknown>`max(${s.priceBars.date})::text` }).from(s.priceBars).where(eq(s.priceBars.sourceId, sourceId))),
    one(db.select({ n: sql<number>`count(*)::int`, t: sql<unknown>`max(${s.quotes.fetchedAt})` }).from(s.quotes).where(eq(s.quotes.sourceId, sourceId))),
    one(db.select({ n: sql<number>`count(*)::int`, t: sql<unknown>`max(${s.companyFundamentals.asOf})::text` }).from(s.companyFundamentals).where(eq(s.companyFundamentals.sourceId, sourceId))),
    one(db.select({ n: sql<number>`count(*)::int`, t: sql<unknown>`max(${s.corporateActions.exDate})::text` }).from(s.corporateActions).where(eq(s.corporateActions.sourceId, sourceId))),
    one(db.select({ n: sql<number>`count(*)::int`, t: sql<unknown>`max(${s.economicSeries.fetchedAt})` }).from(s.economicObservations).innerJoin(s.economicSeries, eq(s.economicSeries.id, s.economicObservations.seriesId))),
  ]);
  return { instruments, price_bars: bars, quotes, fundamentals, corporate_actions: actions, economic_observations: econ } as Record<string, { count: number; latest: string | null }>;
}

/* ------------------------------ CSV import ---------------------------- */

export const ImportSchema = z.object({
  seriesId: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]{3,40}$/, "Use 3–40 characters: A–Z, 0–9, underscore"),
  name: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(60),
  category: z.enum(["rates", "inflation", "growth", "fx", "yields", "production", "labour"]),
  unit: z.string().trim().min(1).max(40),
  frequency: z.enum(["daily", "monthly", "quarterly"]),
  sourceNote: z.string().trim().min(1, "Say where the data came from").max(300),
  csv: z.string().min(1).max(1_000_000, "CSV is limited to 1 MB"),
});

export function parseObservationCsv(csv: string): { observations: { periodDate: string; value: number | null }[]; errors: string[] } {
  const rows = parseCsv(csv, 50_000);
  const errors: string[] = [];
  const out: { periodDate: string; value: number | null }[] = [];
  const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const hasHeader = header.includes("date") || header.includes("period") || header.includes("value");
  const di = hasHeader ? Math.max(header.indexOf("date"), header.indexOf("period")) : 0;
  const vi = hasHeader ? header.indexOf("value") : 1;
  if (hasHeader && (di < 0 || vi < 0)) return { observations: [], errors: ["Header must include 'date' and 'value' columns"] };
  rows.slice(hasHeader ? 1 : 0).forEach((r, i) => {
    const line = i + (hasHeader ? 2 : 1);
    const d = r[di]?.trim() ?? "";
    const raw = r[vi]?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) {
      errors.push(`Line ${line}: date must be YYYY-MM-DD`);
      return;
    }
    if (raw === "" || raw === "." || raw.toLowerCase() === "na") {
      out.push({ periodDate: d, value: null });
      return;
    }
    const v = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(v)) {
      errors.push(`Line ${line}: value "${raw.slice(0, 20)}" is not a number`);
      return;
    }
    out.push({ periodDate: d, value: v });
  });
  return { observations: out, errors: errors.slice(0, 20) };
}
