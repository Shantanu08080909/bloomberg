/**
 * Parsers for official end-of-day exchange files.
 *
 * Formats (as published by the exchanges; verified against real files where
 * this environment could reach them — see docs/EOD_DATA.md):
 *
 *  - UDiFF Common Bhavcopy (SEBI CMTS layout), NSE and BSE cash market, from
 *    8 July 2024. Files: BhavCopy_NSE_CM_0_0_0_YYYYMMDD_F_0000.csv(.zip),
 *    BhavCopy_BSE_CM_0_0_0_YYYYMMDD_F_0000.CSV. Columns include TradDt, Sgmt,
 *    Src, FinInstrmTp, FinInstrmId, ISIN, TckrSymb, SctySrs, FinInstrmNm,
 *    OpnPric, HghPric, LwPric, ClsPric, LastPric, PrvsClsgPric, TtlTradgVol,
 *    TtlTrfVal, TtlNbOfTxsExctd.
 *  - Legacy NSE equity bhavcopy (cmDDMMMYYYYbhav.csv), before 8 July 2024:
 *    SYMBOL, SERIES, OPEN, HIGH, LOW, CLOSE, LAST, PREVCLOSE, TOTTRDQTY,
 *    TOTTRDVAL, TIMESTAMP[, TOTALTRADES, ISIN].
 *  - NSE index closing values (ind_close_all_DDMMYYYY.csv): "Index Name",
 *    "Index Date", "Open/High/Low/Closing Index Value", "Volume", "Turnover (Rs. Cr.)".
 *  - TejHQ Indian Markets parquet (optional third-party archive), with the
 *    normalised columns date, symbol, series, isin, name, open, high, low,
 *    close, last, prev_close, volume, turnover, trades.
 *
 * Nothing here invents values: unparseable or inconsistent rows are rejected
 * with a reason, and missing optional fields stay null.
 */
import { unzipSync } from "fflate";
import { parseCsv } from "@/lib/csv";

export type EodExchange = "NSE" | "BSE";
export type EodFormat = "nse_udiff" | "bse_udiff" | "nse_legacy" | "nse_index" | "tej_parquet";

export interface EodRow {
  exchange: EodExchange;
  date: string;
  symbol: string;
  series: string | null;
  isin: string | null;
  name: string | null;
  exchangeCode: string | null;
  open: number;
  high: number;
  low: number;
  close: number;
  last: number | null;
  prevClose: number | null;
  volume: number;
  turnover: number | null;
  trades: number | null;
}

export interface IndexRow {
  date: string;
  name: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  turnover: number | null;
}

export interface Rejection {
  line: number;
  reason: string;
}

export interface ParsedFile {
  fileName: string;
  format: EodFormat;
  exchange: EodExchange | null;
  rows: EodRow[];
  indexRows: IndexRow[];
  rowsRead: number;
  /** Rows outside the configured series / instrument type (not errors). */
  filtered: number;
  /** Rows that failed validation. */
  rejected: Rejection[];
  dates: string[];
}

export class EodFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EodFormatError";
  }
}

export const DEFAULT_SERIES: Record<EodExchange, string[]> = {
  // Main board, trade-for-trade and SME segments.
  NSE: ["EQ", "BE", "BZ", "SM", "ST", "SZ"],
  // Equity groups. Debt (F), government securities (G) and other non-equity groups are excluded.
  BSE: ["A", "B", "T", "X", "XT", "M", "MT", "Z", "ZP"],
};

export interface ParseOptions {
  series?: Partial<Record<EodExchange, string[]>>;
  /** For parquet archives whose exchange is not in the data. */
  exchangeHint?: EodExchange;
  /** Keep rows with zero traded volume (default false: no trade happened). */
  keepZeroVolume?: boolean;
  /** Only keep rows on/after/before these dates (archives). */
  from?: string;
  to?: string;
}

const UDIFF_REQUIRED = ["TradDt", "Sgmt", "Src", "FinInstrmTp", "TckrSymb", "SctySrs", "OpnPric", "HghPric", "LwPric", "ClsPric", "TtlTradgVol"];
const LEGACY_REQUIRED = ["SYMBOL", "SERIES", "OPEN", "HIGH", "LOW", "CLOSE", "TOTTRDQTY", "TIMESTAMP"];
const INDEX_REQUIRED = ["Index Name", "Index Date", "Open Index Value", "High Index Value", "Low Index Value", "Closing Index Value"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function num(v: string | undefined | null): number | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (t === "" || t === "-" || t === "NA" || t === "N/A") return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const validDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) && new Date(`${iso}T00:00:00Z`).toISOString().startsWith(iso);

/** "13-JUL-2020", "13-Jul-20" → "2020-07-13". */
export function parseLegacyDate(v: string): string | null {
  const m = v.trim().toUpperCase().match(/^(\d{1,2})-([A-Z]{3})-(\d{2}|\d{4})$/);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2]!);
  if (mon < 0) return null;
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${year}-${String(mon + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return validDate(iso) ? iso : null;
}

/** "30-09-2026" or "30-Sep-2026" → "2026-09-30". */
export function parseIndexDate(v: string): string | null {
  const t = v.trim();
  const a = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (a) {
    const iso = `${a[3]}-${a[2]}-${a[1]}`;
    return validDate(iso) ? iso : null;
  }
  return parseLegacyDate(t);
}

/** Normalise symbols: trim, upper-case, collapse inner whitespace. */
export function normalizeSymbol(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, " ");
}

/** "NIFTY 50" → "NIFTY50", "Nifty Bank" → "NIFTYBANK", "NIFTY MIDCAP 150" → "NIFTYMIDCAP150". */
export function indexSymbol(name: string): string {
  return name
    .toUpperCase()
    .replace(/&/g, "AND")
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 40);
}

export function validateBar(r: Pick<EodRow, "open" | "high" | "low" | "close" | "volume">): string | null {
  for (const k of ["open", "high", "low", "close"] as const) {
    if (!Number.isFinite(r[k]) || r[k] <= 0) return `${k} is missing or not positive`;
  }
  const eps = 1e-6;
  if (r.high + eps < Math.max(r.open, r.close, r.low)) return "high is below open/close/low";
  if (r.low - eps > Math.min(r.open, r.close, r.high)) return "low is above open/close/high";
  if (!Number.isFinite(r.volume) || r.volume < 0 || !Number.isInteger(r.volume)) return "volume is not a non-negative integer";
  return null;
}

function headerIndex(header: string[]) {
  const map = new Map(header.map((h, i) => [h.trim().replace(/^﻿/, ""), i] as const));
  return (name: string) => map.get(name);
}

function requireColumns(header: string[], required: string[], what: string) {
  const idx = headerIndex(header);
  const missing = required.filter((c) => idx(c) === undefined);
  if (missing.length) throw new EodFormatError(`${what}: missing columns ${missing.join(", ")}`);
  return idx;
}

/** Keep the highest-priority series for a (exchange, symbol, date) when a file lists more than one. */
function dedupe(rows: EodRow[], series: Record<EodExchange, string[]>): EodRow[] {
  const best = new Map<string, EodRow>();
  const rank = (r: EodRow) => {
    const i = series[r.exchange].indexOf(r.series ?? "");
    return i < 0 ? 999 : i;
  };
  for (const r of rows) {
    const key = `${r.exchange}|${r.symbol}|${r.date}`;
    const cur = best.get(key);
    if (!cur || rank(r) < rank(cur)) best.set(key, r);
  }
  return [...best.values()];
}

export function detectCsvFormat(header: string[]): "udiff" | "nse_legacy" | "nse_index" | null {
  const h = new Set(header.map((x) => x.trim().replace(/^﻿/, "")));
  if (h.has("TradDt") && h.has("TckrSymb") && h.has("Src")) return "udiff";
  if (h.has("SYMBOL") && h.has("SERIES") && h.has("TIMESTAMP")) return "nse_legacy";
  if (h.has("Index Name") && h.has("Index Date")) return "nse_index";
  return null;
}

function seriesConfig(opts: ParseOptions): Record<EodExchange, string[]> {
  return { NSE: opts.series?.NSE ?? DEFAULT_SERIES.NSE, BSE: opts.series?.BSE ?? DEFAULT_SERIES.BSE };
}

export function parseCsvText(fileName: string, text: string, opts: ParseOptions = {}): ParsedFile {
  const trimmed = text.replace(/^﻿/, "");
  if (/^\s*</.test(trimmed)) throw new EodFormatError(`${fileName}: received an HTML page, not a CSV file (holiday, not yet published, or access refused)`);
  const table = parseCsv(trimmed, 500_000);
  if (table.length === 0) throw new EodFormatError(`${fileName}: file is empty`);
  const header = table[0]!;
  const kind = detectCsvFormat(header);
  if (!kind) throw new EodFormatError(`${fileName}: unrecognised file layout (header starts with: ${header.slice(0, 6).join(", ")})`);
  const body = table.slice(1);
  const series = seriesConfig(opts);
  const rejected: Rejection[] = [];
  let filtered = 0;
  const rows: EodRow[] = [];
  const indexRows: IndexRow[] = [];
  // Held in an object so TypeScript does not narrow it to null across the callbacks below.
  const st: { exchange: EodExchange | null } = { exchange: null };

  if (kind === "udiff") {
    const c = requireColumns(header, UDIFF_REQUIRED, fileName);
    const g = (r: string[], name: string) => {
      const i = c(name);
      return i === undefined ? undefined : r[i];
    };
    body.forEach((r, i) => {
      const line = i + 2;
      const src = (g(r, "Src") ?? "").trim().toUpperCase();
      if (src !== "NSE" && src !== "BSE") return void rejected.push({ line, reason: `unknown source exchange "${src}"` });
      st.exchange ??= src;
      if (src !== st.exchange) return void rejected.push({ line, reason: "file mixes exchanges" });
      if ((g(r, "Sgmt") ?? "").trim() !== "CM" || (g(r, "FinInstrmTp") ?? "").trim() !== "STK") return void filtered++;
      const ser = (g(r, "SctySrs") ?? "").trim().toUpperCase();
      if (!series[src].includes(ser)) return void filtered++;
      const date = (g(r, "TradDt") ?? "").trim();
      if (!validDate(date)) return void rejected.push({ line, reason: `invalid trade date "${date}"` });
      const symbol = normalizeSymbol(g(r, "TckrSymb") ?? "");
      if (!symbol) return void rejected.push({ line, reason: "missing symbol" });
      const row: EodRow = {
        exchange: src,
        date,
        symbol,
        series: ser,
        isin: (g(r, "ISIN") ?? "").trim() || null,
        name: (g(r, "FinInstrmNm") ?? "").trim() || null,
        exchangeCode: (g(r, "FinInstrmId") ?? "").trim() || null,
        open: num(g(r, "OpnPric")) ?? Number.NaN,
        high: num(g(r, "HghPric")) ?? Number.NaN,
        low: num(g(r, "LwPric")) ?? Number.NaN,
        close: num(g(r, "ClsPric")) ?? Number.NaN,
        last: num(g(r, "LastPric")),
        prevClose: num(g(r, "PrvsClsgPric")),
        volume: num(g(r, "TtlTradgVol")) ?? Number.NaN,
        turnover: num(g(r, "TtlTrfVal")),
        trades: num(g(r, "TtlNbOfTxsExctd")),
      };
      if (row.volume === 0 && !opts.keepZeroVolume) return void filtered++;
      const err = validateBar(row);
      if (err) return void rejected.push({ line, reason: `${symbol}: ${err}` });
      rows.push(row);
    });
  } else if (kind === "nse_legacy") {
    const c = requireColumns(header, LEGACY_REQUIRED, fileName);
    const g = (r: string[], name: string) => {
      const i = c(name);
      return i === undefined ? undefined : r[i];
    };
    st.exchange = "NSE";
    body.forEach((r, i) => {
      const line = i + 2;
      const ser = (g(r, "SERIES") ?? "").trim().toUpperCase();
      if (!series.NSE.includes(ser)) return void filtered++;
      const date = parseLegacyDate(g(r, "TIMESTAMP") ?? "");
      if (!date) return void rejected.push({ line, reason: `invalid TIMESTAMP "${g(r, "TIMESTAMP")}"` });
      const symbol = normalizeSymbol(g(r, "SYMBOL") ?? "");
      if (!symbol) return void rejected.push({ line, reason: "missing symbol" });
      const row: EodRow = {
        exchange: "NSE",
        date,
        symbol,
        series: ser,
        isin: (g(r, "ISIN") ?? "").trim() || null,
        name: null,
        exchangeCode: null,
        open: num(g(r, "OPEN")) ?? Number.NaN,
        high: num(g(r, "HIGH")) ?? Number.NaN,
        low: num(g(r, "LOW")) ?? Number.NaN,
        close: num(g(r, "CLOSE")) ?? Number.NaN,
        last: num(g(r, "LAST")),
        prevClose: num(g(r, "PREVCLOSE")),
        volume: num(g(r, "TOTTRDQTY")) ?? Number.NaN,
        turnover: num(g(r, "TOTTRDVAL")),
        trades: num(g(r, "TOTALTRADES")),
      };
      if (row.volume === 0 && !opts.keepZeroVolume) return void filtered++;
      const err = validateBar(row);
      if (err) return void rejected.push({ line, reason: `${symbol}: ${err}` });
      rows.push(row);
    });
  } else {
    const c = requireColumns(header, INDEX_REQUIRED, fileName);
    const g = (r: string[], name: string) => {
      const i = c(name);
      return i === undefined ? undefined : r[i];
    };
    const seen = new Set<string>();
    body.forEach((r, i) => {
      const line = i + 2;
      const name = (g(r, "Index Name") ?? "").trim();
      const date = parseIndexDate(g(r, "Index Date") ?? "");
      if (!name) return void rejected.push({ line, reason: "missing index name" });
      if (!date) return void rejected.push({ line, reason: `invalid Index Date "${g(r, "Index Date")}"` });
      const symbol = indexSymbol(name);
      if (seen.has(`${symbol}|${date}`)) return void filtered++;
      seen.add(`${symbol}|${date}`);
      const close = num(g(r, "Closing Index Value"));
      // Some indices report only a close; use it for O/H/L rather than dropping the day.
      const open = num(g(r, "Open Index Value")) || close;
      const high = num(g(r, "High Index Value")) || Math.max(open ?? 0, close ?? 0);
      const low = num(g(r, "Low Index Value")) || Math.min(open ?? Infinity, close ?? Infinity);
      const row = { open: open ?? Number.NaN, high: high ?? Number.NaN, low: low ?? Number.NaN, close: close ?? Number.NaN, volume: 0 };
      const err = validateBar(row);
      if (err) return void rejected.push({ line, reason: `${name}: ${err}` });
      const vol = num(g(r, "Volume"));
      const turnoverCr = num(g(r, "Turnover (Rs. Cr.)"));
      indexRows.push({ date, name, symbol, ...row, volume: vol != null ? Math.round(vol) : null, turnover: turnoverCr != null ? turnoverCr * 1e7 : null });
    });
  }

  const deduped = dedupe(rows, series);
  const dates = [...new Set([...deduped.map((r) => r.date), ...indexRows.map((r) => r.date)])].sort();
  const exchange = st.exchange;
  const format: EodFormat = kind === "udiff" ? (exchange === "BSE" ? "bse_udiff" : "nse_udiff") : kind === "nse_legacy" ? "nse_legacy" : "nse_index";
  if (kind === "udiff" && !exchange) throw new EodFormatError(`${fileName}: no data rows`);
  return {
    fileName,
    format,
    exchange: kind === "nse_index" ? "NSE" : exchange,
    rows: deduped,
    indexRows,
    rowsRead: body.length,
    filtered: filtered + (rows.length - deduped.length),
    rejected,
    dates,
  };
}

/* ------------------------------- Parquet ------------------------------ */

const TEJ_REQUIRED = ["date", "symbol", "open", "high", "low", "close", "volume"];

function toIsoDate(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "string" && validDate(v.slice(0, 10))) return v.slice(0, 10);
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v * 86_400_000).toISOString().slice(0, 10); // days since epoch
  return null;
}

const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function parseTejParquet(fileName: string, bytes: Uint8Array, opts: ParseOptions = {}): Promise<ParsedFile> {
  const { parquetMetadata, parquetReadObjects } = await import("hyparquet");
  const { compressors } = await import("hyparquet-compressors");
  const file = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const meta = parquetMetadata(file);
  const columns = meta.schema.slice(1).map((s) => s.name);
  const missing = TEJ_REQUIRED.filter((c) => !columns.includes(c));
  if (missing.length) throw new EodFormatError(`${fileName}: not a TejHQ bhavcopy parquet (missing ${missing.join(", ")})`);
  const exchange: EodExchange | null =
    opts.exchangeHint ?? (/(^|[/_\\])bse[_./=]/i.test(fileName) || /^bse/i.test(fileName) ? "BSE" : /(^|[/_\\])nse[_./=]/i.test(fileName) || /^nse/i.test(fileName) ? "NSE" : null);
  if (!exchange) throw new EodFormatError(`${fileName}: cannot tell whether this archive is NSE or BSE — name it nse_YYYY.parquet or bse_YYYY.parquet`);
  const want = ["date", "symbol", "series", "isin", "name", "open", "high", "low", "close", "last", "prev_close", "volume", "turnover", "trades"].filter((c) => columns.includes(c));
  const objs = (await parquetReadObjects({ file, columns: want, compressors })) as Record<string, unknown>[];
  const series = seriesConfig(opts);
  const rejected: Rejection[] = [];
  let filtered = 0;
  const rows: EodRow[] = [];
  objs.forEach((o, i) => {
    const line = i + 1;
    const date = toIsoDate(o.date);
    if (!date) return void rejected.push({ line, reason: "invalid date" });
    if ((opts.from && date < opts.from) || (opts.to && date > opts.to)) return void filtered++;
    const ser = o.series == null ? null : String(o.series).trim().toUpperCase();
    if (ser && !series[exchange].includes(ser)) return void filtered++;
    const symbol = normalizeSymbol(String(o.symbol ?? ""));
    if (!symbol) return void rejected.push({ line, reason: "missing symbol" });
    const row: EodRow = {
      exchange,
      date,
      symbol,
      series: ser,
      isin: o.isin ? String(o.isin).trim() || null : null,
      name: o.name ? String(o.name).trim() || null : null,
      exchangeCode: null,
      open: toNum(o.open) ?? Number.NaN,
      high: toNum(o.high) ?? Number.NaN,
      low: toNum(o.low) ?? Number.NaN,
      close: toNum(o.close) ?? Number.NaN,
      last: toNum(o.last),
      prevClose: toNum(o.prev_close),
      volume: toNum(o.volume) ?? Number.NaN,
      turnover: toNum(o.turnover),
      trades: toNum(o.trades),
    };
    if (row.volume === 0 && !opts.keepZeroVolume) return void filtered++;
    const err = validateBar(row);
    if (err) return void rejected.push({ line, reason: `${symbol} ${date}: ${err}` });
    rows.push(row);
  });
  const deduped = dedupe(rows, series);
  return {
    fileName,
    format: "tej_parquet",
    exchange,
    rows: deduped,
    indexRows: [],
    rowsRead: objs.length,
    filtered: filtered + (rows.length - deduped.length),
    rejected,
    dates: [...new Set(deduped.map((r) => r.date))].sort(),
  };
}

/* ------------------------------- Entry -------------------------------- */

export interface RawFile {
  name: string;
  bytes: Uint8Array;
}

const isZip = (b: Uint8Array) => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isParquet = (b: Uint8Array) => b.length > 8 && b[0] === 0x50 && b[1] === 0x41 && b[2] === 0x52 && b[3] === 0x31;

/** Expand ZIP archives into their CSV/parquet members (one level, size-limited). */
export function expandFile(f: RawFile, maxUncompressed = 400 * 1024 * 1024): RawFile[] {
  if (!isZip(f.bytes)) return [f];
  let total = 0;
  const out: RawFile[] = [];
  const entries = unzipSync(f.bytes, {
    filter: (file) => {
      if (file.name.endsWith("/") || file.name.startsWith("__MACOSX/")) return false;
      if (!/\.(csv|parquet)$/i.test(file.name)) return false;
      total += file.originalSize;
      if (total > maxUncompressed) throw new EodFormatError(`${f.name}: archive expands beyond ${Math.round(maxUncompressed / 1e6)} MB`);
      return true;
    },
  });
  for (const [name, bytes] of Object.entries(entries)) out.push({ name: `${f.name}/${name.split("/").pop()}`, bytes });
  if (out.length === 0) throw new EodFormatError(`${f.name}: ZIP contains no CSV or parquet files`);
  return out;
}

export async function parseRawFile(f: RawFile, opts: ParseOptions = {}): Promise<ParsedFile> {
  if (isParquet(f.bytes)) return parseTejParquet(f.name, f.bytes, opts);
  return parseCsvText(f.name, new TextDecoder("utf-8").decode(f.bytes), opts);
}
