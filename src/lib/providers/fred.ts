import { z } from "zod";
import type { EconomicDataProvider, EconomicSeriesRecord, ProviderHealth } from "@/lib/market/types";
import { ProviderNotConfiguredError } from "@/lib/market/types";
import { ProviderHttpClient, type FetchLike } from "./http";

/**
 * FRED (Federal Reserve Bank of St. Louis) adapter.
 *
 * Endpoints used (documented at https://fred.stlouisfed.org/docs/api/fred/):
 *   GET /fred/series?series_id=…&api_key=…&file_type=json
 *   GET /fred/series/observations?series_id=…&api_key=…&file_type=json&observation_start=…
 *
 * A free API key is required. Use is subject to the FRED API Terms of Use;
 * some series are owned by third parties and carry their own restrictions.
 * This adapter was written against the public documentation and has NOT been
 * exercised against the live service from this development environment.
 */
const BASE = "https://api.stlouisfed.org/fred";

const SeriesSchema = z.object({
  seriess: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        units: z.string(),
        frequency: z.string(),
        last_updated: z.string(),
        notes: z.string().optional(),
      }),
    )
    .min(1),
});

const ObservationsSchema = z.object({
  observations: z.array(z.object({ date: z.string(), value: z.string() })),
});

/** FRED encodes missing observations as ".". */
export function parseFredValue(value: string): number | null {
  if (value.trim() === "." || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "2024-01-11 07:47:02-06" → Date */
export function parseFredTimestamp(value: string): Date | null {
  const m = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})([+-]\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}${m[3]}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const CATEGORY_HINTS: [RegExp, EconomicSeriesRecord["category"]][] = [
  [/^DEX|EXCHANGE/i, "fx"],
  [/^DGS|YIELD|TREASURY/i, "yields"],
  [/CPI|INFLATION|PRICE/i, "inflation"],
  [/UNRATE|EMPLOY/i, "labour"],
  [/GDP/i, "growth"],
  [/FUNDS|RATE/i, "rates"],
];

function categorise(id: string, title: string): EconomicSeriesRecord["category"] {
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(id) || re.test(title)) return cat;
  return "growth";
}

function normaliseFrequency(f: string): EconomicSeriesRecord["frequency"] {
  if (/daily/i.test(f)) return "daily";
  if (/quarter/i.test(f)) return "quarterly";
  return "monthly";
}

export class FredProvider implements EconomicDataProvider {
  readonly id = "fred";
  readonly name = "FRED (St. Louis Fed)";
  readonly defaultStatus = "eod" as const;
  private readonly http: ProviderHttpClient;

  constructor(
    private readonly apiKey: string | undefined,
    private readonly seriesIds: string[],
    fetchImpl?: FetchLike,
    private readonly observationStart = "2015-01-01",
  ) {
    // FRED documents a limit of 120 requests per minute per key.
    this.http = new ProviderHttpClient({ providerId: this.id, burst: 10, perSecond: 1.5, fetchImpl });
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  private url(path: string, params: Record<string, string>) {
    const u = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set("api_key", this.apiKey ?? "");
    u.searchParams.set("file_type", "json");
    return u.toString();
  }

  async fetchSeries(): Promise<EconomicSeriesRecord[]> {
    if (!this.apiKey) throw new ProviderNotConfiguredError(this.id, "FRED_API_KEY");
    const out: EconomicSeriesRecord[] = [];
    for (const id of this.seriesIds) {
      const meta = await this.http.getJson(this.url("/series", { series_id: id }), SeriesSchema);
      const obs = await this.http.getJson(
        this.url("/series/observations", { series_id: id, observation_start: this.observationStart }),
        ObservationsSchema,
      );
      const s = meta.seriess[0]!;
      out.push({
        id: `FRED_${id}`,
        name: s.title,
        country: /^DEXIN/.test(id) ? "India" : "United States",
        category: categorise(id, s.title),
        unit: s.units,
        frequency: normaliseFrequency(s.frequency),
        sourceSeriesId: id,
        description: `FRED series ${id}. Source: Federal Reserve Bank of St. Louis.`,
        publishedAt: parseFredTimestamp(s.last_updated),
        observations: obs.observations.map((o) => ({ periodDate: o.date, value: parseFredValue(o.value) })),
      });
    }
    return out;
  }

  async healthCheck(): Promise<ProviderHealth> {
    const started = Date.now();
    if (!this.apiKey) {
      return { ok: false, checkedAt: new Date(), message: "Not configured (FRED_API_KEY missing)", latencyMs: null };
    }
    try {
      await this.http.getJson(this.url("/series", { series_id: this.seriesIds[0] ?? "FEDFUNDS" }), SeriesSchema);
      return { ok: true, checkedAt: new Date(), message: "Reachable", latencyMs: Date.now() - started };
    } catch (err) {
      return {
        ok: false,
        checkedAt: new Date(),
        message: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - started,
      };
    }
  }
}
