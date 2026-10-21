import "server-only";
import { eq, sql } from "drizzle-orm";
import { csvList, getConfig } from "@/lib/config";
import { addDays, toISODate } from "@/lib/dates";
import type { Database } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import {
  finishRun,
  startRun,
  upsertBars,
  upsertEconomicSeries,
  upsertInstruments,
  upsertNews,
  upsertQuotes,
} from "@/lib/ingest";
import { redactUrl } from "@/lib/providers/http";
import { getProviders } from "@/lib/providers/registry";

export type RefreshableSource = "demo" | "alphavantage" | "fred" | "rss";

export interface RefreshOutcome {
  sourceId: string;
  status: "success" | "error" | "skipped";
  records: number;
  message: string;
}

/** Keep `data_sources.enabled` in line with what is configured in the environment. */
export async function syncSourceConfiguration(db: Database) {
  const c = getConfig();
  const enabled: Record<string, boolean> = {
    demo: true,
    user: true,
    alphavantage: Boolean(c.ALPHAVANTAGE_API_KEY),
    fred: Boolean(c.FRED_API_KEY),
    rss: csvList(c.NEWS_RSS_FEEDS).length > 0,
  };
  for (const [id, on] of Object.entries(enabled)) {
    await db.update(s.dataSources).set({ enabled: on }).where(eq(s.dataSources.id, id));
  }
}

function errMessage(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  // Never persist a URL with credentials in it.
  return msg.replace(/https?:\/\/\S+/g, (u) => redactUrl(u));
}

export async function refreshSource(db: Database, sourceId: RefreshableSource): Promise<RefreshOutcome> {
  const providers = getProviders();
  const c = getConfig();
  if (sourceId === "demo") {
    return { sourceId, status: "skipped", records: 0, message: "Demo data is deterministic and static; nothing to refresh. Use `npm run db:seed` to reload it." };
  }

  const runId = await startRun(db, sourceId, sourceId === "fred" ? "economic" : sourceId === "rss" ? "news" : "market");
  try {
    let records = 0;
    if (sourceId === "fred") {
      const p = providers.economic.fred;
      if (!p.isConfigured()) throw new Error("FRED_API_KEY is not set");
      records = await upsertEconomicSeries(db, "fred", await p.fetchSeries());
    } else if (sourceId === "rss") {
      const p = providers.news.rss;
      if (!p.isConfigured()) throw new Error("NEWS_RSS_FEEDS is empty");
      records = await upsertNews(db, "rss", await p.fetchLatest());
    } else if (sourceId === "alphavantage") {
      const p = providers.market.alphavantage;
      if (!p.isConfigured()) throw new Error("ALPHAVANTAGE_API_KEY is not set");
      const symbols = csvList(c.ALPHAVANTAGE_SYMBOLS).map((x) => x.toUpperCase());
      if (symbols.length === 0) throw new Error("ALPHAVANTAGE_SYMBOLS is empty — list the BSE symbols to track");
      const refs = symbols.map((symbol) => ({ symbol, exchange: "BSE" as const }));
      const ids = await upsertInstruments(
        db,
        "alphavantage",
        refs.map((r) => ({
          symbol: r.symbol,
          exchange: r.exchange,
          name: r.symbol,
          isin: null,
          exchangeCode: null,
          issuerKey: null,
          instrumentType: "EQUITY",
          sector: null,
          industry: null,
          currency: "INR",
          description: "Instrument tracked through the Alpha Vantage adapter. Metadata beyond the symbol is not provided by this adapter.",
          listedSince: null,
        })),
      );
      records += await upsertQuotes(db, "alphavantage", ids, await p.getQuotes(refs));
      const to = toISODate(new Date());
      const from = addDays(to, -150);
      for (const r of refs) {
        const id = ids.get(`BSE:${r.symbol}`);
        if (id) records += await upsertBars(db, "alphavantage", id, await p.getBars(r.symbol, "BSE", from, to));
      }
    }
    await finishRun(db, runId, sourceId, { status: "success", recordCount: records });
    return { sourceId, status: "success", records, message: `Stored ${records} record(s)` };
  } catch (err) {
    const message = errMessage(err);
    await finishRun(db, runId, sourceId, { status: "error", message });
    return { sourceId, status: "error", records: 0, message };
  }
}

export async function listRefreshRuns(db: Database, limit = 30) {
  return db.select().from(s.dataRefreshRuns).orderBy(sql`${s.dataRefreshRuns.startedAt} desc`).limit(limit);
}

export async function listDataSources(db: Database) {
  return db.select().from(s.dataSources).orderBy(s.dataSources.id);
}

export async function getAppState(db: Database, key: string) {
  const [row] = await db.select().from(s.appState).where(eq(s.appState.key, key));
  return row ?? null;
}

export async function setAppState(db: Database, key: string, value: Record<string, unknown>) {
  await db
    .insert(s.appState)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: s.appState.key, set: { value, updatedAt: new Date() } });
}
