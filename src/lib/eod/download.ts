/**
 * Optional downloader for official end-of-day files.
 *
 * Disabled unless EOD_DOWNLOAD_ENABLED=true. It requests the public file URLs
 * listed on the exchanges' report pages with an honest User-Agent. It does
 * NOT pre-load cookies, spoof a browser, send a fake Referer, impersonate TLS
 * fingerprints, or retry around 401/403 responses: if an exchange refuses
 * automated access, the run stops and the user is told to download the file
 * manually and import it (Data Provider Status → Import files).
 */
import type { Database } from "@/lib/db/client";
import { addDays, isWeekday, toISODate } from "@/lib/dates";
import { TokenBucket } from "@/lib/rate-limit";
import { importFiles, importedOfficialDates, lastOfficialDate, refreshDerived, type FileResult, type ImportMode } from "./importer";

export const UDIFF_CUTOVER = "2024-07-08";
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export interface DownloadConfig {
  enabled: boolean;
  userAgent: string;
  nseUdiffTemplate: string;
  nseLegacyTemplate: string;
  nseIndexTemplate: string;
  bseUdiffTemplate: string;
  minIntervalSeconds: number;
  maxDaysPerRun: number;
  /** Earliest IST time at which today's file is expected. */
  publishAfterIst: string;
  includeIndices: boolean;
}

export function downloadConfig(env: NodeJS.ProcessEnv = process.env): DownloadConfig {
  return {
    enabled: env.EOD_DOWNLOAD_ENABLED === "true",
    userAgent: env.EOD_USER_AGENT || "OpenFinanceTerminal/1.0 (personal end-of-day import; +https://github.com/Shantanu08080909/bloomberg)",
    nseUdiffTemplate: env.EOD_NSE_UDIFF_URL || "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{YYYYMMDD}_F_0000.csv.zip",
    nseLegacyTemplate: env.EOD_NSE_LEGACY_URL || "https://archives.nseindia.com/content/historical/EQUITIES/{YYYY}/{MON}/cm{DD}{MON}{YYYY}bhav.csv.zip",
    nseIndexTemplate: env.EOD_NSE_INDEX_URL || "https://nsearchives.nseindia.com/content/indices/ind_close_all_{DDMMYYYY}.csv",
    bseUdiffTemplate: env.EOD_BSE_UDIFF_URL || "https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_{YYYYMMDD}_F_0000.CSV",
    minIntervalSeconds: Math.max(1, Number(env.EOD_MIN_INTERVAL_SECONDS || 3)),
    maxDaysPerRun: Math.max(1, Math.min(400, Number(env.EOD_MAX_DAYS_PER_RUN || 60))),
    publishAfterIst: env.EOD_PUBLISH_AFTER_IST || "19:00",
    includeIndices: env.EOD_NSE_INDICES !== "false",
  };
}

export function fillTemplate(tpl: string, isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return tpl
    .replaceAll("{YYYYMMDD}", `${y}${m}${d}`)
    .replaceAll("{DDMMYYYY}", `${d}${m}${y}`)
    .replaceAll("{YYYY}", y!)
    .replaceAll("{MON}", MON[Number(m) - 1]!)
    .replaceAll("{MM}", m!)
    .replaceAll("{DD}", d!);
}

export type Exchange = "NSE" | "BSE";

export function fileUrls(exchange: Exchange, isoDate: string, cfg: DownloadConfig): { kind: "equity" | "index"; url: string }[] {
  if (exchange === "BSE") {
    // Legacy BSE files identify securities by scrip code only; not supported for automated backfill.
    return isoDate >= UDIFF_CUTOVER ? [{ kind: "equity", url: fillTemplate(cfg.bseUdiffTemplate, isoDate) }] : [];
  }
  const out: { kind: "equity" | "index"; url: string }[] = [
    { kind: "equity", url: fillTemplate(isoDate >= UDIFF_CUTOVER ? cfg.nseUdiffTemplate : cfg.nseLegacyTemplate, isoDate) },
  ];
  if (cfg.includeIndices) out.push({ kind: "index", url: fillTemplate(cfg.nseIndexTemplate, isoDate) });
  return out;
}

export class DownloadBlockedError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`The exchange refused automated access (HTTP ${status}) for ${url}. Download the file in your browser and import it manually.`);
    this.name = "DownloadBlockedError";
  }
}

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface FetchOutcome {
  url: string;
  status: "ok" | "missing" | "error";
  httpStatus: number | null;
  bytes?: Uint8Array;
  message: string;
}

const g = globalThis as unknown as { __ofEodBucket?: TokenBucket };

export async function fetchOfficialFile(url: string, cfg: DownloadConfig, fetchImpl: FetchFn = fetch, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))): Promise<FetchOutcome> {
  const bucket = (g.__ofEodBucket ??= new TokenBucket(1, 1 / cfg.minIntervalSeconds));
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = bucket.waitTime();
    if (wait > 0) await sleep(wait);
    bucket.tryTake();
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { "User-Agent": cfg.userAgent, Accept: "text/csv, application/zip, application/octet-stream, */*" }, signal: AbortSignal.timeout(45_000), redirect: "follow" });
    } catch (err) {
      if (attempt === 0) continue;
      return { url, status: "error", httpStatus: null, message: `Network error: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (res.status === 401 || res.status === 403) throw new DownloadBlockedError(url, res.status);
    if (res.status === 404) return { url, status: "missing", httpStatus: 404, message: "No file published for this date (holiday, weekend or not yet available)" };
    if (res.status >= 500 && attempt === 0) {
      await sleep(5000);
      continue;
    }
    if (!res.ok) return { url, status: "error", httpStatus: res.status, message: `HTTP ${res.status}` };
    const bytes = new Uint8Array(await res.arrayBuffer());
    const head = new TextDecoder().decode(bytes.slice(0, 200)).trimStart();
    if (head.startsWith("<")) return { url, status: "missing", httpStatus: res.status, message: "Server returned a web page instead of a file (holiday, weekend or not yet available)" };
    if (bytes.length < 50) return { url, status: "missing", httpStatus: res.status, message: "Empty response" };
    return { url, status: "ok", httpStatus: res.status, bytes, message: `Downloaded ${bytes.length} bytes` };
  }
  return { url, status: "error", httpStatus: null, message: "Request failed" };
}

/** Current date in India and whether today's files should already be published. */
export function istToday(now = new Date(), publishAfter = "19:00") {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const date = toISODate(ist);
  const [h, m] = publishAfter.split(":").map(Number);
  const published = ist.getUTCHours() * 60 + ist.getUTCMinutes() >= (h ?? 19) * 60 + (m ?? 0);
  return { date, published };
}

export interface DayOutcome {
  exchange: Exchange;
  date: string;
  kind: "equity" | "index";
  url: string;
  status: "imported" | "skipped" | "missing" | "error" | "blocked";
  message: string;
  results?: FileResult[];
}

export interface RunOptions {
  exchanges: Exchange[];
  from: string;
  to: string;
  mode: ImportMode;
  skipImported?: boolean;
  fetchImpl?: FetchFn;
  onProgress?: (o: DayOutcome) => void;
}

/** Download and import each weekday in [from, to] for the given exchanges. */
export async function downloadRange(db: Database, opts: RunOptions, cfg = downloadConfig()): Promise<DayOutcome[]> {
  if (!cfg.enabled) throw new Error("Automated download is disabled. Set EOD_DOWNLOAD_ENABLED=true after reviewing the exchanges' terms of use, or import files manually.");
  const out: DayOutcome[] = [];
  const touched = new Set<number>();
  const today = istToday(new Date(), cfg.publishAfterIst);
  const days: string[] = [];
  for (let d = opts.from; d <= opts.to; d = addDays(d, 1)) {
    if (!isWeekday(d)) continue;
    if (d > today.date || (d === today.date && !today.published)) continue;
    days.push(d);
  }
  if (days.length > cfg.maxDaysPerRun) throw new Error(`${days.length} trading days requested; the limit per run is ${cfg.maxDaysPerRun} (EOD_MAX_DAYS_PER_RUN). Split the backfill into smaller ranges.`);
  try {
    for (const ex of opts.exchanges) {
      const skip = opts.skipImported !== false;
      const done = {
        equity: skip ? await importedOfficialDates(db, ex, opts.from, opts.to, "equity") : new Set<string>(),
        index: skip ? await importedOfficialDates(db, ex, opts.from, opts.to, "index") : new Set<string>(),
      };
      let consecutiveErrors = 0;
      for (const date of days) {
        if (consecutiveErrors >= 3) {
          const o: DayOutcome = { exchange: ex, date, kind: "equity", url: "", status: "error", message: `Stopped: ${ex} failed ${consecutiveErrors} times in a row (unreachable or erroring). Try later or import files manually.` };
          out.push(o);
          opts.onProgress?.(o);
          break;
        }
        const urls = fileUrls(ex, date, cfg);
        if (urls.length === 0) {
          const o: DayOutcome = { exchange: ex, date, kind: "equity", url: "", status: "missing", message: `Automated download of ${ex} files before ${UDIFF_CUTOVER} is not supported; import them manually` };
          out.push(o);
          opts.onProgress?.(o);
          continue;
        }
        for (const f of urls) {
          if (done[f.kind].has(date)) {
            const o: DayOutcome = { exchange: ex, date, kind: f.kind, url: f.url, status: "skipped", message: "Already imported" };
            out.push(o);
            opts.onProgress?.(o);
            continue;
          }
          const fetched = await fetchOfficialFile(f.url, cfg, opts.fetchImpl);
          let o: DayOutcome;
          if (fetched.status !== "ok") {
            o = { exchange: ex, date, kind: f.kind, url: f.url, status: fetched.status === "missing" ? "missing" : "error", message: fetched.message };
          } else {
            const name = decodeURIComponent(f.url.split("/").pop() ?? `${ex}_${date}`);
            const results = await importFiles(db, [{ name, bytes: fetched.bytes! }], { mode: opts.mode, sourceUrl: f.url, deferRefresh: true });
            results.forEach((r) => r.instrumentIds.forEach((id) => touched.add(id)));
            const bad = results.find((r) => r.status === "error");
            const wrongDay = results.find((r) => r.status === "success" && r.dates.length && !r.dates.includes(date));
            o = {
              exchange: ex,
              date,
              kind: f.kind,
              url: f.url,
              status: bad ? "error" : results.every((r) => r.status === "skipped") ? "skipped" : "imported",
              message: bad ? bad.message : wrongDay ? `File contained ${wrongDay.dates.join(", ")}, not ${date}` : results.map((r) => r.message).join("; "),
              results,
            };
          }
          out.push(o);
          opts.onProgress?.(o);
          if (f.kind === "equity") consecutiveErrors = o.status === "error" ? consecutiveErrors + 1 : 0;
          // No point fetching the index file for a day whose equity file failed.
          if (f.kind === "equity" && o.status === "error") break;
        }
      }
    }
  } catch (err) {
    if (err instanceof DownloadBlockedError) {
      const o: DayOutcome = { exchange: err.url.includes("bseindia") ? "BSE" : "NSE", date: "", kind: "equity", url: err.url, status: "blocked", message: err.message };
      out.push(o);
      opts.onProgress?.(o);
    } else throw err;
  } finally {
    if (touched.size) await refreshDerived(db, [...touched]);
  }
  return out;
}

/** Incremental update: from the day after the last imported session up to today. */
export async function dailyUpdate(db: Database, exchanges: Exchange[], opts: { fetchImpl?: FetchFn; onProgress?: (o: DayOutcome) => void; lookbackDays?: number } = {}, cfg = downloadConfig()) {
  const today = istToday(new Date(), cfg.publishAfterIst).date;
  const outcomes: DayOutcome[] = [];
  for (const ex of exchanges) {
    const last = await lastOfficialDate(db, ex);
    const from = last ? addDays(last, 1) : addDays(today, -(opts.lookbackDays ?? 7));
    if (from > today) continue;
    outcomes.push(...(await downloadRange(db, { exchanges: [ex], from, to: today, mode: "daily", fetchImpl: opts.fetchImpl, onProgress: opts.onProgress }, cfg)));
  }
  return outcomes;
}

/* ------------------------------ Tej archive ---------------------------- */

export interface TejConfig {
  enabled: boolean;
  urlTemplate: string;
}

export function tejConfig(env: NodeJS.ProcessEnv = process.env): TejConfig {
  return {
    enabled: env.TEJ_ARCHIVE_ENABLED === "true",
    urlTemplate: env.TEJ_ARCHIVE_URL || "https://data.tejhq.dev/{ex}/year={YYYY}/{ex}_{YYYY}.parquet",
  };
}

export function tejUrl(exchange: Exchange, year: number, cfg = tejConfig()) {
  const ex = exchange.toLowerCase();
  return cfg.urlTemplate.replaceAll("{ex}", ex).replaceAll("{YYYY}", String(year));
}

/** Download one TejHQ yearly archive file and import it (archive mode, never overrides official bars). */
export async function importTejYear(db: Database, exchange: Exchange, year: number, opts: { from?: string; to?: string; fetchImpl?: FetchFn } = {}) {
  const cfg = tejConfig();
  if (!cfg.enabled) throw new Error("The TejHQ archive is disabled. Set TEJ_ARCHIVE_ENABLED=true after reviewing its licence notes in docs/EOD_DATA.md.");
  const url = tejUrl(exchange, year, cfg);
  const res = await (opts.fetchImpl ?? fetch)(url, { headers: { "User-Agent": downloadConfig().userAgent }, signal: AbortSignal.timeout(600_000) });
  if (!res.ok) throw new Error(`TejHQ archive request failed: HTTP ${res.status} for ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return importFiles(db, [{ name: `${exchange.toLowerCase()}_${year}.parquet`, bytes }], { mode: "archive", sourceUrl: url, parse: { exchangeHint: exchange, from: opts.from, to: opts.to } });
}
