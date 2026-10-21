import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { rsi, rollingVolatility, sma } from "@/lib/finance/indicators";
import { processLedger, valueHistory, valuePositions, type LedgerTx } from "@/lib/finance/portfolio";
import { alignSeries, concentration, riskSummary, simpleReturns, correlationMatrix, worstWindows } from "@/lib/finance/risk";
import type { ScreenRow } from "@/lib/finance/screener";
import { addDays } from "@/lib/dates";
import { getAllFundamentals, getBarsForMany, getInstrumentById, latestBarDate, listInstrumentsWithQuotes } from "./market";
import { listTransactions } from "./user-data";

/* ------------------------- Screener universe ------------------------- */

const g = globalThis as unknown as { __ofScreenCache?: Map<string, { key: string; rows: ScreenRow[] }> };
const screenCache = (g.__ofScreenCache ??= new Map());

/** Screener rows with fundamentals and technical snapshot, cached per source and latest data. */
export async function getScreenRows(db: Database, sourceId: string): Promise<ScreenRow[]> {
  const last = await latestBarDate(db, sourceId);
  const instruments = await listInstrumentsWithQuotes(db, sourceId, { types: ["EQUITY", "ETF"] });
  const quoteStamp = instruments.reduce((m, i) => Math.max(m, i.quote?.fetchedAt?.getTime() ?? 0), 0);
  const key = `${last}:${instruments.length}:${quoteStamp}`;
  const hit = screenCache.get(sourceId);
  if (hit && hit.key === key) return hit.rows;

  const fundamentals = new Map((await getAllFundamentals(db, sourceId)).map((f) => [f.instrumentId, f]));
  const from = last ? addDays(last, -400) : null;
  const bars = await getBarsForMany(db, instruments.map((i) => i.id), sourceId, from);

  const rows: ScreenRow[] = instruments.map((i) => {
    const f = fundamentals.get(i.id);
    const closes = (bars.get(i.id) ?? []).map((b) => b.close);
    const lastOf = (xs: (number | null)[]) => (xs.length ? xs[xs.length - 1] ?? null : null);
    const s50 = closes.length >= 50 ? lastOf(sma(closes, 50)) : null;
    const s200 = closes.length >= 200 ? lastOf(sma(closes, 200)) : null;
    const price = i.quote?.price ?? null;
    const vol30 = closes.length > 30 ? lastOf(rollingVolatility(closes, 30)) : null;
    return {
      instrumentId: i.id,
      symbol: i.symbol,
      exchange: i.exchange,
      name: i.name,
      sector: i.sector,
      instrumentType: i.instrumentType,
      price,
      changePct: i.quote?.changePct ?? null,
      volume: i.quote?.volume ?? null,
      marketCapCr: f?.marketCapCr ?? null,
      pe: f?.pe ?? null,
      pb: f?.pb ?? null,
      eps: f?.eps ?? null,
      revenueGrowth: f?.revenueGrowth ?? null,
      profitGrowth: f?.profitGrowth ?? null,
      roe: f?.roe ?? null,
      debtToEquity: f?.debtToEquity ?? null,
      dividendYield: f?.dividendYield ?? null,
      sma50: s50,
      sma200: s200,
      priceVsSma50: price != null && s50 ? (price / s50 - 1) * 100 : null,
      priceVsSma200: price != null && s200 ? (price / s200 - 1) * 100 : null,
      rsi14: closes.length > 14 ? lastOf(rsi(closes, 14)) : null,
      volatility30: vol30 != null ? vol30 * 100 : null,
      dataStatus: i.displayStatus,
      asOf: i.quote?.asOf?.toISOString() ?? null,
    };
  });
  screenCache.set(sourceId, { key, rows });
  return rows;
}

/* ------------------------- Portfolio analytics ------------------------ */

export async function getPortfolioSummary(db: Database, userId: string, portfolioId: number) {
  const txRows = await listTransactions(db, userId, portfolioId);
  const txs: LedgerTx[] = txRows.map((r) => ({
    id: r.tx.id,
    instrumentId: r.tx.instrumentId,
    type: r.tx.type as LedgerTx["type"],
    tradeDate: r.tx.tradeDate,
    quantity: r.tx.quantity,
    price: r.tx.price,
    fees: r.tx.fees,
    amount: r.tx.amount,
    splitRatio: r.tx.splitRatio,
  }));
  const { positions, issues } = processLedger(txs);
  const ids = [...new Set(txs.map((t) => t.instrumentId))];
  const instrumentRows = ids.length ? await Promise.all(ids.map((id) => getInstrumentById(db, id))) : [];
  const instruments = new Map(instrumentRows.filter(Boolean).map((i) => [i!.id, i!]));
  const prices = new Map<number, { price: number; asOf: Date; status: string }>();
  for (const i of instruments.values()) {
    if (i.quote) prices.set(i.id, { price: i.quote.price, asOf: i.quote.asOf, status: i.displayStatus });
  }
  const valued = valuePositions(positions, prices);
  const conc = concentration(
    valued.positions
      .filter((p) => p.quantity > 0 && p.marketValue != null)
      .map((p) => ({ key: instruments.get(p.instrumentId)?.symbol ?? String(p.instrumentId), value: p.marketValue!, sector: instruments.get(p.instrumentId)?.sector })),
  );
  return {
    txRows,
    issues,
    positions: valued.positions.map((p) => ({ ...p, instrument: instruments.get(p.instrumentId) ?? null })),
    totals: valued.totals,
    missingPrices: valued.missingPrices.map((id) => instruments.get(id)?.symbol ?? String(id)),
    concentration: conc,
    statuses: [...new Set([...prices.values()].map((p) => p.status))],
  };
}

export async function getPortfolioHistory(db: Database, userId: string, portfolioId: number, benchmarkId: number | null) {
  const txRows = await listTransactions(db, userId, portfolioId);
  if (txRows.length === 0) return { points: [], benchmark: [], note: "No transactions yet." };
  const txs: LedgerTx[] = txRows.map((r) => ({
    id: r.tx.id,
    instrumentId: r.tx.instrumentId,
    type: r.tx.type as LedgerTx["type"],
    tradeDate: r.tx.tradeDate,
    quantity: r.tx.quantity,
    price: r.tx.price,
    fees: r.tx.fees,
    amount: r.tx.amount,
    splitRatio: r.tx.splitRatio,
  }));
  const ids = [...new Set(txs.map((t) => t.instrumentId))];
  const sources = await db.select({ id: s.instruments.id, sourceId: s.instruments.sourceId }).from(s.instruments);
  const sourceOf = new Map(sources.map((r) => [r.id, r.sourceId]));
  const firstDate = txs.map((t) => t.tradeDate).sort()[0]!;
  const closes = new Map<number, Map<string, number>>();
  const allDates = new Set<string>();
  for (const id of ids) {
    const m = await getBarsForMany(db, [id], sourceOf.get(id) ?? "demo", firstDate);
    const series = m.get(id) ?? [];
    closes.set(id, new Map(series.map((b) => [b.date, b.close])));
    series.forEach((b) => allDates.add(b.date));
  }
  const dates = [...allDates].sort();
  const points = valueHistory(txs, closes, dates);
  let benchmark: { date: string; index: number }[] = [];
  if (benchmarkId && points.length) {
    const bm = (await getBarsForMany(db, [benchmarkId], sourceOf.get(benchmarkId) ?? "demo", points[0]!.date)).get(benchmarkId) ?? [];
    const base = bm[0]?.close;
    if (base) benchmark = bm.map((b) => ({ date: b.date, index: (b.close / base) * 100 }));
  }
  return {
    points,
    benchmark,
    note: points.length === 0 ? "Historical prices are not available for the holdings in this portfolio." : null,
  };
}

/* ---------------------------- Risk analytics -------------------------- */

export async function getRiskReport(
  db: Database,
  sourceId: string,
  instrumentIds: number[],
  weights: Record<number, number>,
  benchmarkId: number | null,
  riskFreeAnnual: number,
  lookbackDays = 365,
) {
  const last = await latestBarDate(db, sourceId);
  if (!last || instrumentIds.length === 0) return null;
  const from = addDays(last, -lookbackDays);
  const ids = benchmarkId ? [...new Set([...instrumentIds, benchmarkId])] : instrumentIds;
  const bars = await getBarsForMany(db, ids, sourceId, from);
  const series: Record<string, { date: string; close: number }[]> = {};
  for (const id of ids) series[String(id)] = bars.get(id) ?? [];
  const { dates, closes } = alignSeries(series);
  if (dates.length < 30) return { insufficient: true as const, observations: dates.length };
  const returns: Record<string, number[]> = {};
  for (const k of Object.keys(closes)) returns[k] = simpleReturns(closes[k]!);
  const bmCloses = benchmarkId ? closes[String(benchmarkId)]! : null;

  const perInstrument = instrumentIds.map((id) => ({ instrumentId: id, ...riskSummary(closes[String(id)]!, bmCloses, riskFreeAnnual) }));

  const totalW = instrumentIds.reduce((s2, id) => s2 + (weights[id] ?? 0), 0);
  const normW: Record<string, number> = {};
  for (const id of instrumentIds) normW[String(id)] = totalW > 0 ? (weights[id] ?? 0) / totalW : 1 / instrumentIds.length;
  // Fixed-weight (daily rebalanced) portfolio index built from aligned returns.
  const portIndex = [100];
  for (let t = 0; t < dates.length - 1; t++) {
    const r = Object.entries(normW).reduce((acc, [k, w]) => acc + w * returns[k]![t]!, 0);
    portIndex.push(portIndex[portIndex.length - 1]! * (1 + r));
  }
  const portfolio = riskSummary(portIndex, bmCloses, riskFreeAnnual);
  const corr = correlationMatrix(Object.fromEntries(instrumentIds.map((id) => [String(id), returns[String(id)]!])));
  const stress = bmCloses
    ? worstWindows(dates, bmCloses, 20, 3).map((w) => ({
        ...w,
        portfolioReturn: portIndex[w.endIdx]! / portIndex[w.startIdx]! - 1,
      }))
    : [];
  return {
    insufficient: false as const,
    from: dates[0]!,
    to: dates[dates.length - 1]!,
    observations: dates.length,
    weights: normW,
    perInstrument,
    portfolio,
    portfolioIndex: dates.map((d, i) => ({ date: d, value: portIndex[i]! })),
    benchmarkIndex: bmCloses ? dates.map((d, i) => ({ date: d, value: (bmCloses[i]! / bmCloses[0]!) * 100 })) : [],
    correlation: corr,
    stress,
  };
}
