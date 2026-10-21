import { describe, expect, it } from "vitest";
import {
  atr,
  bollinger,
  drawdowns,
  ema,
  macd,
  maxDrawdown,
  percentReturns,
  rollingVolatility,
  rsi,
  sma,
  trueRange,
  volumeAverage,
} from "@/lib/finance/indicators";

// Classic 14-period RSI worked example (Wilder smoothing), widely reproduced in
// technical-analysis references.
const RSI_CLOSES = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41,
  46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.17, 43.82, 42.66, 43.06, 43.55,
];

describe("sma", () => {
  it("averages a sliding window and pads the warm-up with null", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it("returns all nulls when history is shorter than the period", () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });
  it("rejects invalid periods", () => {
    expect(() => sma([1, 2, 3], 0)).toThrow(RangeError);
  });
});

describe("ema", () => {
  it("seeds with the SMA and applies 2/(n+1) smoothing", () => {
    // For 1..10 with period 3 (k = 0.5) the EMA lags the input by exactly one.
    const out = ema([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out.slice(2)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("rsi", () => {
  it("matches the reference worked example", () => {
    const out = rsi(RSI_CLOSES, 14);
    expect(out.slice(0, 14).every((v) => v === null)).toBe(true);
    // The published table rounds the average gain/loss to 2 dp before dividing,
    // which shifts its RSI values by ~0.07; unrounded arithmetic is used here.
    const reference = [70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42];
    reference.forEach((ref, i) => expect(Math.abs(out[14 + i]! - ref)).toBeLessThan(0.1));
  });
  it("matches a hand calculation of Wilder smoothing", () => {
    // closes 1,2,1,2 with period 2: changes +1,-1,+1
    // first avg gain = 0.5, avg loss = 0.5 → RSI 50; next: gain (0.5+1)/2 = 0.75, loss 0.25 → RS 3 → 75
    expect(rsi([1, 2, 1, 2], 2)).toEqual([null, null, 50, 75]);
  });
  it("is 100 with no losses and 50 when flat", () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3).at(-1)).toBe(100);
    expect(rsi([5, 5, 5, 5, 5], 3).at(-1)).toBe(50);
  });
  it("stays within [0, 100]", () => {
    const xs = Array.from({ length: 200 }, (_, i) => 100 + 10 * Math.sin(i / 3) + (i % 7));
    for (const v of rsi(xs, 14)) if (v != null) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(100);
  });
});

describe("macd", () => {
  it("is fast EMA minus slow EMA, with signal and histogram consistent", () => {
    const xs = Array.from({ length: 60 }, (_, i) => 100 + i + Math.sin(i));
    const { macd: line, signal, histogram } = macd(xs, 12, 26, 9);
    const f = ema(xs, 12);
    const s = ema(xs, 26);
    expect(line[24]).toBeNull();
    expect(line[25]).toBeCloseTo(f[25]! - s[25]!, 10);
    // First signal value is the SMA of the first 9 MACD values.
    const firstNine = line.slice(25, 34) as number[];
    expect(signal[33]).toBeCloseTo(firstNine.reduce((a, b) => a + b, 0) / 9, 10);
    expect(histogram[40]).toBeCloseTo(line[40]! - signal[40]!, 10);
  });
  it("rejects fast >= slow", () => {
    expect(() => macd([1, 2, 3], 26, 12)).toThrow();
  });
});

describe("bollinger", () => {
  it("uses population standard deviation", () => {
    const { middle, upper, lower } = bollinger([1, 2, 3, 4, 5], 5, 2);
    expect(middle[4]).toBe(3);
    expect(upper[4]).toBeCloseTo(3 + 2 * Math.SQRT2, 10);
    expect(lower[4]).toBeCloseTo(3 - 2 * Math.SQRT2, 10);
  });
});

describe("atr", () => {
  const bars = [
    { high: 10, low: 8, close: 9 },
    { high: 11, low: 9, close: 10 },
    { high: 15, low: 13, close: 14 },
  ];
  it("computes true range with gaps", () => {
    expect(trueRange(bars)).toEqual([2, 2, 5]);
  });
  it("applies Wilder smoothing", () => {
    expect(atr(bars, 2)).toEqual([null, 2, 3.5]);
  });
});

describe("returns, volatility and drawdown", () => {
  it("computes percentage returns and guards zero denominators", () => {
    expect(percentReturns([100, 110, 99])).toEqual([null, expect.closeTo(0.1, 10), expect.closeTo(-0.1, 10)]);
    expect(percentReturns([0, 10])).toEqual([null, null]);
  });
  it("has zero volatility for a constant growth rate", () => {
    const xs = Array.from({ length: 40 }, (_, i) => 100 * 1.01 ** i);
    const v = rollingVolatility(xs, 20);
    expect(v[19]).toBeNull();
    expect(v[30]).toBeCloseTo(0, 10);
  });
  it("finds drawdowns from the running peak", () => {
    expect(drawdowns([100, 120, 90, 130])).toEqual([0, 0, -0.25, 0]);
    expect(maxDrawdown([100, 120, 90, 130])).toEqual({ maxDrawdown: -0.25, peakIndex: 1, troughIndex: 2 });
    expect(maxDrawdown([1])).toBeNull();
  });
  it("averages volume", () => {
    expect(volumeAverage([10, 20, 30], 2)).toEqual([null, 15, 25]);
  });
});
