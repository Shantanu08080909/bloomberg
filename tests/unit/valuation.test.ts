import { describe, expect, it } from "vitest";
import {
  breakEven,
  cagr,
  CalculationError,
  capmCostOfEquity,
  compoundInterest,
  dcf,
  dcfSensitivity,
  gordonDdm,
  gordonTerminalValue,
  impliedValueFromMultiples,
  pbRatio,
  peRatio,
  scenarioAnalysis,
  sipProjection,
  twoStageDdm,
  wacc,
  xirr,
} from "@/lib/finance/valuation";

describe("WACC and CAPM", () => {
  it("weights after-tax cost of debt", () => {
    const r = wacc({ equityValue: 600, debtValue: 400, costOfEquity: 0.12, costOfDebt: 0.08, taxRate: 0.25 });
    expect(r.wacc).toBeCloseTo(0.096, 12);
    expect(r.equityWeight).toBeCloseTo(0.6, 12);
  });
  it("rejects a zero capital base", () => {
    expect(() => wacc({ equityValue: 0, debtValue: 0, costOfEquity: 0.1, costOfDebt: 0.1, taxRate: 0.2 })).toThrow(CalculationError);
  });
  it("computes CAPM cost of equity", () => {
    expect(capmCostOfEquity({ riskFreeRate: 0.07, beta: 1.2, equityRiskPremium: 0.06 })).toBeCloseTo(0.142, 12);
  });
});

describe("DCF", () => {
  it("values a flat perpetuity at CF / r", () => {
    const r = dcf({ cashFlows: [100, 100], discountRate: 0.1, terminalGrowth: 0, sharesOutstanding: 10 });
    expect(r.terminalValue).toBeCloseTo(1000, 8);
    expect(r.enterpriseValue).toBeCloseTo(1000, 8);
    expect(r.perShare).toBeCloseTo(100, 8);
  });
  it("subtracts net debt and supports exit multiples", () => {
    const r = dcf({ cashFlows: [100], discountRate: 0.1, terminalMethod: "multiple", exitMultiple: 10, netDebt: 100, sharesOutstanding: 1 });
    expect(r.enterpriseValue).toBeCloseTo(100 / 1.1 + 1000 / 1.1, 8);
    expect(r.equityValue).toBeCloseTo(r.enterpriseValue - 100, 8);
  });
  it("requires discount rate above growth", () => {
    expect(() => gordonTerminalValue(100, 0.05, 0.05)).toThrow(CalculationError);
    expect(gordonTerminalValue(100, 0.1, 0.03)).toBeCloseTo(103 / 0.07, 8);
  });
  it("builds a sensitivity grid with nulls where r <= g", () => {
    const grid = dcfSensitivity({ cashFlows: [100, 100], discountRate: 0.1, sharesOutstanding: 1 }, [0.04, 0.1], [0.02, 0.05]);
    expect(grid[0]![1]).toBeNull();
    expect(grid[1]![0]).toBeGreaterThan(0);
  });
  it("validates inputs", () => {
    expect(() => dcf({ cashFlows: [], discountRate: 0.1, sharesOutstanding: 1 })).toThrow();
    expect(() => dcf({ cashFlows: [1], discountRate: 0.1, sharesOutstanding: 0 })).toThrow();
  });
});

describe("dividend discount models", () => {
  it("Gordon growth", () => {
    const r = gordonDdm({ currentDividend: 10, growth: 0.05, requiredReturn: 0.1 });
    expect(r.nextDividend).toBeCloseTo(10.5, 12);
    expect(r.value).toBeCloseTo(210, 10);
  });
  it("two-stage reduces to Gordon when growth rates match", () => {
    const two = twoStageDdm(10, 0.05, 5, 0.05, 0.1).value;
    expect(two).toBeCloseTo(210, 6);
  });
});

describe("multiples", () => {
  it("uses the median of valid peer multiples", () => {
    const r = impliedValueFromMultiples(10, [
      { name: "a", value: 10 },
      { name: "b", value: 20 },
      { name: "c", value: null },
      { name: "d", value: -5 },
      { name: "e", value: 30 },
    ])!;
    expect(r.peerCount).toBe(3);
    expect(r.medianMultiple).toBe(20);
    expect(r.impliedAtMedian).toBe(200);
  });
  it("returns null without peers", () => {
    expect(impliedValueFromMultiples(10, [])).toBeNull();
  });
  it("P/E and P/B are undefined for non-positive denominators", () => {
    expect(peRatio(100, 5)).toBe(20);
    expect(peRatio(100, 0)).toBeNull();
    expect(pbRatio(100, -1)).toBeNull();
  });
});

describe("growth calculators", () => {
  it("CAGR", () => {
    expect(cagr(100, 200, 5)).toBeCloseTo(2 ** 0.2 - 1, 12);
    expect(() => cagr(0, 1, 1)).toThrow(CalculationError);
  });
  it("compound interest with and without contributions", () => {
    expect(compoundInterest({ principal: 1000, annualRate: 0.1, years: 2, compoundsPerYear: 1 }).futureValue).toBeCloseTo(1210, 8);
    const r = compoundInterest({ principal: 0, annualRate: 0, years: 1, compoundsPerYear: 12, periodicContribution: 100 });
    expect(r.futureValue).toBeCloseTo(1200, 8);
  });
  it("SIP uses an annuity-due formula", () => {
    const r = sipProjection({ monthlyContribution: 1000, expectedAnnualReturn: 0.12, years: 1 });
    const expected = 1000 * ((1.01 ** 12 - 1) / 0.01) * 1.01;
    expect(r.futureValue).toBeCloseTo(expected, 6);
    expect(r.invested).toBe(12000);
  });
  it("SIP step-up increases contributions yearly", () => {
    const r = sipProjection({ monthlyContribution: 1000, expectedAnnualReturn: 0, years: 2, annualStepUp: 0.1 });
    expect(r.invested).toBeCloseTo(12000 + 13200, 8);
  });
});

describe("break-even, XIRR and scenarios", () => {
  it("break-even units", () => {
    expect(breakEven(1000, 50, 30).units).toBe(50);
    expect(() => breakEven(1000, 30, 30)).toThrow(CalculationError);
  });
  it("XIRR of a one-year 10% gain over a leap year", () => {
    const r = xirr([
      { date: "2020-01-01", amount: -1000 },
      { date: "2021-01-01", amount: 1100 },
    ])!;
    expect(r).toBeCloseTo(1.1 ** (365 / 366) - 1, 6);
  });
  it("XIRR needs both inflows and outflows", () => {
    expect(xirr([{ date: "2020-01-01", amount: -1 }, { date: "2020-06-01", amount: -1 }])).toBeNull();
  });
  it("scenario probabilities must sum to one", () => {
    const r = scenarioAnalysis([
      { name: "bear", probability: 0.25, value: 80 },
      { name: "base", probability: 0.5, value: 100 },
      { name: "bull", probability: 0.25, value: 140 },
    ]);
    expect(r.expectedValue).toBeCloseTo(105, 10);
    expect(() => scenarioAnalysis([{ name: "x", probability: 0.5, value: 1 }])).toThrow(CalculationError);
  });
});
