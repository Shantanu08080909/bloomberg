import { describe, expect, it, vi } from "vitest";
import { csvCell, parseCsv, toCsv } from "@/lib/csv";
import { marketSessionAt, rangeStart, weekdaysBetween } from "@/lib/dates";
import { fieldCoverage, runScreen, ScreenConfigSchema, type ScreenRow } from "@/lib/finance/screener";
import { classifyFreshness, summariseStatuses } from "@/lib/market/freshness";
import { ProviderError, PriceBarSchema } from "@/lib/market/types";
import { AlphaVantageProvider, fromAlphaVantageSymbol, toAlphaVantageSymbol } from "@/lib/providers/alphavantage";
import { generateDemoDataset, listingKey } from "@/lib/providers/demo/generator";
import { DEMO_COMPANIES } from "@/lib/providers/demo/universe";
import { FredProvider, parseFredTimestamp, parseFredValue } from "@/lib/providers/fred";
import { backoffDelay, ProviderHttpClient, redactUrl } from "@/lib/providers/http";
import { parseFeed, stripHtml } from "@/lib/providers/rss";
import { KeyedRateLimiter, TokenBucket } from "@/lib/rate-limit";
import { z } from "zod";

const row = (p: Partial<ScreenRow>): ScreenRow => ({
  instrumentId: 1,
  symbol: "A",
  exchange: "NSE",
  name: "A",
  sector: "IT",
  instrumentType: "EQUITY",
  price: 100,
  changePct: 1,
  volume: 1000,
  marketCapCr: 1000,
  pe: 20,
  pb: 3,
  eps: 5,
  revenueGrowth: 10,
  profitGrowth: 10,
  roe: 15,
  debtToEquity: 0.5,
  dividendYield: 1,
  sma50: 95,
  sma200: 90,
  priceVsSma50: 5,
  priceVsSma200: 11,
  rsi14: 55,
  volatility30: 20,
  dataStatus: "demo",
  asOf: null,
  ...p,
});

describe("screener", () => {
  const rows = [
    row({ instrumentId: 1, symbol: "AAA", pe: 10, roe: 25, sector: "Banking" }),
    row({ instrumentId: 2, symbol: "BBB", pe: 30, roe: 30, exchange: "BSE" }),
    row({ instrumentId: 3, symbol: "CCC", pe: null, roe: 40, marketCapCr: 5000 }),
    row({ instrumentId: 4, symbol: "DDD", pe: 15, roe: 10, marketCapCr: 50 }),
  ];
  const cfg = (c: object) => ScreenConfigSchema.parse(c);

  it("combines filters with AND", () => {
    const r = runScreen(rows, cfg({ filters: [{ field: "pe", op: "lt", value: 20 }, { field: "roe", op: "gt", value: 20 }] }));
    expect(r.allRows.map((x) => x.symbol)).toEqual(["AAA"]);
  });
  it("combines filters with OR", () => {
    const r = runScreen(rows, cfg({ logic: "OR", filters: [{ field: "pe", op: "lt", value: 12 }, { field: "roe", op: "gte", value: 40 }] }));
    expect(r.allRows.map((x) => x.symbol).sort()).toEqual(["AAA", "CCC"]);
  });
  it("never matches a filter on a missing value", () => {
    const r = runScreen(rows, cfg({ filters: [{ field: "pe", op: "gt", value: 0 }] }));
    expect(r.allRows.map((x) => x.symbol)).not.toContain("CCC");
  });
  it("supports between, exchange and sector filters", () => {
    expect(runScreen(rows, cfg({ filters: [{ field: "pe", op: "between", value: 20, value2: 9 }] })).total).toBe(2);
    expect(runScreen(rows, cfg({ exchanges: ["BSE"] })).allRows[0]!.symbol).toBe("BBB");
    expect(runScreen(rows, cfg({ sectors: ["Banking"] })).total).toBe(1);
  });
  it("sorts with nulls last and paginates", () => {
    const r = runScreen(rows, cfg({ sortBy: "pe", sortDir: "asc", pageSize: 5 }));
    expect(r.allRows.map((x) => x.symbol)).toEqual(["AAA", "DDD", "BBB", "CCC"]);
    const p2 = runScreen(rows, cfg({ sortBy: "marketCapCr", pageSize: 5, page: 9 }));
    expect(p2.page).toBe(1);
  });
  it("reports field coverage", () => {
    expect(fieldCoverage(rows).pe).toBe(0.75);
  });
  it("rejects unknown fields", () => {
    expect(() => cfg({ filters: [{ field: "hack", op: "gt", value: 1 }] })).toThrow();
  });
});

describe("CSV export", () => {
  it("quotes and escapes", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });
  it("neutralises spreadsheet formulas in text but keeps negative numbers", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell(-12.5)).toBe("-12.5");
    expect(csvCell(Number.NaN)).toBe("");
  });
  it("writes header and rows, and parses back", () => {
    const csv = toCsv([{ a: 1, b: "x,y" }], [{ header: "A", value: (r) => r.a }, { header: "B", value: (r) => r.b }]);
    expect(csv).toBe('A,B\r\n1,"x,y"\r\n');
    expect(parseCsv(csv)).toEqual([["A", "B"], ["1", "x,y"]]);
  });
});

describe("freshness labels", () => {
  const now = new Date("2026-01-01T10:00:00Z");
  it("demo is always demo", () => {
    expect(classifyFreshness("demo", new Date("2000-01-01"), now)).toBe("demo");
  });
  it("live becomes stale after the threshold", () => {
    expect(classifyFreshness("live", new Date(now.getTime() - 5 * 60_000), now)).toBe("live");
    expect(classifyFreshness("live", new Date(now.getTime() - 30 * 60_000), now)).toBe("stale");
  });
  it("delayed and eod have their own thresholds", () => {
    expect(classifyFreshness("delayed", new Date(now.getTime() - 30 * 60_000), now)).toBe("delayed");
    expect(classifyFreshness("eod", new Date(now.getTime() - 50 * 3_600_000), now)).toBe("eod");
    expect(classifyFreshness("eod", new Date(now.getTime() - 200 * 3_600_000), now)).toBe("stale");
  });
  it("missing data is unavailable", () => {
    expect(classifyFreshness(null, null, now)).toBe("unavailable");
    expect(classifyFreshness("live", null, now)).toBe("unavailable");
    expect(classifyFreshness("weird", now, now)).toBe("unavailable");
  });
  it("reports mixed statuses", () => {
    expect(summariseStatuses(["live", "demo"])).toEqual({ primary: "demo", mixed: true });
    expect(summariseStatuses(["eod", "eod"])).toEqual({ primary: "eod", mixed: false });
  });
});

describe("provider HTTP client", () => {
  const schema = z.object({ ok: z.boolean() });
  const noSleep = async () => {};

  it("retries transient failures with backoff, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const c = new ProviderHttpClient({ providerId: "t", burst: 10, perSecond: 10, fetchImpl, sleepImpl: noSleep });
    await expect(c.getJson("https://x.test", schema)).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("does not retry client errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("no", { status: 401 }));
    const c = new ProviderHttpClient({ providerId: "t", burst: 10, perSecond: 10, fetchImpl, sleepImpl: noSleep });
    await expect(c.getJson("https://x.test", schema)).rejects.toMatchObject({ status: 401, retryable: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("gives up after the retry budget on network errors", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const c = new ProviderHttpClient({ providerId: "t", burst: 10, perSecond: 10, fetchImpl, sleepImpl: noSleep, policy: { retries: 2 } });
    await expect(c.getText("https://x.test")).rejects.toBeInstanceOf(ProviderError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("validates response shape", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: "yes" })));
    const c = new ProviderHttpClient({ providerId: "t", burst: 10, perSecond: 10, fetchImpl, sleepImpl: noSleep });
    await expect(c.getJson("https://x.test", schema)).rejects.toThrow(/Unexpected response shape/);
  });
  it("caps backoff and redacts credentials", () => {
    const policy = { timeoutMs: 1, retries: 5, baseDelayMs: 500, maxDelayMs: 2000 };
    expect(backoffDelay(0, policy, 1)).toBe(500);
    expect(backoffDelay(10, policy, 1)).toBe(2000);
    expect(redactUrl("https://a.test/q?apikey=SECRET&x=1")).toBe("https://a.test/q?apikey=REDACTED&x=1");
  });
});

describe("rate limiting", () => {
  it("token bucket refills over time", () => {
    let t = 0;
    const b = new TokenBucket(2, 1, () => t);
    expect(b.tryTake()).toBe(true);
    expect(b.tryTake()).toBe(true);
    expect(b.tryTake()).toBe(false);
    t = 1000;
    expect(b.tryTake()).toBe(true);
  });
  it("keyed limiter isolates clients", () => {
    const l = new KeyedRateLimiter(1, 0, () => 0);
    expect(l.check("a").allowed).toBe(true);
    expect(l.check("a").allowed).toBe(false);
    expect(l.check("b").allowed).toBe(true);
  });
});

describe("real provider adapters (mocked HTTP)", () => {
  it("FRED parses missing values and timestamps", async () => {
    expect(parseFredValue(".")).toBeNull();
    expect(parseFredValue("5.33")).toBe(5.33);
    expect(parseFredTimestamp("2024-01-11 07:47:02-06")?.toISOString()).toBe("2024-01-11T13:47:02.000Z");
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/series/observations")) {
        return new Response(JSON.stringify({ observations: [{ date: "2024-01-01", value: "5.33" }, { date: "2024-02-01", value: "." }] }));
      }
      return new Response(JSON.stringify({ seriess: [{ id: "FEDFUNDS", title: "Federal Funds Effective Rate", units: "Percent", frequency: "Monthly", last_updated: "2024-03-01 15:16:02-06" }] }));
    });
    const p = new FredProvider("k", ["FEDFUNDS"], fetchImpl);
    const [series] = await p.fetchSeries();
    expect(series!.id).toBe("FRED_FEDFUNDS");
    expect(series!.category).toBe("rates");
    expect(series!.observations).toEqual([{ periodDate: "2024-01-01", value: 5.33 }, { periodDate: "2024-02-01", value: null }]);
    expect(String(fetchImpl.mock.calls[0]![0])).toContain("api_key=k");
  });
  it("FRED requires a key", async () => {
    await expect(new FredProvider(undefined, ["X"]).fetchSeries()).rejects.toThrow(/FRED_API_KEY/);
  });

  it("Alpha Vantage maps symbols and parses quotes", async () => {
    expect(toAlphaVantageSymbol("ABC", "BSE")).toBe("ABC.BSE");
    expect(toAlphaVantageSymbol("ABC", "NSE")).toBeNull();
    expect(fromAlphaVantageSymbol("abc.BSE")).toEqual({ symbol: "ABC", exchange: "BSE" });
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          "Global Quote": {
            "01. symbol": "ABC.BSE",
            "02. open": "100.0",
            "03. high": "105.0",
            "04. low": "99.0",
            "05. price": "104.0",
            "06. volume": "12345",
            "07. latest trading day": "2026-01-02",
            "08. previous close": "100.0",
            "09. change": "4.0",
            "10. change percent": "4.0000%",
          },
        }),
      ),
    );
    const p = new AlphaVantageProvider("k", "eod", 25, fetchImpl);
    const [q] = await p.getQuotes([{ symbol: "ABC", exchange: "BSE" }]);
    expect(q).toMatchObject({ price: 104, changePct: 4, volume: 12345, dataStatus: "eod" });
    expect(q!.asOf.toISOString()).toBe("2026-01-02T10:00:00.000Z");
  });
  it("Alpha Vantage surfaces throttling messages", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ Information: "rate limit reached" })));
    const p = new AlphaVantageProvider("k", "eod", 25, fetchImpl);
    await expect(p.getQuotes([{ symbol: "ABC", exchange: "BSE" }])).rejects.toThrow(/rate limit/);
  });

  it("RSS parser keeps only headline, link, time and a short summary", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Example Feed</title>
      <item><title>Hello &amp; welcome</title><link>https://example.test/a</link><guid>a1</guid>
      <pubDate>Mon, 05 Jan 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Short <b>summary</b></p><script>alert(1)</script>]]></description></item>
      <item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Mon, 05 Jan 2026 11:00:00 GMT</pubDate></item>
      <item><title>No date</title></item></channel></rss>`;
    const items = parseFeed(xml, "https://example.test/feed");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "Hello & welcome", url: "https://example.test/a", publisher: "Example Feed", summary: "Short summary", isSample: false });
    expect(items[1]!.url).toBeNull();
    expect(stripHtml("<a href=x>t</a>&nbsp;x")).toBe("t x");
  });
  it("RSS parser handles Atom", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Feed</title><entry><title>T</title><id>1</id>
      <link rel="alternate" href="https://example.test/t"/><updated>2026-01-05T10:00:00Z</updated><summary>S</summary></entry></feed>`;
    expect(parseFeed(xml, "https://example.test/atom")[0]).toMatchObject({ title: "T", url: "https://example.test/t", publisher: "Atom Feed" });
  });
});

describe("deterministic demo dataset", () => {
  const data = generateDemoDataset();

  it("is fictional and clearly marked", () => {
    for (const i of data.instruments) {
      if (i.instrumentType === "EQUITY") expect(i.isin).toMatch(/^ZZDEMO\d{6}$/);
      if (i.instrumentType === "INDEX") expect(i.name).toMatch(/\(demo series\)/);
    }
    expect(data.news.every((n) => n.isSample && n.url === null)).toBe(true);
    expect(data.events.every((e) => e.isSample)).toBe(true);
    expect(data.economic.every((e) => /demo/i.test(e.name))).toBe(true);
  });

  it("ends each company exactly at its target price with valid OHLC bars", () => {
    for (const c of DEMO_COMPANIES) {
      const bars = data.bars.get(listingKey("NSE", c.symbol))!;
      expect(bars.at(-1)!.close).toBeCloseTo(c.price, 1);
      for (const b of bars) expect(PriceBarSchema.safeParse(b).success).toBe(true);
    }
  });

  it("produces identical values when regenerated from scratch", async () => {
    vi.resetModules();
    const fresh = (await import("@/lib/providers/demo/generator")).generateDemoDataset();
    expect(fresh).not.toBe(data);
    const pick = (d: typeof data) => DEMO_COMPANIES.slice(0, 8).map((c) => d.bars.get(listingKey("NSE", c.symbol))![100]!);
    expect(pick(fresh)).toEqual(pick(data));
    expect(fresh.fundamentals).toEqual(data.fundamentals);
  });

  it("index weights sum to one and quotes carry the demo status", () => {
    for (const idx of data.indices) {
      expect(idx.constituents.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 4);
    }
    expect(data.quotes.every((q) => q.dataStatus === "demo")).toBe(true);
  });

  it("does not model exchange holidays (weekdays only)", () => {
    expect(weekdaysBetween("2026-09-26", "2026-09-30")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
  });
});

describe("dates", () => {
  it("NSE session by IST clock", () => {
    expect(marketSessionAt(new Date("2026-10-21T04:00:00Z"))).toBe("open"); // 09:30 IST Wed
    expect(marketSessionAt(new Date("2026-10-21T03:35:00Z"))).toBe("pre-open"); // 09:05 IST
    expect(marketSessionAt(new Date("2026-10-21T10:30:00Z"))).toBe("closed"); // 16:00 IST
    expect(marketSessionAt(new Date("2026-10-24T05:00:00Z"))).toBe("closed"); // Saturday
  });
  it("range starts", () => {
    expect(rangeStart("YTD", "2026-09-30")).toBe("2026-01-01");
    expect(rangeStart("1Y", "2026-09-30")).toBe("2025-09-30");
    expect(rangeStart("MAX", "2026-09-30")).toBeNull();
  });
});

describe("bar aggregation", () => {
  it("builds weekly and monthly OHLCV bars", async () => {
    const { aggregateBars, weekStart } = await import("@/lib/finance/aggregate");
    expect(weekStart("2026-09-30")).toBe("2026-09-28");
    const bars = [
      { date: "2026-09-28", open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { date: "2026-09-29", open: 11, high: 15, low: 10, close: 14, volume: 50 },
      { date: "2026-10-01", open: 14, high: 14, low: 8, close: 9, volume: 25 },
    ];
    expect(aggregateBars(bars, "W")).toEqual([{ date: "2026-09-28", open: 10, high: 15, low: 8, close: 9, volume: 175 }]);
    expect(aggregateBars(bars, "M").map((b) => [b.date, b.close, b.volume])).toEqual([
      ["2026-09-28", 14, 150],
      ["2026-10-01", 9, 25],
    ]);
  });
});

describe("CSV import of economic series", () => {
  it("parses date,value rows and reports bad lines", async () => {
    const { parseObservationCsv } = await import("@/lib/services/datasets");
    expect(parseObservationCsv("date,value\n2026-01-01,5.25\n2026-02-01,.\n").observations).toEqual([
      { periodDate: "2026-01-01", value: 5.25 },
      { periodDate: "2026-02-01", value: null },
    ]);
    const bad = parseObservationCsv("date,value\n01/02/2026,5\n2026-03-01,abc\n");
    expect(bad.errors).toHaveLength(2);
    expect(parseObservationCsv("2026-01-01,1,000.5".replace("1,000.5", '"1,000.5"')).observations[0]!.value).toBe(1000.5);
  });
  it("validates bounded data-explorer queries", async () => {
    const { QuerySchema } = await import("@/lib/services/datasets");
    expect(() => QuerySchema.parse({ dataset: "price_bars" })).toThrow(/instrument/);
    expect(() => QuerySchema.parse({ dataset: "price_bars", symbol: "X", from: "2020-01-01", to: "2026-01-01" })).toThrow(/3 years/);
    expect(() => QuerySchema.parse({ dataset: "quotes", from: "2026-02-01", to: "2026-01-01" })).toThrow(/End date/);
    expect(() => QuerySchema.parse({ dataset: "secret_table" })).toThrow();
    expect(QuerySchema.parse({ dataset: "quotes", pageSize: 100 }).pageSize).toBe(100);
    expect(() => QuerySchema.parse({ dataset: "quotes", pageSize: 100_000 })).toThrow();
  });
});

describe("export policy", () => {
  it("blocks licensed sources and allows demo/user data", async () => {
    const { assertExportAllowed } = await import("@/lib/server/export-policy");
    expect(assertExportAllowed("demo").allowed).toBe(true);
    expect(assertExportAllowed("user").allowed).toBe(true);
    expect(() => assertExportAllowed("alphavantage")).toThrow(/not exportable/);
    expect(() => assertExportAllowed("unknown")).toThrow();
  });
});

describe("CSRF origin check", () => {
  it("accepts same-origin and rejects cross-site writes", async () => {
    const { isSameOriginRequest } = await import("@/lib/server/api");
    const req = (method: string, headers: Record<string, string>) => ({ method, headers: new Headers(headers) });
    expect(isSameOriginRequest(req("GET", { origin: "https://evil.test", host: "localhost:3000" }))).toBe(true);
    expect(isSameOriginRequest(req("POST", { origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
    expect(isSameOriginRequest(req("POST", { origin: "https://evil.test", host: "localhost:3000" }))).toBe(false);
    expect(isSameOriginRequest(req("DELETE", { "sec-fetch-site": "cross-site", host: "localhost:3000" }))).toBe(false);
    expect(isSameOriginRequest(req("POST", { host: "localhost:3000" }))).toBe(true);
  });
});
