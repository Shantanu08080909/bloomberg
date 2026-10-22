import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import * as s from "./schema";
import {
  ensureDataSources,
  finishRun,
  insertCorporateActions,
  insertSampleEvents,
  startRun,
  upsertBars,
  upsertEconomicSeries,
  upsertFundamentals,
  upsertIndices,
  upsertInstruments,
  upsertNews,
  upsertQuotes,
  upsertStatements,
} from "@/lib/ingest";
import { generateDemoDataset, listingKey } from "@/lib/providers/demo/generator";
import { refreshTechnicalSnapshots } from "@/lib/eod/technicals";

export async function isDemoSeeded(db: Database): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.priceBars)
    .where(eq(s.priceBars.sourceId, "demo"));
  return (row?.n ?? 0) > 0;
}

/** Load the deterministic demo dataset. Safe to run repeatedly. */
export async function seedDemo(db: Database, log: (msg: string) => void = () => {}) {
  await ensureDataSources(db);
  const data = generateDemoDataset();
  const runId = await startRun(db, "demo", "all");
  try {
    log(`Instruments: ${data.instruments.length}`);
    const ids = await upsertInstruments(db, "demo", data.instruments);
    let bars = 0;
    for (const inst of data.instruments) {
      const id = ids.get(`${inst.exchange}:${inst.symbol}`)!;
      bars += await upsertBars(db, "demo", id, data.bars.get(listingKey(inst.exchange, inst.symbol)) ?? []);
    }
    log(`Price bars: ${bars}`);
    await upsertQuotes(db, "demo", ids, data.quotes);
    await upsertFundamentals(db, "demo", ids, data.fundamentals);
    await upsertStatements(db, "demo", ids, data.statements);
    await insertCorporateActions(db, "demo", ids, data.corporateActions);
    await upsertIndices(db, ids, data.indices);
    await upsertNews(db, "demo", data.news);
    const obs = await upsertEconomicSeries(db, "demo", data.economic);
    await insertSampleEvents(db, "demo", data.events);
    log(`Economic observations: ${obs}; news: ${data.news.length}; events: ${data.events.length}`);
    await refreshTechnicalSnapshots(db, "demo");
    await finishRun(db, runId, "demo", { status: "success", recordCount: bars });
  } catch (err) {
    await finishRun(db, runId, "demo", {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Remove demo market data (user-owned records referencing it are cascaded). */
export async function removeDemoData(db: Database) {
  await db.delete(s.newsArticles).where(eq(s.newsArticles.sourceId, "demo"));
  await db.delete(s.economicSeries).where(eq(s.economicSeries.sourceId, "demo"));
  await db.delete(s.economicEvents).where(and(eq(s.economicEvents.sourceId, "demo"), eq(s.economicEvents.isSample, true)));
  await db.delete(s.priceBars).where(eq(s.priceBars.sourceId, "demo"));
  await db.delete(s.quotes).where(eq(s.quotes.sourceId, "demo"));
}

export interface SetupResult {
  migrated: boolean;
  seeded: boolean;
}

/** Apply migrations and, if needed, load demo data. */
export async function setupDatabase(
  handle: { db: Database; migrate: () => Promise<void> },
  log: (msg: string) => void = () => {},
): Promise<SetupResult> {
  log("Applying migrations…");
  await handle.migrate();
  await ensureDataSources(handle.db);
  if (await isDemoSeeded(handle.db)) {
    log("Demo data already present.");
    return { migrated: true, seeded: false };
  }
  log("Loading deterministic demo data…");
  await seedDemo(handle.db, log);
  return { migrated: true, seeded: true };
}
