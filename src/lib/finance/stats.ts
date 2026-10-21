/** Basic statistics. Functions return null when the input is insufficient. */

export function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample (n − 1) variance. */
export function variance(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (xs.length - 1);
}

export function stdev(xs: number[]): number | null {
  const v = variance(xs);
  return v == null ? null : Math.sqrt(v);
}

/** Population standard deviation (used by Bollinger Bands by convention). */
export function populationStdev(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const m = mean(xs)!;
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / xs.length);
}

/** Sample covariance of two equal-length series. */
export function covariance(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const ma = mean(a)!;
  const mb = mean(b)!;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i]! - ma) * (b[i]! - mb);
  return s / (a.length - 1);
}

export function correlation(a: number[], b: number[]): number | null {
  const cov = covariance(a, b);
  const sa = stdev(a);
  const sb = stdev(b);
  if (cov == null || !sa || !sb) return null;
  return cov / (sa * sb);
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
