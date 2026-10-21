/**
 * Risk analytics on daily data.
 *
 * Assumptions (also shown in the UI):
 *  - Returns are simple daily close-to-close returns on dates common to all series.
 *  - Annualisation uses 252 trading days.
 *  - Sharpe ratio = (mean daily return − daily risk-free) × 252 / (daily stdev × √252).
 *  - Risk-free rate is a user-supplied annual rate converted to daily as rf/252.
 *  - Dates missing from any series are dropped (inner join), never filled.
 * Historical measures describe the past; they do not predict future risk.
 */
import { maxDrawdown } from "./indicators";
import { correlation, covariance, mean, stdev, variance } from "./stats";

export const TRADING_DAYS = 252;

export type PricePoint = { date: string; close: number };

/** Inner-join several price series on date. */
export function alignSeries(series: Record<string, PricePoint[]>): { dates: string[]; closes: Record<string, number[]> } {
  const keys = Object.keys(series);
  if (keys.length === 0) return { dates: [], closes: {} };
  const maps = keys.map((k) => new Map(series[k]!.filter((p) => p.close > 0).map((p) => [p.date, p.close])));
  const dates = [...maps[0]!.keys()].filter((d) => maps.every((m) => m.has(d))).sort();
  const closes: Record<string, number[]> = {};
  keys.forEach((k, i) => (closes[k] = dates.map((d) => maps[i]!.get(d)!)));
  return { dates, closes };
}

export function simpleReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) out.push(closes[i]! / closes[i - 1]! - 1);
  return out;
}

export function annualizedVolatility(returns: number[], periodsPerYear = TRADING_DAYS): number | null {
  const sd = stdev(returns);
  return sd == null ? null : sd * Math.sqrt(periodsPerYear);
}

export function annualizedReturn(closes: number[], periodsPerYear = TRADING_DAYS): number | null {
  if (closes.length < 2 || closes[0]! <= 0) return null;
  const periods = closes.length - 1;
  return (closes[closes.length - 1]! / closes[0]!) ** (periodsPerYear / periods) - 1;
}

export function beta(asset: number[], benchmark: number[]): number | null {
  const cov = covariance(asset, benchmark);
  const v = variance(benchmark);
  if (cov == null || v == null || v === 0) return null;
  return cov / v;
}

export function sharpeRatio(returns: number[], riskFreeAnnual = 0, periodsPerYear = TRADING_DAYS): number | null {
  const m = mean(returns);
  const sd = stdev(returns);
  if (m == null || sd == null || sd === 0) return null;
  const excess = m - riskFreeAnnual / periodsPerYear;
  return (excess * periodsPerYear) / (sd * Math.sqrt(periodsPerYear));
}

export function sortinoRatio(returns: number[], riskFreeAnnual = 0, periodsPerYear = TRADING_DAYS): number | null {
  const m = mean(returns);
  if (m == null || returns.length < 2) return null;
  const rf = riskFreeAnnual / periodsPerYear;
  const downside = Math.sqrt(returns.reduce((s, r) => s + Math.min(0, r - rf) ** 2, 0) / (returns.length - 1));
  if (downside === 0) return null;
  return ((m - rf) * periodsPerYear) / (downside * Math.sqrt(periodsPerYear));
}

export function correlationMatrix(returnsByKey: Record<string, number[]>) {
  const keys = Object.keys(returnsByKey);
  const matrix = keys.map((a) => keys.map((b) => (a === b ? 1 : correlation(returnsByKey[a]!, returnsByKey[b]!))));
  return { keys, matrix };
}

/** N-period rolling return: c[i]/c[i−N] − 1. */
export function rollingReturns(closes: number[], window: number): (number | null)[] {
  return closes.map((c, i) => (i >= window && closes[i - window]! > 0 ? c / closes[i - window]! - 1 : null));
}

export interface Position {
  key: string;
  value: number;
  sector?: string | null;
}

/** Weights, Herfindahl–Hirschman index and largest-position share. */
export function concentration(positions: Position[]) {
  const total = positions.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (total <= 0) return { total: 0, weights: [], hhi: null, effectiveN: null, top: null, bySector: [] };
  const weights = positions
    .map((p) => ({ key: p.key, sector: p.sector ?? "Unclassified", weight: Math.max(0, p.value) / total }))
    .sort((a, b) => b.weight - a.weight);
  const hhi = weights.reduce((s, w) => s + w.weight ** 2, 0);
  const sectorMap = new Map<string, number>();
  for (const w of weights) sectorMap.set(w.sector, (sectorMap.get(w.sector) ?? 0) + w.weight);
  return {
    total,
    weights,
    hhi,
    effectiveN: 1 / hhi,
    top: weights[0] ?? null,
    bySector: [...sectorMap.entries()].map(([sector, weight]) => ({ sector, weight })).sort((a, b) => b.weight - a.weight),
  };
}

/** Weighted portfolio daily returns from aligned constituent returns and fixed weights. */
export function portfolioReturns(returnsByKey: Record<string, number[]>, weights: Record<string, number>): number[] {
  const keys = Object.keys(weights).filter((k) => returnsByKey[k]);
  if (keys.length === 0) return [];
  const n = Math.min(...keys.map((k) => returnsByKey[k]!.length));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(keys.reduce((s, k) => s + weights[k]! * returnsByKey[k]![i]!, 0));
  return out;
}

/** Worst rolling-window returns of a benchmark, used as historical stress windows. */
export function worstWindows(dates: string[], closes: number[], window: number, count = 3) {
  const candidates: { start: string; end: string; ret: number; startIdx: number; endIdx: number }[] = [];
  for (let i = window; i < closes.length; i++) {
    candidates.push({ start: dates[i - window]!, end: dates[i]!, ret: closes[i]! / closes[i - window]! - 1, startIdx: i - window, endIdx: i });
  }
  candidates.sort((a, b) => a.ret - b.ret);
  const picked: typeof candidates = [];
  for (const c of candidates) {
    if (picked.every((p) => c.endIdx < p.startIdx || c.startIdx > p.endIdx)) picked.push(c);
    if (picked.length >= count) break;
  }
  return picked;
}

export function riskSummary(closes: number[], benchmarkCloses: number[] | null, riskFreeAnnual: number) {
  const r = simpleReturns(closes);
  const b = benchmarkCloses ? simpleReturns(benchmarkCloses) : null;
  return {
    observations: r.length,
    annualizedReturn: annualizedReturn(closes),
    annualizedVolatility: annualizedVolatility(r),
    sharpe: sharpeRatio(r, riskFreeAnnual),
    sortino: sortinoRatio(r, riskFreeAnnual),
    maxDrawdown: maxDrawdown(closes)?.maxDrawdown ?? null,
    beta: b ? beta(r, b) : null,
    correlationToBenchmark: b ? correlation(r, b) : null,
  };
}
