import "server-only";
import { getConfig } from "@/lib/config";
import { checkAlerts } from "@/lib/services/alerts-engine";
import { getAppState, listDataSources, refreshSource, setAppState, syncSourceConfiguration, type RefreshableSource } from "@/lib/services/refresh";
import { db } from "./db";
import { sendEmail } from "./email";

const g = globalThis as unknown as { __ofScheduler?: NodeJS.Timeout; __ofTickRunning?: boolean };

export const SCHEDULER_KEY = "scheduler";

/** One scheduler pass: check alerts and refresh any configured real sources that are due. */
export async function schedulerTick() {
  if (g.__ofTickRunning) return;
  g.__ofTickRunning = true;
  const started = new Date();
  try {
    const database = await db();
    const alerts = await checkAlerts(database, { sendEmail });
    const sources = await listDataSources(database);
    const refreshed: string[] = [];
    for (const src of sources) {
      if (!src.enabled || src.refreshIntervalMinutes <= 0 || !["alphavantage", "fred", "rss"].includes(src.id)) continue;
      const last = Math.max(src.lastSuccessAt?.getTime() ?? 0, src.lastErrorAt?.getTime() ?? 0);
      if (Date.now() - last < src.refreshIntervalMinutes * 60_000) continue;
      await refreshSource(database, src.id as RefreshableSource);
      refreshed.push(src.id);
    }
    await setAppState(database, SCHEDULER_KEY, {
      lastTickAt: started.toISOString(),
      intervalSeconds: getConfig().ALERT_CHECK_INTERVAL_SECONDS,
      pid: process.pid,
      alerts,
      refreshed,
    });
  } catch (err) {
    console.error("[scheduler] tick failed", err instanceof Error ? err.message : err);
  } finally {
    g.__ofTickRunning = false;
  }
}

export async function startScheduler() {
  const c = getConfig();
  if (c.SCHEDULER_ENABLED !== "true" || g.__ofScheduler) return;
  try {
    await syncSourceConfiguration(await db());
  } catch (err) {
    console.error("[scheduler] database not ready; scheduler not started:", err instanceof Error ? err.message : err);
    return;
  }
  const ms = c.ALERT_CHECK_INTERVAL_SECONDS * 1000;
  g.__ofScheduler = setInterval(() => void schedulerTick(), ms);
  g.__ofScheduler.unref?.();
  console.log(`[scheduler] started: alert checks every ${c.ALERT_CHECK_INTERVAL_SECONDS}s`);
  void schedulerTick();
}

/** Worker status as recorded in the database (truthful: based on the last heartbeat). */
export async function getSchedulerStatus() {
  const c = getConfig();
  const state = await getAppState(await db(), SCHEDULER_KEY);
  const lastTick = state?.value.lastTickAt ? new Date(String(state.value.lastTickAt)) : null;
  const interval = Number(state?.value.intervalSeconds ?? c.ALERT_CHECK_INTERVAL_SECONDS);
  const running = lastTick != null && Date.now() - lastTick.getTime() < interval * 1000 * 2.5;
  return {
    enabled: c.SCHEDULER_ENABLED === "true",
    running,
    lastTick,
    intervalSeconds: interval,
    lastResult: state?.value ?? null,
  };
}
