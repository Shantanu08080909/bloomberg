import { z } from "zod";
import { istDateTime } from "@/lib/dates";
import {
  ProviderError,
  ProviderNotConfiguredError,
  type DataStatus,
  type Exchange,
  type InstrumentRecord,
  type MarketDataProvider,
  type PriceBar,
  type ProviderHealth,
  type QuoteRecord,
} from "@/lib/market/types";
import { ProviderHttpClient, type FetchLike } from "./http";

/**
 * Alpha Vantage adapter (https://www.alphavantage.co/documentation/).
 *
 * Functions used: SYMBOL_SEARCH, GLOBAL_QUOTE, TIME_SERIES_DAILY.
 * The documentation shows BSE equities addressed as e.g. "XXXX.BSE".
 * NSE coverage is not assumed; NSE listings are reported as unsupported.
 *
 * The free tier is heavily rate limited (configure ALPHAVANTAGE_DAILY_LIMIT)
 * and its terms govern display and redistribution. This adapter was written
 * against the public documentation and has NOT been exercised against the live
 * service from this development environment. It provides quotes and daily
 * bars only; fundamentals, statements and corporate actions are not mapped.
 */
const BASE = "https://www.alphavantage.co/query";

const num = z.string().transform((v, ctx) => {
  const n = Number(v.replace("%", ""));
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: "custom", message: `not a number: ${v}` });
    return z.NEVER;
  }
  return n;
});

const ThrottleSchema = z.object({
  Note: z.string().optional(),
  Information: z.string().optional(),
  "Error Message": z.string().optional(),
});

const SearchSchema = z.object({
  bestMatches: z.array(
    z.object({
      "1. symbol": z.string(),
      "2. name": z.string(),
      "3. type": z.string(),
      "4. region": z.string(),
      "8. currency": z.string(),
    }),
  ),
});

const QuoteSchema = z.object({
  "Global Quote": z.object({
    "01. symbol": z.string(),
    "02. open": num,
    "03. high": num,
    "04. low": num,
    "05. price": num,
    "06. volume": num,
    "07. latest trading day": z.string(),
    "08. previous close": num,
    "09. change": num,
    "10. change percent": num,
  }),
});

const DailySchema = z.object({
  "Time Series (Daily)": z.record(
    z.string(),
    z.object({
      "1. open": num,
      "2. high": num,
      "3. low": num,
      "4. close": num,
      "5. volume": num,
    }),
  ),
});

export function toAlphaVantageSymbol(symbol: string, exchange: Exchange): string | null {
  if (exchange === "BSE") return `${symbol}.BSE`;
  return null;
}

export function fromAlphaVantageSymbol(avSymbol: string): { symbol: string; exchange: Exchange } | null {
  const m = avSymbol.match(/^(.+)\.BSE$/i);
  if (!m) return null;
  return { symbol: m[1]!.toUpperCase(), exchange: "BSE" };
}

export class AlphaVantageProvider implements MarketDataProvider {
  readonly id = "alphavantage";
  readonly name = "Alpha Vantage";
  readonly capabilities = {
    search: true,
    metadata: false,
    quotes: true,
    bars: true,
    indices: false,
    fundamentals: false,
    statements: false,
    corporateActions: false,
  };
  private readonly http: ProviderHttpClient;

  constructor(
    private readonly apiKey: string | undefined,
    readonly defaultStatus: DataStatus = "eod",
    dailyLimit = 25,
    fetchImpl?: FetchLike,
  ) {
    this.http = new ProviderHttpClient({
      providerId: this.id,
      burst: Math.min(5, dailyLimit),
      perSecond: dailyLimit / 86_400,
      fetchImpl,
      policy: { retries: 1 },
    });
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  private async call<T>(params: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
    if (!this.apiKey) throw new ProviderNotConfiguredError(this.id, "ALPHAVANTAGE_API_KEY");
    const u = new URL(BASE);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set("apikey", this.apiKey);
    const raw = await this.http.getJson(u.toString(), z.unknown());
    const throttle = ThrottleSchema.safeParse(raw);
    if (throttle.success) {
      const msg = throttle.data["Error Message"] ?? throttle.data.Note ?? throttle.data.Information;
      if (msg) throw new ProviderError(`Alpha Vantage: ${msg}`, this.id, Boolean(throttle.data.Note));
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new ProviderError("Alpha Vantage returned an unexpected response shape", this.id, false);
    }
    return parsed.data;
  }

  async searchInstruments(query: string): Promise<InstrumentRecord[]> {
    const res = await this.call({ function: "SYMBOL_SEARCH", keywords: query }, SearchSchema);
    return res.bestMatches.flatMap((m) => {
      const ref = fromAlphaVantageSymbol(m["1. symbol"]);
      if (!ref) return [];
      return [
        {
          symbol: ref.symbol,
          exchange: ref.exchange,
          name: m["2. name"],
          isin: null,
          exchangeCode: null,
          issuerKey: null,
          instrumentType: /etf/i.test(m["3. type"]) ? ("ETF" as const) : ("EQUITY" as const),
          sector: null,
          industry: null,
          currency: m["8. currency"].slice(0, 3).toUpperCase(),
          description: null,
          listedSince: null,
        },
      ];
    });
  }

  async getInstrument(symbol: string, exchange: Exchange) {
    const results = await this.searchInstruments(symbol);
    return results.find((r) => r.symbol === symbol && r.exchange === exchange) ?? null;
  }

  async getQuotes(refs: { symbol: string; exchange: Exchange }[]): Promise<QuoteRecord[]> {
    const out: QuoteRecord[] = [];
    for (const ref of refs) {
      const av = toAlphaVantageSymbol(ref.symbol, ref.exchange);
      if (!av) continue;
      const q = (await this.call({ function: "GLOBAL_QUOTE", symbol: av }, QuoteSchema))["Global Quote"];
      out.push({
        symbol: ref.symbol,
        exchange: ref.exchange,
        price: q["05. price"],
        open: q["02. open"],
        high: q["03. high"],
        low: q["04. low"],
        prevClose: q["08. previous close"],
        change: q["09. change"],
        changePct: q["10. change percent"],
        volume: Math.round(q["06. volume"]),
        // Only the trading day is reported; the close time is assumed.
        asOf: istDateTime(q["07. latest trading day"], 15, 30),
        dataStatus: this.defaultStatus,
      });
    }
    return out;
  }

  async getBars(symbol: string, exchange: Exchange, from: string, to: string): Promise<PriceBar[]> {
    const av = toAlphaVantageSymbol(symbol, exchange);
    if (!av) throw new ProviderError(`${exchange} listings are not supported by this adapter`, this.id, false);
    const res = await this.call(
      { function: "TIME_SERIES_DAILY", symbol: av, outputsize: "compact" },
      DailySchema,
    );
    return Object.entries(res["Time Series (Daily)"])
      .filter(([d]) => d >= from && d <= to)
      .map(([date, b]) => ({
        date,
        open: b["1. open"],
        high: b["2. high"],
        low: b["3. low"],
        close: b["4. close"],
        volume: Math.round(b["5. volume"]),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getIndices() {
    return [];
  }
  async getFundamentals() {
    return null;
  }
  async getFinancialStatements() {
    return [];
  }
  async getCorporateActions() {
    return [];
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      ok: this.isConfigured(),
      checkedAt: new Date(),
      message: this.isConfigured()
        ? "Configured. No live check is made automatically to conserve the daily request quota."
        : "Not configured (ALPHAVANTAGE_API_KEY missing)",
      latencyMs: null,
    };
  }
}
