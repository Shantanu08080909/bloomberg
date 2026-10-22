import { describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import { parquetWriteBuffer } from "hyparquet-writer";
import {
  DownloadBlockedError,
  downloadConfig,
  fetchOfficialFile,
  fileUrls,
  fillTemplate,
  istToday,
  tejUrl,
} from "@/lib/eod/download";
import { EodFormatError, expandFile, indexSymbol, parseCsvText, parseIndexDate, parseLegacyDate, parseRawFile, validateBar } from "@/lib/eod/parse";
import { computeSnapshot } from "@/lib/eod/technicals";
import { enc, INDEX_HEADER, LEGACY_HEADER, udiffCsv } from "../fixtures/eod";

describe("UDiFF common bhavcopy", () => {
  const csv = udiffCsv([
    { date: "2026-09-30", symbol: "AAAEQ", isin: "INE000A00001", id: "11", o: 100, h: 110, l: 95, c: 105, prev: 99, vol: 1000, trades: 50 },
    { date: "2026-09-30", symbol: "AAAEQ", series: "BE", o: 1, h: 1, l: 1, c: 1, vol: 1 }, // same symbol, lower-priority series
    { date: "2026-09-30", symbol: "GOLDBOND", series: "GB", o: 10, h: 10, l: 10, c: 10, vol: 5 }, // not equity series
    { date: "2026-09-30", symbol: "NOTRADE", o: 50, h: 50, l: 50, c: 50, vol: 0 }, // no trades
    { date: "2026-09-30", symbol: "BADHL", o: 100, h: 90, l: 95, c: 92, vol: 10 }, // high < low
    { date: "2026-09-30", symbol: "zeroopen", o: 0, h: 10, l: 0, c: 5, vol: 10 },
    { date: "2026-09-30", symbol: "FUT", type: "FUT", o: 1, h: 1, l: 1, c: 1, vol: 1 },
  ]);

  it("accepts equity rows, keeps the preferred series, rejects invalid OHLC", () => {
    const p = parseCsvText("BhavCopy_NSE_CM_0_0_0_20260930_F_0000.csv", csv);
    expect(p.format).toBe("nse_udiff");
    expect(p.exchange).toBe("NSE");
    expect(p.dates).toEqual(["2026-09-30"]);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ symbol: "AAAEQ", series: "EQ", isin: "INE000A00001", exchangeCode: "11", open: 100, close: 105, prevClose: 99, volume: 1000, trades: 50 });
    expect(p.rejected.map((r) => r.reason)).toEqual([expect.stringMatching(/BADHL: high/), expect.stringMatching(/ZEROOPEN: open/)]);
    expect(p.filtered).toBe(4); // GB, no-trade, FUT, duplicate BE
    expect(p.rowsRead).toBe(7);
  });

  it("recognises BSE files and configurable groups", () => {
    const bse = udiffCsv([
      { date: "2026-09-30", src: "BSE", symbol: "BBB", series: "A", id: "500001", o: 10, h: 11, l: 9, c: 10.5, vol: 100 },
      { date: "2026-09-30", src: "BSE", symbol: "DEBT", series: "F", o: 100, h: 100, l: 100, c: 100, vol: 1 },
    ]);
    const p = parseCsvText("bse.csv", bse);
    expect(p.format).toBe("bse_udiff");
    expect(p.rows.map((r) => [r.symbol, r.exchangeCode])).toEqual([["BBB", "500001"]]);
    expect(parseCsvText("bse.csv", bse, { series: { BSE: ["F"] } }).rows.map((r) => r.symbol)).toEqual(["DEBT"]);
  });

  it("rejects HTML pages, unknown layouts and missing columns", () => {
    expect(() => parseCsvText("x.csv", "<!DOCTYPE html><html>")).toThrow(/HTML page/);
    expect(() => parseCsvText("x.csv", "a,b,c\n1,2,3")).toThrow(/unrecognised/);
    expect(() => parseCsvText("x.csv", "TradDt,TckrSymb,Src\n2026-01-01,X,NSE")).toThrow(EodFormatError);
    expect(() => parseCsvText("x.csv", "")).toThrow(/empty/);
  });
});

describe("legacy NSE bhavcopy and index file", () => {
  it("parses both legacy date spellings", () => {
    expect(parseLegacyDate("13-JUL-2020")).toBe("2020-07-13");
    expect(parseLegacyDate("13-Jul-20")).toBe("2020-07-13");
    expect(parseLegacyDate("31-FEB-2020")).toBeNull();
    expect(parseLegacyDate("2020-07-13")).toBeNull();
    const csv = `${LEGACY_HEADER}\nOLDCO,EQ,10,12,9,11,11,10,500,5500,13-Jul-20,40,INE111A01011,\nOLDCO,N1,1,1,1,1,1,1,1,1,13-JUL-2020,1,,\n`;
    const p = parseCsvText("cm13JUL2020bhav.csv", csv);
    expect(p.format).toBe("nse_legacy");
    expect(p.rows).toEqual([expect.objectContaining({ symbol: "OLDCO", date: "2020-07-13", isin: "INE111A01011", name: null, volume: 500, turnover: 5500, trades: 40 })]);
  });

  it("parses index closing values and normalises symbols", () => {
    expect(parseIndexDate("30-09-2026")).toBe("2026-09-30");
    expect(indexSymbol("Nifty 50")).toBe("NIFTY50");
    expect(indexSymbol("NIFTY Bank")).toBe("NIFTYBANK");
    const csv = `${INDEX_HEADER}\nNifty 50,30-09-2026,100.5,110.25,99,105,4.5,4.48,1000,12.5,20,3,1.2\nNifty Only Close,30-09-2026,-,-,-,200,0,0,-,-,-,-,-\n`;
    const p = parseCsvText("ind_close_all_30092026.csv", csv);
    expect(p.format).toBe("nse_index");
    expect(p.indexRows[0]).toMatchObject({ symbol: "NIFTY50", name: "Nifty 50", close: 105, high: 110.25, turnover: 12.5e7 });
    expect(p.indexRows[1]).toMatchObject({ symbol: "NIFTYONLYCLOSE", open: 200, high: 200, low: 200, close: 200 });
  });

  it("validates bars", () => {
    expect(validateBar({ open: 10, high: 12, low: 9, close: 11, volume: 1 })).toBeNull();
    expect(validateBar({ open: 10, high: 12, low: 9, close: 11, volume: 1.5 })).toMatch(/volume/);
    expect(validateBar({ open: 10, high: 12, low: 10.5, close: 11, volume: 1 })).toMatch(/low/);
  });
});

describe("ZIP and parquet inputs", () => {
  it("expands ZIP archives and ignores non-data members", async () => {
    const zip = zipSync({ "BhavCopy.csv": enc(udiffCsv([{ date: "2026-09-30", symbol: "ZIPPED", o: 1, h: 2, l: 1, c: 2, vol: 3 }])), "readme.txt": enc("hi") });
    const files = expandFile({ name: "day.zip", bytes: zip });
    expect(files.map((f) => f.name)).toEqual(["day.zip/BhavCopy.csv"]);
    expect((await parseRawFile(files[0]!)).rows[0]!.symbol).toBe("ZIPPED");
    expect(() => expandFile({ name: "empty.zip", bytes: zipSync({ "a.txt": enc("x") }) })).toThrow(/no CSV/);
  });

  it("reads TejHQ-style parquet archives with date filters", async () => {
    const buf = parquetWriteBuffer({
      columnData: [
        // Parquet DATE = INT32 days since 1970-01-01, as in the TejHQ files.
        { name: "date", data: [Date.UTC(2026, 0, 2) / 864e5, Date.UTC(2026, 0, 5) / 864e5], type: "INT32", converted_type: "DATE" } as never,
        { name: "symbol", data: ["PQCO", "PQCO"], type: "STRING" },
        { name: "series", data: ["EQ", "EQ"], type: "STRING" },
        { name: "isin", data: ["INE222A01011", "INE222A01011"], type: "STRING" },
        { name: "name", data: ["PQ CO", "PQ CO"], type: "STRING" },
        { name: "open", data: [10, 11], type: "DOUBLE" },
        { name: "high", data: [12, 12], type: "DOUBLE" },
        { name: "low", data: [9, 10], type: "DOUBLE" },
        { name: "close", data: [11, 11.5], type: "DOUBLE" },
        { name: "volume", data: [BigInt(100), BigInt(200)], type: "INT64" },
      ],
    });
    const bytes = new Uint8Array(buf);
    const p = await parseRawFile({ name: "nse_2026.parquet", bytes });
    expect(p.format).toBe("tej_parquet");
    expect(p.exchange).toBe("NSE");
    expect(p.rows.map((r) => [r.date, r.close, r.volume])).toEqual([
      ["2026-01-02", 11, 100],
      ["2026-01-05", 11.5, 200],
    ]);
    expect((await parseRawFile({ name: "nse_2026.parquet", bytes }, { from: "2026-01-03" })).rows).toHaveLength(1);
    await expect(parseRawFile({ name: "archive.parquet", bytes })).rejects.toThrow(/NSE or BSE/);
  });
});

describe("downloader", () => {
  const cfg = { ...downloadConfig({ EOD_DOWNLOAD_ENABLED: "true" } as unknown as NodeJS.ProcessEnv), minIntervalSeconds: 1 };
  const noSleep = async () => {};

  it("builds official URLs around the July 2024 format change", () => {
    expect(fillTemplate("x_{YYYYMMDD}_{DDMMYYYY}_{YYYY}/{MON}/cm{DD}{MON}{YYYY}", "2024-07-05")).toBe("x_20240705_05072024_2024/JUL/cm05JUL2024");
    expect(fileUrls("NSE", "2024-07-08", cfg)[0]!.url).toBe("https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_20240708_F_0000.csv.zip");
    expect(fileUrls("NSE", "2024-07-05", cfg)[0]!.url).toBe("https://archives.nseindia.com/content/historical/EQUITIES/2024/JUL/cm05JUL2024bhav.csv.zip");
    expect(fileUrls("NSE", "2026-09-30", cfg)[1]!.url).toBe("https://nsearchives.nseindia.com/content/indices/ind_close_all_30092026.csv");
    expect(fileUrls("BSE", "2026-09-30", cfg)[0]!.url).toBe("https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_20260930_F_0000.CSV");
    expect(fileUrls("BSE", "2024-07-05", cfg)).toEqual([]);
    expect(tejUrl("BSE", 2025)).toBe("https://data.tejhq.dev/bse/year=2025/bse_2025.parquet");
  });

  it("sends an honest User-Agent and no browser spoofing headers", async () => {
    const fetchImpl = vi.fn(async () => new Response(enc(udiffCsv([{ date: "2026-09-30", symbol: "A", o: 1, h: 1, l: 1, c: 1, vol: 1 }]))));
    const r = await fetchOfficialFile("https://example.test/f.csv", cfg, fetchImpl, noSleep);
    expect(r.status).toBe("ok");
    const headers = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/^OpenFinanceTerminal\//);
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("referer");
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("cookie");
  });

  it("stops on 401/403 instead of working around it", async () => {
    const fetchImpl = vi.fn(async () => new Response("denied", { status: 403 }));
    await expect(fetchOfficialFile("https://example.test/f.csv", cfg, fetchImpl, noSleep)).rejects.toBeInstanceOf(DownloadBlockedError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats 404 and HTML responses as no file", async () => {
    expect((await fetchOfficialFile("u", cfg, async () => new Response("", { status: 404 }), noSleep)).status).toBe("missing");
    expect((await fetchOfficialFile("u", cfg, async () => new Response("<!DOCTYPE html><html>holiday</html>".padEnd(300)), noSleep)).status).toBe("missing");
  });

  it("knows whether today's files should be published (IST)", () => {
    expect(istToday(new Date("2026-10-22T13:00:00Z"), "19:00")).toEqual({ date: "2026-10-22", published: false }); // 18:30 IST
    expect(istToday(new Date("2026-10-22T14:00:00Z"), "19:00")).toEqual({ date: "2026-10-22", published: true }); // 19:30 IST
    expect(istToday(new Date("2026-10-22T19:00:00Z"), "19:00")).toEqual({ date: "2026-10-23", published: false }); // 00:30 IST next day
  });
});

describe("technical snapshot", () => {
  it("leaves indicators empty without enough history", () => {
    const bars = Array.from({ length: 30 }, (_, i) => ({ high: 11 + i, low: 9 + i, close: 10 + i, volume: 100 }));
    const s = computeSnapshot(bars);
    expect(s.sma50).toBeNull();
    expect(s.sma200).toBeNull();
    expect(s.high52w).toBeNull();
    expect(s.return1y).toBeNull();
    expect(s.rsi14).toBe(100);
    expect(s.avgVolume20).toBe(100);
  });
  it("computes long-window values with enough history", () => {
    const bars = Array.from({ length: 260 }, (_, i) => ({ high: 101 + i, low: 99 + i, close: 100 + i, volume: 10 }));
    const s = computeSnapshot(bars);
    expect(s.sma50).toBeCloseTo((310 + 359) / 2, 8);
    expect(s.high52w).toBe(360);
    expect(s.return1y).toBeCloseTo(359 / 108 - 1, 8);
  });
});
