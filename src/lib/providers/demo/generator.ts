import { addDays, addYears, istDateTime, weekdaysBetween } from "@/lib/dates";
import type {
  CorporateActionRecord,
  EconomicEventRecord,
  EconomicSeriesRecord,
  Exchange,
  FinancialStatementRecord,
  FundamentalsRecord,
  IndexRecord,
  InstrumentRecord,
  NewsRecord,
  PriceBar,
  QuoteRecord,
} from "@/lib/market/types";
import { SeededRandom, hashString, round } from "./random";
import {
  DEMO_ANCHOR_DATE,
  DEMO_COMPANIES,
  DEMO_HISTORY_YEARS,
  DEMO_INDICES,
  DEMO_SEED,
  type DemoCompany,
} from "./universe";

export interface DemoDataset {
  anchorDate: string;
  instruments: InstrumentRecord[];
  bars: Map<string, PriceBar[]>;
  quotes: QuoteRecord[];
  fundamentals: FundamentalsRecord[];
  statements: FinancialStatementRecord[];
  corporateActions: CorporateActionRecord[];
  indices: IndexRecord[];
  news: NewsRecord[];
  economic: EconomicSeriesRecord[];
  events: EconomicEventRecord[];
}

export const listingKey = (exchange: Exchange, symbol: string) => `${exchange}:${symbol}`;

interface SectorProfile {
  vol: number;
  beta: number;
  pe: [number, number];
  pb: [number, number];
  de: [number, number] | null;
  margin: [number, number];
  growth: [number, number];
  yield: [number, number];
}

const SECTORS: Record<string, SectorProfile> = {
  Banking: { vol: 0.016, beta: 1.15, pe: [9, 22], pb: [1.1, 3.6], de: null, margin: [0.14, 0.26], growth: [0.08, 0.2], yield: [0.004, 0.018] },
  "IT Services": { vol: 0.015, beta: 0.85, pe: [20, 38], pb: [5, 12], de: [0, 0.15], margin: [0.13, 0.24], growth: [0.04, 0.16], yield: [0.012, 0.035] },
  Energy: { vol: 0.016, beta: 1.0, pe: [7, 24], pb: [1, 3], de: [0.3, 1.2], margin: [0.06, 0.16], growth: [0.02, 0.14], yield: [0.015, 0.05] },
  FMCG: { vol: 0.011, beta: 0.6, pe: [35, 65], pb: [8, 20], de: [0, 0.3], margin: [0.1, 0.2], growth: [0.05, 0.14], yield: [0.01, 0.025] },
  Pharma: { vol: 0.014, beta: 0.7, pe: [22, 45], pb: [3, 8], de: [0, 0.5], margin: [0.1, 0.22], growth: [0.06, 0.18], yield: [0.004, 0.012] },
  Auto: { vol: 0.017, beta: 1.1, pe: [18, 34], pb: [3, 9], de: [0.1, 1.0], margin: [0.06, 0.13], growth: [0.06, 0.2], yield: [0.006, 0.025] },
  Metals: { vol: 0.022, beta: 1.35, pe: [6, 18], pb: [0.9, 2.6], de: [0.4, 1.6], margin: [0.05, 0.14], growth: [-0.05, 0.15], yield: [0.01, 0.045] },
  Telecom: { vol: 0.015, beta: 0.85, pe: [30, 70], pb: [3, 9], de: [1, 2.5], margin: [0.05, 0.14], growth: [0.08, 0.2], yield: [0.002, 0.012] },
  Infrastructure: { vol: 0.019, beta: 1.25, pe: [20, 45], pb: [2, 6], de: [0.5, 1.8], margin: [0.06, 0.15], growth: [0.08, 0.25], yield: [0.002, 0.012] },
  "Financial Services": { vol: 0.018, beta: 1.2, pe: [18, 40], pb: [2.5, 7], de: [2, 5], margin: [0.15, 0.32], growth: [0.12, 0.28], yield: [0.003, 0.015] },
  Cement: { vol: 0.015, beta: 0.95, pe: [25, 45], pb: [2.5, 6], de: [0.1, 0.8], margin: [0.07, 0.15], growth: [0.04, 0.15], yield: [0.003, 0.012] },
  "Consumer Durables": { vol: 0.017, beta: 1.0, pe: [45, 90], pb: [8, 18], de: [0, 0.5], margin: [0.04, 0.1], growth: [0.1, 0.25], yield: [0.002, 0.008] },
};

function sectorProfile(sector: string): SectorProfile {
  return SECTORS[sector] ?? SECTORS.FMCG!;
}

function companyRng(symbol: string, salt: string) {
  return new SeededRandom(DEMO_SEED ^ hashString(`${symbol}:${salt}`));
}

function makeIsin(i: number) {
  return `ZZDEMO${String(i + 1).padStart(6, "0")}`;
}

function generateCompanyBars(
  company: DemoCompany,
  days: string[],
  market: number[],
  sectorFactor: Map<string, number[]>,
): PriceBar[] {
  const prof = sectorProfile(company.sector);
  const rng = companyRng(company.symbol, "bars");
  const beta = prof.beta * rng.range(0.8, 1.2);
  const idioVol = prof.vol * rng.range(0.75, 1.25);
  const drift = rng.range(-0.0002, 0.0007);
  const sector = sectorFactor.get(company.sector)!;
  const baseVolume = Math.round((company.marketCapCr * 1e7) / company.price / 400) * rng.range(0.6, 1.4);

  const closes: number[] = [];
  const returns: number[] = [];
  let level = 1;
  for (let t = 0; t < days.length; t++) {
    const r = drift + beta * market[t]! + 0.6 * sector[t]! + rng.normal(0, idioVol);
    const bounded = Math.max(-0.18, Math.min(0.18, r));
    level *= 1 + bounded;
    closes.push(level);
    returns.push(bounded);
  }
  const scale = company.price / closes[closes.length - 1]!;
  const bars: PriceBar[] = [];
  let prevClose = closes[0]! * scale / (1 + returns[0]!);
  for (let t = 0; t < days.length; t++) {
    const close = closes[t]! * scale;
    const open = prevClose * (1 + rng.normal(0, idioVol * 0.25));
    const high = Math.max(open, close) * (1 + Math.abs(rng.normal(0, idioVol * 0.45)));
    const low = Math.min(open, close) * (1 - Math.abs(rng.normal(0, idioVol * 0.45)));
    const volume = Math.max(
      1000,
      Math.round(baseVolume * Math.exp(rng.normal(0, 0.35)) * (1 + 8 * Math.abs(returns[t]!))),
    );
    bars.push({
      date: days[t]!,
      open: round(open),
      high: round(Math.max(high, open, close)),
      low: round(Math.min(low, open, close)),
      close: round(close),
      volume,
    });
    prevClose = close;
  }
  return bars;
}

/** BSE listing: same issuer, tiny deterministic price differences, lower volume. */
function bseBars(symbol: string, nse: PriceBar[]): PriceBar[] {
  const rng = companyRng(symbol, "bse");
  return nse.map((b) => {
    const f = 1 + rng.normal(0, 0.0004);
    const open = round(b.open * f);
    const close = round(b.close * f);
    return {
      date: b.date,
      open,
      close,
      high: round(Math.max(b.high * f, open, close)),
      low: round(Math.min(b.low * f, open, close)),
      volume: Math.max(100, Math.round(b.volume * rng.range(0.08, 0.2))),
    };
  });
}

function quoteFromBars(symbol: string, exchange: Exchange, bars: PriceBar[]): QuoteRecord {
  const last = bars[bars.length - 1]!;
  const prev = bars[bars.length - 2] ?? last;
  const change = round(last.close - prev.close);
  return {
    symbol,
    exchange,
    price: last.close,
    open: last.open,
    high: last.high,
    low: last.low,
    prevClose: prev.close,
    change,
    changePct: round((change / prev.close) * 100, 4),
    volume: last.volume,
    asOf: istDateTime(last.date, 15, 30),
    dataStatus: "demo",
  };
}

function buildIndex(
  def: (typeof DEMO_INDICES)[number],
  members: { company: DemoCompany; bars: PriceBar[]; exchange: Exchange }[],
  days: string[],
): { record: IndexRecord; bars: PriceBar[] } {
  const shares = members.map((m) => (m.company.marketCapCr * 1e7) / m.company.price);
  const totalCap = members.reduce((s, m) => s + m.company.marketCapCr, 0);
  const sumAt = (t: number, key: "open" | "high" | "low" | "close") =>
    members.reduce((s, m, i) => s + shares[i]! * m.bars[t]![key], 0);
  const divisor = sumAt(0, "close") / def.startLevel;
  const bars: PriceBar[] = days.map((date, t) => {
    const open = round(sumAt(t, "open") / divisor);
    const close = round(sumAt(t, "close") / divisor);
    return {
      date,
      open,
      close,
      high: round(Math.max(sumAt(t, "high") / divisor, open, close)),
      low: round(Math.min(sumAt(t, "low") / divisor, open, close)),
      volume: members.reduce((s, m) => s + m.bars[t]!.volume, 0),
    };
  });
  return {
    bars,
    record: {
      instrument: {
        symbol: def.symbol,
        exchange: "INDEX",
        name: def.name,
        isin: null,
        exchangeCode: null,
        issuerKey: null,
        instrumentType: "INDEX",
        sector: def.sector ?? null,
        industry: null,
        currency: "INR",
        description: `Synthetic demo index computed by OpenFinance from ${members.length} fictional demo constituents. It is NOT the official ${def.name.replace(" (demo series)", "")} index and does not track it.`,
        listedSince: days[0]!,
      },
      family: def.family,
      baseValue: def.startLevel,
      baseDate: days[0]!,
      methodology: "Full market-cap weighted on anchor-date share counts; base level set on the first demo trading day.",
      constituents: members.map((m) => ({
        symbol: m.company.symbol,
        exchange: m.exchange,
        weight: round(m.company.marketCapCr / totalCap, 6),
      })),
    },
  };
}

function generateFundamentals(c: DemoCompany, exchange: Exchange, anchor: string): FundamentalsRecord {
  const p = sectorProfile(c.sector);
  const rng = companyRng(c.symbol, "fund");
  const pe = round(rng.range(...p.pe), 2);
  const pb = round(rng.range(...p.pb), 2);
  const shares = Math.round((c.marketCapCr * 1e7) / c.price);
  return {
    symbol: c.symbol,
    exchange,
    asOf: anchor,
    marketCapCr: round(c.marketCapCr, 2),
    sharesOutstanding: shares,
    pe,
    pb,
    eps: round(c.price / pe, 2),
    bookValuePerShare: round(c.price / pb, 2),
    roe: round((pb / pe) * 100, 2),
    debtToEquity: p.de ? round(rng.range(...p.de), 2) : null,
    dividendYield: c.dividend ? round(rng.range(...p.yield) * 100, 2) : 0,
    revenueGrowth: round(rng.range(...p.growth) * 100, 2),
    profitGrowth: round((rng.range(...p.growth) + rng.normal(0, 0.04)) * 100, 2),
  };
}

function generateStatements(
  c: DemoCompany,
  f: FundamentalsRecord,
  exchange: Exchange,
): FinancialStatementRecord[] {
  const p = sectorProfile(c.sector);
  const rng = companyRng(c.symbol, "stmt");
  const latestFy = 2026;
  const netProfitLatest = ((f.eps ?? 0) * (f.sharesOutstanding ?? 0)) / 1e7;
  const margin = rng.range(...p.margin);
  const out: FinancialStatementRecord[] = [];
  let revenue = netProfitLatest / margin;
  let profit = netProfitLatest;
  let equity = ((f.bookValuePerShare ?? 0) * (f.sharesOutstanding ?? 0)) / 1e7;
  const rows: { fy: number; revenue: number; profit: number; equity: number }[] = [];
  for (let i = 0; i < 5; i++) {
    rows.push({ fy: latestFy - i, revenue, profit, equity });
    const rg = i === 0 ? (f.revenueGrowth ?? 0) / 100 : rng.range(...p.growth);
    const pg = i === 0 ? (f.profitGrowth ?? 0) / 100 : rg + rng.normal(0, 0.05);
    revenue = revenue / (1 + rg);
    profit = profit / (1 + Math.max(-0.5, pg));
    equity = Math.max(equity - profit * 0.7, equity * 0.6);
  }
  for (const r of rows.reverse()) {
    const ebitda = r.profit * rng.range(1.7, 2.4);
    const interest = ebitda * rng.range(0.02, 0.12);
    const tax = r.profit * 0.33;
    const debt = f.debtToEquity == null ? null : r.equity * f.debtToEquity;
    const cash = r.revenue * rng.range(0.04, 0.18);
    const otherLiab = r.equity * rng.range(0.3, 0.9);
    const cfo = r.profit * rng.range(0.85, 1.35);
    const capex = -r.revenue * rng.range(0.02, 0.12);
    const dividends = c.dividend ? -r.profit * rng.range(0.15, 0.45) : 0;
    const base = { symbol: c.symbol, exchange, fiscalYear: r.fy, unit: "crore" as const };
    out.push({
      ...base,
      statementType: "income",
      lineItems: {
        revenue: round(r.revenue),
        ebitda: round(ebitda),
        depreciation: round(ebitda - r.profit - interest - tax),
        interest: round(interest),
        profitBeforeTax: round(r.profit + tax),
        tax: round(tax),
        netProfit: round(r.profit),
      },
    });
    out.push({
      ...base,
      statementType: "balance",
      lineItems: {
        totalAssets: round(r.equity + (debt ?? r.equity * 4) + otherLiab),
        cashAndEquivalents: round(cash),
        totalEquity: round(r.equity),
        totalDebt: debt == null ? null : round(debt),
        otherLiabilities: round(otherLiab),
      },
    });
    out.push({
      ...base,
      statementType: "cashflow",
      lineItems: {
        operatingCashFlow: round(cfo),
        capitalExpenditure: round(capex),
        freeCashFlow: round(cfo + capex),
        dividendsPaid: round(dividends),
      },
    });
  }
  return out;
}

function generateCorporateActions(
  c: DemoCompany,
  f: FundamentalsRecord,
  exchange: Exchange,
  bars: PriceBar[],
): CorporateActionRecord[] {
  const rng = companyRng(c.symbol, "ca");
  const out: CorporateActionRecord[] = [];
  const first = bars[0]!.date;
  const last = bars[bars.length - 1]!.date;
  if (c.dividend && (f.dividendYield ?? 0) > 0) {
    const startYear = Number(first.slice(0, 4));
    const endYear = Number(last.slice(0, 4));
    for (let y = startYear; y <= endYear; y++) {
      const exDate = `${y}-${String(rng.int(7, 8)).padStart(2, "0")}-${String(rng.int(1, 27)).padStart(2, "0")}`;
      if (exDate < first || exDate > last) continue;
      const bar = bars.find((b) => b.date >= exDate) ?? bars[bars.length - 1]!;
      const amount = round((bar.close * (f.dividendYield ?? 0)) / 100, 2);
      out.push({
        symbol: c.symbol,
        exchange,
        actionType: "DIVIDEND",
        exDate,
        recordDate: exDate,
        details: { amountPerShare: amount, kind: "Final" },
        description: `Final dividend of ₹${amount.toFixed(2)} per share (demo)`,
      });
    }
  }
  if (c.price > 4000 && rng.next() < 0.5) {
    const idx = rng.int(Math.floor(bars.length * 0.2), Math.floor(bars.length * 0.8));
    out.push({
      symbol: c.symbol,
      exchange,
      actionType: "SPLIT",
      exDate: bars[idx]!.date,
      recordDate: bars[idx]!.date,
      details: { ratioFrom: 1, ratioTo: 2 },
      description: "Stock split 1:2 (demo). Historical demo prices are split-adjusted.",
    });
  }
  if (rng.next() < 0.12) {
    const idx = rng.int(Math.floor(bars.length * 0.1), Math.floor(bars.length * 0.9));
    out.push({
      symbol: c.symbol,
      exchange,
      actionType: "BONUS",
      exDate: bars[idx]!.date,
      recordDate: bars[idx]!.date,
      details: { ratioFrom: 1, ratioTo: 1 },
      description: "Bonus issue 1:1 (demo). Historical demo prices are adjusted.",
    });
  }
  return out.sort((a, b) => a.exDate.localeCompare(b.exDate));
}

const NEWS_TEMPLATES: { title: string; summary: string; categories: string[] }[] = [
  { title: "{name} reports quarterly results ahead of internal targets", summary: "Sample article for demo mode. Describes a fictional earnings release by {name}.", categories: ["Earnings"] },
  { title: "{name} board approves capacity expansion plan", summary: "Sample article for demo mode about a fictional capital expenditure announcement.", categories: ["Corporate"] },
  { title: "Analysts debate valuation of {name} after recent move", summary: "Sample article for demo mode summarising fictional analyst commentary.", categories: ["Markets"] },
  { title: "{name} announces dividend record date", summary: "Sample article for demo mode about a fictional dividend announcement.", categories: ["Corporate Actions"] },
  { title: "{name} signs supply agreement with fictional partner", summary: "Sample article for demo mode about a fictional commercial agreement.", categories: ["Corporate"] },
];

const MACRO_NEWS: { title: string; summary: string; categories: string[] }[] = [
  { title: "Sample: Central bank policy meeting outcome", summary: "Sample macro article for demo mode. Not a report of any real policy decision.", categories: ["Economy", "Rates"] },
  { title: "Sample: Monthly inflation print discussed by economists", summary: "Sample macro article for demo mode. Contains no real inflation data.", categories: ["Economy", "Inflation"] },
  { title: "Sample: Foreign portfolio flows and the rupee", summary: "Sample macro article for demo mode. Contains no real flow data.", categories: ["Markets", "Currency"] },
  { title: "Sample: Government bond yields move in thin trade", summary: "Sample macro article for demo mode. Contains no real yield data.", categories: ["Rates", "Bonds"] },
  { title: "Sample: Monsoon progress and rural demand outlook", summary: "Sample macro article for demo mode.", categories: ["Economy"] },
  { title: "Sample: Industrial output data due this week", summary: "Sample macro article for demo mode.", categories: ["Economy"] },
];

function generateNews(anchor: string): NewsRecord[] {
  const rng = new SeededRandom(DEMO_SEED ^ hashString("news"));
  const out: NewsRecord[] = [];
  const end = istDateTime(anchor, 18, 0).getTime();
  for (let i = 0; i < 48; i++) {
    const c = rng.pick(DEMO_COMPANIES);
    const t = rng.pick(NEWS_TEMPLATES);
    out.push({
      externalId: `demo-news-${i}`,
      title: t.title.replaceAll("{name}", c.name),
      summary: t.summary.replaceAll("{name}", c.name),
      url: null,
      publisher: "OpenFinance Sample Feed",
      publishedAt: new Date(end - rng.range(0, 30) * 86_400_000),
      categories: [...t.categories, c.sector],
      tickers: [c.symbol],
      isSample: true,
    });
  }
  MACRO_NEWS.forEach((m, i) =>
    out.push({
      externalId: `demo-macro-${i}`,
      title: m.title,
      summary: m.summary,
      url: null,
      publisher: "OpenFinance Sample Feed",
      publishedAt: new Date(end - rng.range(0, 20) * 86_400_000),
      categories: m.categories,
      tickers: [],
      isSample: true,
    }),
  );
  return out.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

function monthStarts(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  let y = Number(fromISO.slice(0, 4));
  let m = Number(fromISO.slice(5, 7));
  for (;;) {
    const d = `${y}-${String(m).padStart(2, "0")}-01`;
    if (d > toISO) break;
    out.push(d);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function walk(
  rng: SeededRandom,
  n: number,
  start: number,
  sd: number,
  min: number,
  max: number,
  revert = 0.05,
  mean = (min + max) / 2,
  step?: number,
): number[] {
  const out: number[] = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    v = v + revert * (mean - v) + rng.normal(0, sd);
    v = Math.min(max, Math.max(min, v));
    out.push(step ? Math.round(v / step) * step : v);
  }
  return out;
}

function generateEconomic(anchor: string): EconomicSeriesRecord[] {
  const rng = new SeededRandom(DEMO_SEED ^ hashString("econ"));
  const from = addYears(anchor, -5).slice(0, 7) + "-01";
  const months = monthStarts(from, anchor);
  const quarters = months.filter((d) => ["01", "04", "07", "10"].includes(d.slice(5, 7)));
  const published = istDateTime(anchor, 17, 0);
  const series = (
    id: string,
    name: string,
    country: string,
    category: EconomicSeriesRecord["category"],
    unit: string,
    frequency: EconomicSeriesRecord["frequency"],
    periods: string[],
    values: number[],
    description: string,
  ): EconomicSeriesRecord => ({
    id,
    name,
    country,
    category,
    unit,
    frequency,
    sourceSeriesId: null,
    description: `${description} Synthetic demo values — not official statistics.`,
    publishedAt: published,
    observations: periods.map((p, i) => ({ periodDate: p, value: round(values[i]!, 2) })),
  });

  // Policy rate: changes only every second month in 25 bp steps.
  const repo: number[] = [];
  let r = 4.0;
  for (let i = 0; i < months.length; i++) {
    if (i % 2 === 0 && rng.next() < 0.45) r = Math.min(7, Math.max(4, r + (rng.next() < 0.55 ? 0.25 : -0.25)));
    repo.push(r);
  }
  const g10 = walk(rng, months.length, 6.4, 0.12, 6.0, 7.6, 0.04, 7.0);
  const curve = (spread: number, sd: number) => g10.map((v) => v + spread + rng.normal(0, sd));
  const usdInr = walk(rng, months.length, 74.5, 0.45, 73, 90, 0.0).map((v, i) => v + i * 0.12);
  const n = months.length;

  return [
    series("IN_POLICY_RATE", "Policy repo rate (demo)", "India", "rates", "% p.a.", "monthly", months, repo, "Monthly snapshot of the policy repo rate."),
    series("IN_CPI_YOY", "CPI inflation, YoY (demo)", "India", "inflation", "%", "monthly", months, walk(rng, n, 5.5, 0.45, 2.0, 7.8, 0.08, 5), "Consumer price inflation, year-on-year."),
    series("IN_WPI_YOY", "WPI inflation, YoY (demo)", "India", "inflation", "%", "monthly", months, walk(rng, n, 9, 0.8, -3, 15, 0.06, 3), "Wholesale price inflation, year-on-year."),
    series("IN_GDP_YOY", "Real GDP growth, YoY (demo)", "India", "growth", "%", "quarterly", quarters, walk(rng, quarters.length, 7, 0.6, 4.5, 9, 0.2, 6.8), "Quarterly real GDP growth."),
    series("IN_IIP_YOY", "Industrial production, YoY (demo)", "India", "production", "%", "monthly", months, walk(rng, n, 4, 1.6, -2, 11, 0.15, 4.5), "Index of industrial production growth."),
    series("IN_TBILL_91D", "91-day T-bill yield (demo)", "India", "yields", "%", "monthly", months, repo.map((v) => v + 0.1 + rng.normal(0, 0.08)), "Primary auction cut-off yield."),
    series("IN_GSEC_2Y", "2-year G-sec yield (demo)", "India", "yields", "%", "monthly", months, curve(-0.45, 0.06), "Benchmark government security yield."),
    series("IN_GSEC_5Y", "5-year G-sec yield (demo)", "India", "yields", "%", "monthly", months, curve(-0.2, 0.05), "Benchmark government security yield."),
    series("IN_GSEC_10Y", "10-year G-sec yield (demo)", "India", "yields", "%", "monthly", months, g10, "Benchmark government security yield."),
    series("IN_GSEC_30Y", "30-year G-sec yield (demo)", "India", "yields", "%", "monthly", months, curve(0.25, 0.06), "Benchmark government security yield."),
    series("USDINR", "USD/INR reference rate (demo)", "India", "fx", "INR per USD", "monthly", months, usdInr, "Monthly average exchange rate."),
    series("EURINR", "EUR/INR reference rate (demo)", "India", "fx", "INR per EUR", "monthly", months, usdInr.map((v) => v * (1.08 + rng.normal(0, 0.015))), "Monthly average exchange rate."),
    series("US_FED_FUNDS", "US federal funds rate (demo)", "United States", "rates", "% p.a.", "monthly", months, walk(rng, n, 0.25, 0.25, 0.1, 5.5, 0.03, 4).map((v) => Math.round(v * 4) / 4), "Effective federal funds rate."),
    series("US_CPI_YOY", "US CPI inflation, YoY (demo)", "United States", "inflation", "%", "monthly", months, walk(rng, n, 6, 0.4, 1.5, 9, 0.07, 3), "Consumer price inflation, year-on-year."),
    series("US_UNRATE", "US unemployment rate (demo)", "United States", "labour", "%", "monthly", months, walk(rng, n, 4.5, 0.15, 3.4, 5.5, 0.05, 4), "Civilian unemployment rate."),
    series("US_10Y", "US 10-year Treasury yield (demo)", "United States", "yields", "%", "monthly", months, walk(rng, n, 1.6, 0.18, 1.2, 5, 0.03, 4), "10-year constant maturity yield."),
  ];
}

function generateEvents(anchor: string): EconomicEventRecord[] {
  const base = addDays(anchor, -28);
  const items: [number, string, string, EconomicEventRecord["importance"]][] = [
    [2, "Sample event: Manufacturing PMI release", "India", "medium"],
    [5, "Sample event: Services PMI release", "India", "low"],
    [9, "Sample event: Central bank policy announcement", "India", "high"],
    [12, "Sample event: CPI inflation release", "India", "high"],
    [12, "Sample event: Industrial production release", "India", "medium"],
    [14, "Sample event: WPI inflation release", "India", "medium"],
    [16, "Sample event: US CPI release", "United States", "high"],
    [21, "Sample event: US central bank decision", "United States", "high"],
    [26, "Sample event: Fiscal deficit data", "India", "medium"],
    [28, "Sample event: Quarterly GDP release", "India", "high"],
  ];
  return items.map(([offset, title, country, importance]) => ({
    title,
    country,
    scheduledAt: istDateTime(addDays(base, offset), 10, 0),
    importance,
    notes: "SAMPLE — placed inside the demo period for illustration. Not a real release schedule.",
    isSample: true,
  }));
}

let cached: DemoDataset | null = null;

/** Build the complete deterministic demo dataset (memoised). */
export function generateDemoDataset(): DemoDataset {
  if (cached) return cached;
  const anchor = DEMO_ANCHOR_DATE;
  const start = addDays(addYears(anchor, -DEMO_HISTORY_YEARS), 1);
  const days = weekdaysBetween(start, anchor);

  const marketRng = new SeededRandom(DEMO_SEED ^ hashString("market"));
  const market = days.map(() => marketRng.normal(0.00035, 0.0085));
  const sectorFactor = new Map<string, number[]>();
  for (const s of Object.keys(SECTORS)) {
    const rng = new SeededRandom(DEMO_SEED ^ hashString(`sector:${s}`));
    sectorFactor.set(s, days.map(() => rng.normal(0, 0.006)));
  }

  const instruments: InstrumentRecord[] = [];
  const bars = new Map<string, PriceBar[]>();
  const quotes: QuoteRecord[] = [];
  const fundamentals: FundamentalsRecord[] = [];
  const statements: FinancialStatementRecord[] = [];
  const corporateActions: CorporateActionRecord[] = [];
  const nseMembers: { company: DemoCompany; bars: PriceBar[]; exchange: Exchange }[] = [];
  const bseMembers: typeof nseMembers = [];

  DEMO_COMPANIES.forEach((c, i) => {
    const nse = generateCompanyBars(c, days, market, sectorFactor);
    const listings: [Exchange, PriceBar[]][] = [["NSE", nse]];
    if (c.bse) listings.push(["BSE", bseBars(c.symbol, nse)]);
    for (const [exchange, b] of listings) {
      instruments.push({
        symbol: c.symbol,
        exchange,
        name: c.name,
        isin: makeIsin(i),
        exchangeCode: exchange === "BSE" ? String(900100 + i * 7) : null,
        issuerKey: c.symbol,
        instrumentType: "EQUITY",
        sector: c.sector,
        industry: c.industry,
        currency: "INR",
        description: `${c.name} is a fictional ${c.industry.toLowerCase()} company used only in OpenFinance demo mode.`,
        listedSince: days[0]!,
      });
      bars.set(listingKey(exchange, c.symbol), b);
      quotes.push(quoteFromBars(c.symbol, exchange, b));
      const f = generateFundamentals(c, exchange, anchor);
      fundamentals.push(f);
      statements.push(...generateStatements(c, f, exchange));
      corporateActions.push(...generateCorporateActions(c, f, exchange, b));
      (exchange === "NSE" ? nseMembers : bseMembers).push({ company: c, bars: b, exchange });
    }
  });

  const indices: IndexRecord[] = [];
  for (const def of DEMO_INDICES) {
    const pool = (def.exchange === "NSE" ? nseMembers : bseMembers)
      .filter((m) => !def.sector || m.company.sector === def.sector)
      .sort((a, b) => b.company.marketCapCr - a.company.marketCapCr)
      .slice(0, def.count);
    const { record, bars: ib } = buildIndex(def, pool, days);
    indices.push(record);
    instruments.push(record.instrument);
    bars.set(listingKey("INDEX", def.symbol), ib);
    quotes.push(quoteFromBars(def.symbol, "INDEX", ib));
  }

  cached = {
    anchorDate: anchor,
    instruments,
    bars,
    quotes,
    fundamentals,
    statements,
    corporateActions,
    indices,
    news: generateNews(anchor),
    economic: generateEconomic(anchor),
    events: generateEvents(anchor),
  };
  return cached;
}
