import { z } from "zod";

/** A row the screener can evaluate. Missing values are `null`, never zero. */
export interface ScreenRow {
  instrumentId: number;
  symbol: string;
  exchange: string;
  name: string;
  sector: string | null;
  instrumentType: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  /** Traded value on the latest session, INR crore. */
  turnoverCr: number | null;
  marketCapCr: number | null;
  pe: number | null;
  pb: number | null;
  eps: number | null;
  revenueGrowth: number | null;
  profitGrowth: number | null;
  roe: number | null;
  debtToEquity: number | null;
  dividendYield: number | null;
  sma50: number | null;
  sma200: number | null;
  priceVsSma50: number | null;
  priceVsSma200: number | null;
  rsi14: number | null;
  volatility30: number | null;
  return1y: number | null;
  pctFrom52wHigh: number | null;
  dataStatus: string | null;
  asOf: string | null;
}

export type NumericField = Exclude<
  keyof ScreenRow,
  "instrumentId" | "symbol" | "exchange" | "name" | "sector" | "instrumentType" | "dataStatus" | "asOf"
>;

export interface FieldDef {
  key: NumericField;
  label: string;
  unit: string;
  group: "Price" | "Fundamentals" | "Technical";
}

export const SCREEN_FIELDS: FieldDef[] = [
  { key: "price", label: "Price", unit: "₹", group: "Price" },
  { key: "changePct", label: "Change %", unit: "%", group: "Price" },
  { key: "volume", label: "Volume", unit: "shares", group: "Price" },
  { key: "turnoverCr", label: "Turnover", unit: "₹ cr", group: "Price" },
  { key: "marketCapCr", label: "Market cap", unit: "₹ cr", group: "Fundamentals" },
  { key: "pe", label: "P/E", unit: "x", group: "Fundamentals" },
  { key: "pb", label: "P/B", unit: "x", group: "Fundamentals" },
  { key: "eps", label: "EPS", unit: "₹", group: "Fundamentals" },
  { key: "revenueGrowth", label: "Revenue growth", unit: "%", group: "Fundamentals" },
  { key: "profitGrowth", label: "Profit growth", unit: "%", group: "Fundamentals" },
  { key: "roe", label: "ROE", unit: "%", group: "Fundamentals" },
  { key: "debtToEquity", label: "Debt/Equity", unit: "x", group: "Fundamentals" },
  { key: "dividendYield", label: "Dividend yield", unit: "%", group: "Fundamentals" },
  { key: "sma50", label: "SMA 50", unit: "₹", group: "Technical" },
  { key: "sma200", label: "SMA 200", unit: "₹", group: "Technical" },
  { key: "priceVsSma50", label: "Price vs SMA 50", unit: "%", group: "Technical" },
  { key: "priceVsSma200", label: "Price vs SMA 200", unit: "%", group: "Technical" },
  { key: "rsi14", label: "RSI 14", unit: "", group: "Technical" },
  { key: "volatility30", label: "Volatility 30d (ann.)", unit: "%", group: "Technical" },
  { key: "return1y", label: "1-year return", unit: "%", group: "Technical" },
  { key: "pctFrom52wHigh", label: "From 52-week high", unit: "%", group: "Technical" },
];

const FIELD_KEYS = SCREEN_FIELDS.map((f) => f.key) as [NumericField, ...NumericField[]];

export const FilterSchema = z.discriminatedUnion("op", [
  z.object({ field: z.enum(FIELD_KEYS), op: z.enum(["gt", "gte", "lt", "lte"]), value: z.number().finite() }),
  z.object({ field: z.enum(FIELD_KEYS), op: z.literal("between"), value: z.number().finite(), value2: z.number().finite() }),
]);
export type ScreenFilter = z.infer<typeof FilterSchema>;

export const ScreenConfigSchema = z.object({
  exchanges: z.array(z.enum(["NSE", "BSE"])).default([]),
  types: z.array(z.enum(["EQUITY", "ETF"])).default([]),
  sectors: z.array(z.string().max(60)).max(50).default([]),
  filters: z.array(FilterSchema).max(25).default([]),
  logic: z.enum(["AND", "OR"]).default("AND"),
  sortBy: z.enum([...FIELD_KEYS, "symbol", "name"] as [string, ...string[]]).default("marketCapCr"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(200).default(25),
  columns: z.array(z.enum(FIELD_KEYS)).max(20).optional(),
});
export type ScreenConfig = z.infer<typeof ScreenConfigSchema>;

export function matchesFilter(row: ScreenRow, f: ScreenFilter): boolean {
  const v = row[f.field];
  if (v == null || !Number.isFinite(v)) return false;
  switch (f.op) {
    case "gt":
      return v > f.value;
    case "gte":
      return v >= f.value;
    case "lt":
      return v < f.value;
    case "lte":
      return v <= f.value;
    case "between": {
      const lo = Math.min(f.value, f.value2);
      const hi = Math.max(f.value, f.value2);
      return v >= lo && v <= hi;
    }
  }
}

/** Share of rows with a value for each field — filters on fields with no coverage are disabled in the UI. */
export function fieldCoverage(rows: ScreenRow[]): Record<NumericField, number> {
  const out = {} as Record<NumericField, number>;
  for (const f of SCREEN_FIELDS) {
    const n = rows.filter((r) => r[f.key] != null && Number.isFinite(r[f.key] as number)).length;
    out[f.key] = rows.length ? n / rows.length : 0;
  }
  return out;
}

export function runScreen(rows: ScreenRow[], config: ScreenConfig) {
  let universe = rows;
  if (config.exchanges.length) universe = universe.filter((r) => config.exchanges.includes(r.exchange as "NSE" | "BSE"));
  if (config.types.length) universe = universe.filter((r) => config.types.includes(r.instrumentType as "EQUITY" | "ETF"));
  if (config.sectors.length) universe = universe.filter((r) => r.sector != null && config.sectors.includes(r.sector));

  const matched =
    config.filters.length === 0
      ? universe
      : universe.filter((r) =>
          config.logic === "AND"
            ? config.filters.every((f) => matchesFilter(r, f))
            : config.filters.some((f) => matchesFilter(r, f)),
        );

  const dir = config.sortDir === "asc" ? 1 : -1;
  const key = config.sortBy as keyof ScreenRow;
  const sorted = [...matched].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va == null && vb == null) return a.symbol.localeCompare(b.symbol);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
    return ((va as number) - (vb as number)) * dir || a.symbol.localeCompare(b.symbol);
  });

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / config.pageSize));
  const page = Math.min(config.page, pages);
  return {
    total,
    universe: universe.length,
    page,
    pages,
    rows: sorted.slice((page - 1) * config.pageSize, page * config.pageSize),
    allRows: sorted,
  };
}
