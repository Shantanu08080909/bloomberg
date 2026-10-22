import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { parquetWriteBuffer } from "hyparquet-writer";
import { createDb, type Database } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { setupDatabase } from "@/lib/db/seed";
import { dailyUpdate, downloadConfig, downloadRange } from "@/lib/eod/download";
import { eodSummary, hasEodData, importFiles, lastOfficialDate } from "@/lib/eod/importer";
import { TokenBucket } from "@/lib/rate-limit";
import { getScreenRows } from "@/lib/services/analytics";
import { getBars, getExchangeBreadth, getInstrument, getMovers } from "@/lib/services/market";
import { enc, udiffCsv } from "../fixtures/eod";

let handle: Awaited<ReturnType<typeof createDb>>;
let db: Database;

beforeAll(async () => {
  handle = await createDb({ PGLITE_DIR: ":memory:" } as unknown as NodeJS.ProcessEnv);
  await setupDatabase(handle);
  db = handle.db;
  (globalThis as unknown as { __ofEodBucket?: TokenBucket }).__ofEodBucket = new TokenBucket(1000, 1000);
});
afterAll(async () => handle?.close());

const day1 = udiffCsv([
  { date: "2026-09-29", symbol: "ALPHA", isin: "INE900A01011", o: 100, h: 105, l: 99, c: 104, prev: 100, vol: 1000 },
  { date: "2026-09-29", symbol: "BETA", isin: "INE900B01011", o: 50, h: 51, l: 48, c: 49, prev: 50, vol: 500 },
  { date: "2026-09-29", symbol: "OLDNAME", isin: "INE900C01011", o: 20, h: 21, l: 19, c: 20, prev: 20, vol: 300 },
]);
const day2 = udiffCsv([
  { date: "2026-09-30", symbol: "ALPHA", isin: "INE900A01011", o: 104, h: 112, l: 103, c: 110, prev: 104, vol: 2000 },
  { date: "2026-09-30", symbol: "BETA", isin: "INE900B01011", o: 49, h: 49, l: 45, c: 46, prev: 49, vol: 800 },
  // Renamed symbol: same ISIN as OLDNAME.
  { date: "2026-09-30", symbol: "NEWNAME", isin: "INE900C01011", o: 20, h: 22, l: 20, c: 21, prev: 20, vol: 400 },
]);

const barCount = async () => {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(s.priceBars).where(eq(s.priceBars.sourceId, "eod"));
  return Number(r!.n);
};

describe("end-of-day import", () => {
  it("starts in demo mode with no EOD data", async () => {
    expect(await hasEodData(db)).toBe(false);
  });

  it("imports official files with provenance and builds quotes", async () => {
    const res = await importFiles(db, [{ name: "BhavCopy_NSE_CM_0_0_0_20260929_F_0000.csv", bytes: enc(day1) }, { name: "BhavCopy_NSE_CM_0_0_0_20260930_F_0000.csv", bytes: enc(day2) }], { mode: "daily" });
    expect(res.map((r) => r.status)).toEqual(["success", "success"]);
    expect(await barCount()).toBe(6);
    expect(await hasEodData(db)).toBe(true);
    expect(await lastOfficialDate(db, "NSE")).toBe("2026-09-30");

    const alpha = await getInstrument(db, "eod", "NSE", "ALPHA");
    expect(alpha!.quote).toMatchObject({ price: 110, prevClose: 104, change: 6, volume: 2000, dataStatus: "eod" });
    expect(alpha!.quote!.changePct).toBeCloseTo(5.7692, 3);
    expect(alpha!.quote!.asOf.toISOString()).toBe("2026-09-30T10:00:00.000Z"); // 15:30 IST
    expect(alpha!.displayStatus === "eod" || alpha!.displayStatus === "stale").toBe(true);

    const [bar] = await db.select().from(s.priceBars).innerJoin(s.importFiles, eq(s.importFiles.id, s.priceBars.importId)).where(and(eq(s.priceBars.instrumentId, alpha!.id), eq(s.priceBars.date, "2026-09-30")));
    expect(bar!.import_files).toMatchObject({ format: "nse_udiff", origin: "official", mode: "daily", fileName: "BhavCopy_NSE_CM_0_0_0_20260930_F_0000.csv" });
    expect(bar!.import_files.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(bar!.price_bars.origin).toBe("official");
  });

  it("follows a symbol rename through the ISIN", async () => {
    const renamed = await getInstrument(db, "eod", "NSE", "NEWNAME");
    expect(await getInstrument(db, "eod", "NSE", "OLDNAME")).toBeNull();
    const bars = await getBars(db, renamed!.id, "eod");
    expect(bars.map((b) => b.date)).toEqual(["2026-09-29", "2026-09-30"]);
  });

  it("is idempotent: identical files are skipped, forced re-imports create no duplicates", async () => {
    const again = await importFiles(db, [{ name: "copy.csv", bytes: enc(day2) }], { mode: "daily" });
    expect(again[0]!.status).toBe("skipped");
    const forced = await importFiles(db, [{ name: "copy.csv", bytes: enc(day2) }], { mode: "daily", force: true });
    expect(forced[0]!.status).toBe("success");
    expect(await barCount()).toBe(6);
  });

  it("never lets an archive overwrite an official bar, and labels archive-only data HISTORICAL", async () => {
    const days = [Date.UTC(2026, 8, 28) / 864e5, Date.UTC(2026, 8, 30) / 864e5];
    const buf = parquetWriteBuffer({
      columnData: [
        { name: "date", data: days, type: "INT32", converted_type: "DATE" } as never,
        { name: "symbol", data: ["ALPHA", "ALPHA"], type: "STRING" },
        { name: "series", data: ["EQ", "EQ"], type: "STRING" },
        { name: "open", data: [90, 999], type: "DOUBLE" },
        { name: "high", data: [101, 999], type: "DOUBLE" },
        { name: "low", data: [89, 999], type: "DOUBLE" },
        { name: "close", data: [100, 999], type: "DOUBLE" },
        { name: "volume", data: [BigInt(10), BigInt(10)], type: "INT64" },
      ],
    });
    const res = await importFiles(db, [{ name: "nse_2026.parquet", bytes: new Uint8Array(buf) }], { mode: "archive" });
    expect(res[0]).toMatchObject({ status: "success", barsWritten: 1, format: "tej_parquet" });
    const alpha = await getInstrument(db, "eod", "NSE", "ALPHA");
    const bars = await getBars(db, alpha!.id, "eod");
    expect(bars.map((b) => [b.date, b.close])).toEqual([
      ["2026-09-28", 100],
      ["2026-09-29", 104],
      ["2026-09-30", 110], // official value kept
    ]);
    // Latest bar still comes from the official daily file → END OF DAY, not HISTORICAL.
    expect(alpha!.quote!.dataStatus).toBe("eod");

    const archiveOnly = new Uint8Array(
      parquetWriteBuffer({
        columnData: [
          { name: "date", data: [Date.UTC(2026, 8, 30) / 864e5], type: "INT32", converted_type: "DATE" } as never,
          { name: "symbol", data: ["ARCHONLY"], type: "STRING" },
          { name: "open", data: [5], type: "DOUBLE" },
          { name: "high", data: [6], type: "DOUBLE" },
          { name: "low", data: [4], type: "DOUBLE" },
          { name: "close", data: [5.5], type: "DOUBLE" },
          { name: "volume", data: [BigInt(7)], type: "INT64" },
        ],
      }),
    );
    await importFiles(db, [{ name: "nse_2026b.parquet", bytes: archiveOnly }], { mode: "archive" });
    const arch = await getInstrument(db, "eod", "NSE", "ARCHONLY");
    expect(arch!.quote!.dataStatus).toBe("historical");
    expect(arch!.displayStatus).toBe("historical");
  });

  it("records rejected files with a reason", async () => {
    const res = await importFiles(db, [{ name: "holiday.csv", bytes: enc("<html>closed</html>") }], { mode: "manual" });
    expect(res[0]).toMatchObject({ status: "error" });
    const [row] = await db.select().from(s.importFiles).where(eq(s.importFiles.id, res[0]!.importId!));
    expect(row!.message).toMatch(/HTML page/);
  });

  it("feeds movers, breadth and the screener from stored bars", async () => {
    const movers = await getMovers(db, "eod", 5, "NSE");
    expect(movers.gainers.map((g) => g.symbol)).toContain("ALPHA");
    expect(movers.losers.map((g) => g.symbol)).toContain("BETA");
    const breadth = await getExchangeBreadth(db, "eod", "NSE");
    expect(breadth).toMatchObject({ advancers: 2, decliners: 1, constituents: 3 }); // ARCHONLY has no previous close, so no change
    const rows = await getScreenRows(db, "eod");
    const alpha = rows.find((r) => r.symbol === "ALPHA")!;
    expect(alpha.price).toBe(110);
    expect(alpha.turnoverCr).toBeCloseTo((110 * 2000) / 1e7, 10);
    expect(alpha.pe).toBeNull(); // exchange files carry no fundamentals — never zero-filled
    expect(alpha.sma50).toBeNull(); // not enough history
    expect(alpha.rsi14).toBeNull();
  });

  it("downloads ranges politely, skips imported days, treats holidays as missing, and stops when refused", async () => {
    const cfg = { ...downloadConfig({ EOD_DOWNLOAD_ENABLED: "true", EOD_NSE_INDICES: "false" } as unknown as NodeJS.ProcessEnv), minIntervalSeconds: 1 };
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.includes("20261001")) return new Response(enc(udiffCsv([{ date: "2026-10-01", symbol: "ALPHA", isin: "INE900A01011", o: 110, h: 115, l: 109, c: 114, prev: 110, vol: 900 }])));
      if (url.includes("20261002")) return new Response("<!DOCTYPE html><html>no file</html>".padEnd(400));
      if (url.includes("20261005")) return new Response("Forbidden", { status: 403 });
      return new Response("", { status: 404 });
    };
    const out = await downloadRange(db, { exchanges: ["NSE"], from: "2026-09-30", to: "2026-10-06", mode: "backfill", fetchImpl }, cfg);
    expect(out.map((o) => `${o.date}:${o.status}`)).toEqual(["2026-09-30:skipped", "2026-10-01:imported", "2026-10-02:missing", ":blocked"]);
    expect(calls.some((c) => c.includes("20261006"))).toBe(false); // stopped after the refusal
    expect(calls.some((c) => c.includes("20260930"))).toBe(false); // already imported, not re-fetched
    const alpha = await getInstrument(db, "eod", "NSE", "ALPHA");
    expect(alpha!.quote).toMatchObject({ price: 114, dataStatus: "historical" }); // backfill → HISTORICAL

    await expect(downloadRange(db, { exchanges: ["NSE"], from: "2026-10-01", to: "2026-10-01", mode: "daily", fetchImpl }, { ...cfg, enabled: false })).rejects.toThrow(/disabled/);
    const update = await dailyUpdate(db, ["NSE"], { fetchImpl: async () => new Response("", { status: 404 }) }, cfg);
    expect(update.every((o) => o.status === "missing" || o.status === "skipped")).toBe(true);
  });

  it("summarises stored data per exchange", async () => {
    const sum = await eodSummary(db);
    expect(sum).toEqual([expect.objectContaining({ exchange: "NSE", firstDate: "2026-09-28", lastDate: "2026-10-01" })]);
  });
});
