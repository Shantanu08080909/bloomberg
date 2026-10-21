import type { DataStatus, DisplayStatus } from "./types";

export interface FreshnessThresholds {
  liveMinutes: number;
  delayedMinutes: number;
  eodHours: number;
}

export const DEFAULT_THRESHOLDS: FreshnessThresholds = { liveMinutes: 15, delayedMinutes: 60, eodHours: 96 };

const positive = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Thresholds from STALE_AFTER_* environment variables (server), else defaults. */
export function thresholdsFromEnv(env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}): FreshnessThresholds {
  return {
    liveMinutes: positive(env.STALE_AFTER_MINUTES_LIVE, DEFAULT_THRESHOLDS.liveMinutes),
    delayedMinutes: positive(env.STALE_AFTER_MINUTES_DELAYED, DEFAULT_THRESHOLDS.delayedMinutes),
    eodHours: positive(env.STALE_AFTER_HOURS_EOD, DEFAULT_THRESHOLDS.eodHours),
  };
}

/**
 * Decide what label a record gets in the UI. Demo data is always "demo"
 * (it never becomes "live" or "stale"); real data older than its threshold is
 * "stale"; a missing record is "unavailable".
 */
export function classifyFreshness(
  status: DataStatus | string | null | undefined,
  asOf: Date | string | null | undefined,
  now: Date = new Date(),
  t: FreshnessThresholds = thresholdsFromEnv(),
): DisplayStatus {
  if (!status) return "unavailable";
  if (status === "demo") return "demo";
  if (!asOf) return "unavailable";
  const ts = typeof asOf === "string" ? new Date(asOf) : asOf;
  if (Number.isNaN(ts.getTime())) return "unavailable";
  const ageMin = (now.getTime() - ts.getTime()) / 60_000;
  switch (status) {
    case "live":
      return ageMin > t.liveMinutes ? "stale" : "live";
    case "delayed":
      return ageMin > t.delayedMinutes ? "stale" : "delayed";
    case "eod":
      return ageMin > t.eodHours * 60 ? "stale" : "eod";
    default:
      return "unavailable";
  }
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  demo: "DEMO",
  live: "LIVE",
  delayed: "DELAYED",
  eod: "END OF DAY",
  stale: "STALE",
  unavailable: "UNAVAILABLE",
};

export const STATUS_DESCRIPTION: Record<DisplayStatus, string> = {
  demo: "Synthetic demo data about fictional companies — not real market prices.",
  live: "Real-time data from a configured provider.",
  delayed: "Delayed data from a configured provider.",
  eod: "End-of-day data from a configured provider.",
  stale: "Data from a configured provider that is older than its freshness threshold.",
  unavailable: "No data is available from any configured source.",
};

/** Combine several statuses into one banner state; mixed statuses are reported as such. */
export function summariseStatuses(statuses: DisplayStatus[]): { primary: DisplayStatus; mixed: boolean } {
  const unique = [...new Set(statuses)];
  if (unique.length === 0) return { primary: "unavailable", mixed: false };
  const priority: DisplayStatus[] = ["demo", "stale", "unavailable", "delayed", "eod", "live"];
  const primary = priority.find((p) => unique.includes(p)) ?? unique[0]!;
  return { primary, mixed: unique.length > 1 };
}
