import { z } from "zod";

/** How a record was obtained. Never mix these silently. */
export const DATA_STATUSES = ["demo", "live", "delayed", "eod"] as const;
export type DataStatus = (typeof DATA_STATUSES)[number];

/** What the UI shows after freshness checks are applied. */
export type DisplayStatus = DataStatus | "stale" | "unavailable";

export const ExchangeSchema = z.enum(["NSE", "BSE", "INDEX"]);
export type Exchange = z.infer<typeof ExchangeSchema>;

export const InstrumentTypeSchema = z.enum(["EQUITY", "INDEX", "ETF"]);

export const InstrumentRecordSchema = z.object({
  symbol: z.string().min(1).max(40),
  exchange: ExchangeSchema,
  name: z.string().min(1),
  isin: z.string().nullable(),
  exchangeCode: z.string().nullable(),
  issuerKey: z.string().nullable(),
  instrumentType: InstrumentTypeSchema,
  sector: z.string().nullable(),
  industry: z.string().nullable(),
  currency: z.string().length(3),
  description: z.string().nullable(),
  listedSince: z.string().nullable(),
});
export type InstrumentRecord = z.infer<typeof InstrumentRecordSchema>;

export const QuoteRecordSchema = z.object({
  symbol: z.string(),
  exchange: ExchangeSchema,
  price: z.number().finite().positive(),
  open: z.number().finite().nullable(),
  high: z.number().finite().nullable(),
  low: z.number().finite().nullable(),
  prevClose: z.number().finite().nullable(),
  change: z.number().finite().nullable(),
  changePct: z.number().finite().nullable(),
  volume: z.number().int().nonnegative().nullable(),
  asOf: z.date(),
  dataStatus: z.enum(DATA_STATUSES),
});
export type QuoteRecord = z.infer<typeof QuoteRecordSchema>;

export const PriceBarSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    open: z.number().finite().positive(),
    high: z.number().finite().positive(),
    low: z.number().finite().positive(),
    close: z.number().finite().positive(),
    volume: z.number().int().nonnegative(),
  })
  .refine((b) => b.high >= Math.max(b.open, b.close) && b.low <= Math.min(b.open, b.close), {
    message: "Inconsistent OHLC values",
  });
export type PriceBar = z.infer<typeof PriceBarSchema>;

export interface FundamentalsRecord {
  symbol: string;
  exchange: Exchange;
  asOf: string;
  marketCapCr: number | null;
  sharesOutstanding: number | null;
  pe: number | null;
  pb: number | null;
  eps: number | null;
  bookValuePerShare: number | null;
  roe: number | null;
  debtToEquity: number | null;
  dividendYield: number | null;
  revenueGrowth: number | null;
  profitGrowth: number | null;
}

export interface FinancialStatementRecord {
  symbol: string;
  exchange: Exchange;
  statementType: "income" | "balance" | "cashflow";
  fiscalYear: number;
  unit: "crore";
  lineItems: Record<string, number | null>;
}

export interface CorporateActionRecord {
  symbol: string;
  exchange: Exchange;
  actionType: "DIVIDEND" | "SPLIT" | "BONUS" | "RIGHTS";
  exDate: string;
  recordDate: string | null;
  details: Record<string, number | string>;
  description: string;
}

export interface IndexRecord {
  instrument: InstrumentRecord;
  family: string;
  baseValue: number;
  baseDate: string;
  methodology: string;
  constituents: { symbol: string; exchange: Exchange; weight: number }[];
}

export interface NewsRecord {
  externalId: string;
  title: string;
  summary: string | null;
  url: string | null;
  publisher: string;
  publishedAt: Date;
  categories: string[];
  tickers: string[];
  isSample: boolean;
}

export interface EconomicSeriesRecord {
  id: string;
  name: string;
  country: string;
  category: "rates" | "inflation" | "growth" | "fx" | "yields" | "production" | "labour";
  unit: string;
  frequency: "daily" | "monthly" | "quarterly";
  sourceSeriesId: string | null;
  description: string;
  publishedAt: Date | null;
  observations: { periodDate: string; value: number | null }[];
}

export interface EconomicEventRecord {
  title: string;
  country: string;
  scheduledAt: Date;
  importance: "low" | "medium" | "high";
  notes: string | null;
  isSample: boolean;
}

export interface ProviderHealth {
  ok: boolean;
  checkedAt: Date;
  message: string;
  latencyMs: number | null;
}

export interface ProviderCapabilities {
  search: boolean;
  metadata: boolean;
  quotes: boolean;
  bars: boolean;
  indices: boolean;
  fundamentals: boolean;
  statements: boolean;
  corporateActions: boolean;
}

/** Provider-independent interface for market data sources. */
export interface MarketDataProvider {
  readonly id: string;
  readonly name: string;
  readonly defaultStatus: DataStatus;
  readonly capabilities: ProviderCapabilities;
  /** Whether credentials/config needed to call the source are present. */
  isConfigured(): boolean;
  searchInstruments(query: string): Promise<InstrumentRecord[]>;
  getInstrument(symbol: string, exchange: Exchange): Promise<InstrumentRecord | null>;
  getQuotes(refs: { symbol: string; exchange: Exchange }[]): Promise<QuoteRecord[]>;
  getBars(symbol: string, exchange: Exchange, from: string, to: string): Promise<PriceBar[]>;
  getIndices(): Promise<IndexRecord[]>;
  getFundamentals(symbol: string, exchange: Exchange): Promise<FundamentalsRecord | null>;
  getFinancialStatements(symbol: string, exchange: Exchange): Promise<FinancialStatementRecord[]>;
  getCorporateActions(symbol: string, exchange: Exchange): Promise<CorporateActionRecord[]>;
  healthCheck(): Promise<ProviderHealth>;
}

export interface NewsProvider {
  readonly id: string;
  readonly name: string;
  isConfigured(): boolean;
  fetchLatest(): Promise<NewsRecord[]>;
  healthCheck(): Promise<ProviderHealth>;
}

export interface EconomicDataProvider {
  readonly id: string;
  readonly name: string;
  readonly defaultStatus: DataStatus;
  isConfigured(): boolean;
  fetchSeries(): Promise<EconomicSeriesRecord[]>;
  healthCheck(): Promise<ProviderHealth>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly providerId: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export class ProviderNotConfiguredError extends ProviderError {
  constructor(providerId: string, missing: string) {
    super(`${providerId} is not configured: set ${missing}`, providerId, false);
    this.name = "ProviderNotConfiguredError";
  }
}
