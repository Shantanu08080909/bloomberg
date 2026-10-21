export const IST_TZ = "Asia/Kolkata";

/** Parse a YYYY-MM-DD string as a UTC date at midnight. */
export function parseISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const d = parseISODate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function addYears(value: string, years: number): string {
  const d = parseISODate(value);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return toISODate(d);
}

export function isWeekday(value: string): boolean {
  const day = parseISODate(value).getUTCDay();
  return day !== 0 && day !== 6;
}

/** Weekdays between two dates inclusive. Exchange holidays are not modelled. */
export function weekdaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isWeekday(d)) out.push(d);
  }
  return out;
}

/** Convert an IST wall-clock time on a date to a UTC Date. */
export function istDateTime(dateISO: string, hh: number, mm: number): Date {
  const d = parseISODate(dateISO);
  return new Date(d.getTime() + (hh * 60 + mm - 330) * 60_000);
}

export function formatIST(
  date: Date | string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST_TZ, ...opts }).format(d);
}

export function formatISTDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? parseISODate(date) : new Date(date);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? "UTC" : IST_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export type MarketSession = "pre-open" | "open" | "closed";

/**
 * NSE/BSE regular session by clock only: pre-open 09:00–09:15, normal market
 * 09:15–15:30 IST, Monday–Friday. Exchange holidays are NOT considered.
 */
export function marketSessionAt(now: Date): MarketSession {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return "closed";
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (minutes >= 9 * 60 && minutes < 9 * 60 + 15) return "pre-open";
  if (minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 30) return "open";
  return "closed";
}

export const RANGE_OPTIONS = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "MAX"] as const;
export type RangeOption = (typeof RANGE_OPTIONS)[number];

export function rangeStart(range: RangeOption, end: string): string | null {
  switch (range) {
    case "1M":
      return addDays(end, -31);
    case "3M":
      return addDays(end, -92);
    case "6M":
      return addDays(end, -183);
    case "YTD":
      return `${end.slice(0, 4)}-01-01`;
    case "1Y":
      return addYears(end, -1);
    case "3Y":
      return addYears(end, -3);
    case "MAX":
      return null;
  }
}
