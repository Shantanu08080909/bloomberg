import "server-only";
import { cache } from "react";
import { getConfig } from "@/lib/config";
import { formatIST } from "@/lib/dates";
import { classifyFreshness, STATUS_LABEL, summariseStatuses } from "@/lib/market/freshness";
import type { DisplayStatus } from "@/lib/market/types";
import { getMarketDataStatus } from "@/lib/services/market";
import { db } from "./db";

/** Source whose instruments and prices the terminal displays. */
export function getActiveSourceId(): string {
  const c = getConfig();
  if (c.MARKET_DATA_SOURCE === "alphavantage" && c.ALPHAVANTAGE_API_KEY) return "alphavantage";
  return "demo";
}

export function isDemoMode() {
  return getActiveSourceId() === "demo";
}

export const getShellStatus = cache(async () => {
  const sourceId = getActiveSourceId();
  const st = await getMarketDataStatus(await db(), sourceId);
  const now = new Date();
  const display: DisplayStatus[] = st.quoteCount === 0 ? ["unavailable"] : st.statuses.map((s) => classifyFreshness(s, st.lastAsOf, now));
  const { primary, mixed } = summariseStatuses(display);
  return {
    sourceId,
    sourceName: st.sourceName,
    tone: primary,
    label: primary === "demo" ? "Demo data" : STATUS_LABEL[primary],
    lastAsOf: st.lastAsOf ? formatIST(st.lastAsOf) : null,
    lastAsOfDate: st.lastAsOf,
    mixed,
    quoteCount: st.quoteCount,
    lastError: st.lastError,
  };
});
