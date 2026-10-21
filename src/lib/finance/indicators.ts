/**
 * Technical indicators. Every function returns an array aligned with its input;
 * positions without enough history are `null`. Calculation is independent of
 * chart rendering. Historical indicator values are descriptive, not predictive.
 */
import { populationStdev, stdev } from "./stats";

export type Series = (number | null)[];

export interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function assertPeriod(period: number) {
  if (!Number.isInteger(period) || period < 1) throw new RangeError("period must be a positive integer");
}

export function sma(values: number[], period: number): Series {
  assertPeriod(period);
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** EMA seeded with the SMA of the first `period` values. */
export function ema(values: number[], period: number): Series {
  assertPeriod(period);
  const out: Series = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i]!;
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** EMA over a series that may begin with nulls (used for MACD signal). */
function emaOfSeries(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const start = values.findIndex((v) => v != null);
  if (start < 0) return out;
  const dense = values.slice(start).map((v) => v as number);
  ema(dense, period).forEach((v, i) => (out[start + i] = v));
  return out;
}

/** Wilder's RSI. Returns 100 when there are no losses and 50 when flat. */
export function rsi(closes: number[], period = 14): Series {
  assertPeriod(period);
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d > 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const value = () => {
    if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
  };
  out[period] = value();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value();
  }
  return out;
}

export interface MacdResult {
  macd: Series;
  signal: Series;
  histogram: Series;
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  if (fast >= slow) throw new RangeError("fast period must be shorter than slow period");
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line: Series = closes.map((_, i) => (f[i] != null && s[i] != null ? f[i]! - s[i]! : null));
  const signal = emaOfSeries(line, signalPeriod);
  const histogram: Series = line.map((v, i) => (v != null && signal[i] != null ? v - signal[i]! : null));
  return { macd: line, signal, histogram };
}

export interface BollingerResult {
  middle: Series;
  upper: Series;
  lower: Series;
}

export function bollinger(closes: number[], period = 20, multiplier = 2): BollingerResult {
  assertPeriod(period);
  const middle = sma(closes, period);
  const upper: Series = new Array(closes.length).fill(null);
  const lower: Series = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const sd = populationStdev(closes.slice(i - period + 1, i + 1))!;
    upper[i] = middle[i]! + multiplier * sd;
    lower[i] = middle[i]! - multiplier * sd;
  }
  return { middle, upper, lower };
}

export function trueRange(bars: Pick<OHLCV, "high" | "low" | "close">[]): number[] {
  return bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1]!.close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
}

/** Wilder's Average True Range. */
export function atr(bars: Pick<OHLCV, "high" | "low" | "close">[], period = 14): Series {
  assertPeriod(period);
  const tr = trueRange(bars);
  const out: Series = new Array(bars.length).fill(null);
  if (bars.length < period) return out;
  let prev = 0;
  for (let i = 0; i < period; i++) prev += tr[i]!;
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < bars.length; i++) {
    prev = (prev * (period - 1) + tr[i]!) / period;
    out[i] = prev;
  }
  return out;
}

export function volumeAverage(volumes: number[], period = 20): Series {
  return sma(volumes, period);
}

/** Simple percentage returns: r[i] = c[i]/c[i-1] − 1; r[0] = null. Zero prices yield null. */
export function percentReturns(closes: number[]): Series {
  return closes.map((c, i) => {
    if (i === 0) return null;
    const p = closes[i - 1]!;
    return p === 0 ? null : c / p - 1;
  });
}

export function logReturns(closes: number[]): Series {
  return closes.map((c, i) => {
    if (i === 0) return null;
    const p = closes[i - 1]!;
    return p > 0 && c > 0 ? Math.log(c / p) : null;
  });
}

/** Annualised rolling volatility of log returns (sample stdev × √periodsPerYear). */
export function rollingVolatility(closes: number[], window = 20, periodsPerYear = 252): Series {
  assertPeriod(window);
  const r = logReturns(closes);
  const out: Series = new Array(closes.length).fill(null);
  for (let i = window; i < closes.length; i++) {
    const slice = r.slice(i - window + 1, i + 1);
    if (slice.some((v) => v == null)) continue;
    const sd = stdev(slice as number[]);
    out[i] = sd == null ? null : sd * Math.sqrt(periodsPerYear);
  }
  return out;
}

/** Drawdown from the running peak: d[i] = c[i]/max(c[0..i]) − 1 (≤ 0). */
export function drawdowns(closes: number[]): number[] {
  let peak = Number.NEGATIVE_INFINITY;
  return closes.map((c) => {
    peak = Math.max(peak, c);
    return peak > 0 ? c / peak - 1 : 0;
  });
}

export function maxDrawdown(closes: number[]): { maxDrawdown: number; peakIndex: number; troughIndex: number } | null {
  if (closes.length < 2) return null;
  let peak = closes[0]!;
  let peakIdx = 0;
  let best = { maxDrawdown: 0, peakIndex: 0, troughIndex: 0 };
  for (let i = 1; i < closes.length; i++) {
    if (closes[i]! > peak) {
      peak = closes[i]!;
      peakIdx = i;
    }
    const dd = peak > 0 ? closes[i]! / peak - 1 : 0;
    if (dd < best.maxDrawdown) best = { maxDrawdown: dd, peakIndex: peakIdx, troughIndex: i };
  }
  return best;
}

export const INDICATOR_DEFAULTS = {
  sma: { period: 20 },
  ema: { period: 50 },
  rsi: { period: 14 },
  macd: { fast: 12, slow: 26, signal: 9 },
  bollinger: { period: 20, multiplier: 2 },
  atr: { period: 14 },
  volumeAverage: { period: 20 },
  volatility: { window: 20 },
} as const;
