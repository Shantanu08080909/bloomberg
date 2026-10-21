/**
 * Valuation and personal-finance calculators. Inputs are user assumptions;
 * outputs are arithmetic consequences of those assumptions, not forecasts.
 * Rates are decimals (0.12 = 12 %).
 */
import { z } from "zod";
import { median } from "./stats";

export class CalculationError extends Error {}

const rate = z.number().finite().gt(-1).lt(10);
const positive = z.number().finite().positive();
const nonNegative = z.number().finite().min(0);

/* ---------------------------- CAPM / WACC ---------------------------- */

export const CapmSchema = z.object({ riskFreeRate: rate, beta: z.number().finite().min(-5).max(10), equityRiskPremium: rate });

export function capmCostOfEquity(input: z.infer<typeof CapmSchema>): number {
  const { riskFreeRate, beta, equityRiskPremium } = CapmSchema.parse(input);
  return riskFreeRate + beta * equityRiskPremium;
}

export const WaccSchema = z.object({
  equityValue: nonNegative,
  debtValue: nonNegative,
  costOfEquity: rate,
  costOfDebt: rate,
  taxRate: z.number().finite().min(0).max(1),
});

export function wacc(input: z.infer<typeof WaccSchema>) {
  const p = WaccSchema.parse(input);
  const v = p.equityValue + p.debtValue;
  if (v === 0) throw new CalculationError("Equity value plus debt value must be greater than zero");
  const we = p.equityValue / v;
  const wd = p.debtValue / v;
  const afterTaxCostOfDebt = p.costOfDebt * (1 - p.taxRate);
  return { wacc: we * p.costOfEquity + wd * afterTaxCostOfDebt, equityWeight: we, debtWeight: wd, afterTaxCostOfDebt };
}

/* --------------------------- Terminal value -------------------------- */

export function gordonTerminalValue(finalCashFlow: number, discountRate: number, growth: number): number {
  if (discountRate <= growth) throw new CalculationError("Discount rate must exceed the terminal growth rate");
  return (finalCashFlow * (1 + growth)) / (discountRate - growth);
}

export function exitMultipleTerminalValue(finalMetric: number, multiple: number): number {
  if (multiple < 0) throw new CalculationError("Exit multiple cannot be negative");
  return finalMetric * multiple;
}

/* -------------------------------- DCF -------------------------------- */

export const DcfSchema = z.object({
  /** Free cash flows for years 1..n (e.g. INR crore). */
  cashFlows: z.array(z.number().finite()).min(1).max(30),
  discountRate: rate,
  terminalMethod: z.enum(["gordon", "multiple"]).default("gordon"),
  terminalGrowth: rate.default(0.04),
  exitMultiple: z.number().finite().min(0).default(10),
  /** Debt minus cash, same units as cash flows. */
  netDebt: z.number().finite().default(0),
  /** Shares outstanding in the unit that makes per-share values meaningful. */
  sharesOutstanding: positive,
  /** Discount cash flows at mid-year instead of year end. */
  midYear: z.boolean().default(false),
});
export type DcfInput = z.input<typeof DcfSchema>;

export function dcf(input: DcfInput) {
  const p = DcfSchema.parse(input);
  const r = p.discountRate;
  const rows = p.cashFlows.map((cf, i) => {
    const t = p.midYear ? i + 0.5 : i + 1;
    const factor = 1 / (1 + r) ** t;
    return { year: i + 1, cashFlow: cf, discountFactor: factor, presentValue: cf * factor };
  });
  const n = p.cashFlows.length;
  const last = p.cashFlows[n - 1]!;
  const terminalValue =
    p.terminalMethod === "gordon"
      ? gordonTerminalValue(last, r, p.terminalGrowth)
      : exitMultipleTerminalValue(last, p.exitMultiple);
  const pvTerminal = terminalValue / (1 + r) ** n;
  const pvCashFlows = rows.reduce((s, x) => s + x.presentValue, 0);
  const enterpriseValue = pvCashFlows + pvTerminal;
  const equityValue = enterpriseValue - p.netDebt;
  return {
    rows,
    pvCashFlows,
    terminalValue,
    pvTerminal,
    enterpriseValue,
    equityValue,
    perShare: equityValue / p.sharesOutstanding,
    terminalShare: enterpriseValue === 0 ? null : pvTerminal / enterpriseValue,
  };
}

/** Per-share value across a grid of discount rates × terminal growth rates. */
export function dcfSensitivity(base: DcfInput, discountRates: number[], growthRates: number[]) {
  return discountRates.map((r) =>
    growthRates.map((g) => {
      if (r <= g) return null;
      try {
        return dcf({ ...base, discountRate: r, terminalGrowth: g, terminalMethod: "gordon" }).perShare;
      } catch {
        return null;
      }
    }),
  );
}

/* -------------------------- Dividend discount ------------------------ */

export const DdmSchema = z.object({ currentDividend: nonNegative, growth: rate, requiredReturn: rate });

export function gordonDdm(input: z.infer<typeof DdmSchema>) {
  const p = DdmSchema.parse(input);
  if (p.requiredReturn <= p.growth) throw new CalculationError("Required return must exceed dividend growth");
  const nextDividend = p.currentDividend * (1 + p.growth);
  return { nextDividend, value: nextDividend / (p.requiredReturn - p.growth) };
}

/** Two-stage DDM: high growth for `years`, then stable growth. */
export function twoStageDdm(
  currentDividend: number,
  highGrowth: number,
  years: number,
  stableGrowth: number,
  requiredReturn: number,
) {
  if (requiredReturn <= stableGrowth) throw new CalculationError("Required return must exceed stable growth");
  let d = currentDividend;
  let pv = 0;
  for (let t = 1; t <= years; t++) {
    d *= 1 + highGrowth;
    pv += d / (1 + requiredReturn) ** t;
  }
  const terminal = (d * (1 + stableGrowth)) / (requiredReturn - stableGrowth);
  return { value: pv + terminal / (1 + requiredReturn) ** years, pvDividends: pv, terminalValue: terminal };
}

/* ----------------------------- Multiples ----------------------------- */

export interface PeerMultiple {
  name: string;
  value: number | null;
}

export function impliedValueFromMultiples(metricPerShare: number, peers: PeerMultiple[]) {
  const valid = peers.map((p) => p.value).filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  if (valid.length === 0) return null;
  const med = median(valid)!;
  const avg = valid.reduce((s, v) => s + v, 0) / valid.length;
  return {
    peerCount: valid.length,
    medianMultiple: med,
    meanMultiple: avg,
    impliedAtMedian: metricPerShare * med,
    impliedAtMean: metricPerShare * avg,
    low: metricPerShare * Math.min(...valid),
    high: metricPerShare * Math.max(...valid),
  };
}

export function peRatio(price: number, eps: number): number | null {
  return eps > 0 ? price / eps : null;
}

export function pbRatio(price: number, bookValuePerShare: number): number | null {
  return bookValuePerShare > 0 ? price / bookValuePerShare : null;
}

/* ------------------------- Growth & compounding ---------------------- */

export function cagr(startValue: number, endValue: number, years: number): number {
  if (startValue <= 0 || endValue < 0) throw new CalculationError("Start value must be positive and end value non-negative");
  if (years <= 0) throw new CalculationError("Years must be positive");
  return (endValue / startValue) ** (1 / years) - 1;
}

export const CompoundSchema = z.object({
  principal: nonNegative,
  annualRate: rate,
  years: z.number().finite().positive().max(100),
  compoundsPerYear: z.number().int().min(1).max(365).default(12),
  /** Contribution added at the end of each compounding period. */
  periodicContribution: nonNegative.default(0),
});

export function compoundInterest(input: z.input<typeof CompoundSchema>) {
  const p = CompoundSchema.parse(input);
  const i = p.annualRate / p.compoundsPerYear;
  const n = Math.round(p.years * p.compoundsPerYear);
  const growth = (1 + i) ** n;
  const fvPrincipal = p.principal * growth;
  const fvContrib = i === 0 ? p.periodicContribution * n : p.periodicContribution * ((growth - 1) / i);
  const invested = p.principal + p.periodicContribution * n;
  const futureValue = fvPrincipal + fvContrib;
  return { futureValue, invested, interestEarned: futureValue - invested, periods: n };
}

export const SipSchema = z.object({
  monthlyContribution: positive,
  expectedAnnualReturn: rate,
  years: z.number().int().min(1).max(60),
  /** Annual increase in the monthly contribution, e.g. 0.1 for 10 %. */
  annualStepUp: z.number().finite().min(0).max(1).default(0),
});

/**
 * SIP projection with contributions at the start of each month (annuity due)
 * and monthly compounding at expectedAnnualReturn / 12.
 */
export function sipProjection(input: z.input<typeof SipSchema>) {
  const p = SipSchema.parse(input);
  const i = p.expectedAnnualReturn / 12;
  let value = 0;
  let invested = 0;
  let contribution = p.monthlyContribution;
  const yearly: { year: number; invested: number; value: number }[] = [];
  for (let y = 1; y <= p.years; y++) {
    for (let m = 0; m < 12; m++) {
      value = (value + contribution) * (1 + i);
      invested += contribution;
    }
    yearly.push({ year: y, invested, value });
    contribution *= 1 + p.annualStepUp;
  }
  return { futureValue: value, invested, gain: value - invested, yearly };
}

/* ----------------------------- Break-even ---------------------------- */

export function breakEven(fixedCosts: number, pricePerUnit: number, variableCostPerUnit: number) {
  const contribution = pricePerUnit - variableCostPerUnit;
  if (contribution <= 0) throw new CalculationError("Price per unit must exceed variable cost per unit");
  if (fixedCosts < 0) throw new CalculationError("Fixed costs cannot be negative");
  const units = fixedCosts / contribution;
  return { units, revenue: units * pricePerUnit, contributionMargin: contribution, contributionMarginRatio: contribution / pricePerUnit };
}

/* ------------------------------ Returns ------------------------------ */

export interface CashFlow {
  date: string;
  /** Negative = money invested, positive = money received (incl. final value). */
  amount: number;
}

/** Annualised money-weighted return (XIRR) using Newton's method with bisection fallback. */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const hasNeg = flows.some((f) => f.amount < 0);
  const hasPos = flows.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;
  const t0 = Date.parse(flows[0]!.date);
  const years = flows.map((f) => (Date.parse(f.date) - t0) / (365 * 86_400_000));
  const npv = (r: number) => flows.reduce((s, f, k) => s + f.amount / (1 + r) ** years[k]!, 0);
  const dnpv = (r: number) => flows.reduce((s, f, k) => s - (years[k]! * f.amount) / (1 + r) ** (years[k]! + 1), 0);
  let r = 0.1;
  for (let iter = 0; iter < 100; iter++) {
    const v = npv(r);
    const d = dnpv(r);
    if (Math.abs(v) < 1e-7) return r;
    if (d === 0 || !Number.isFinite(d)) break;
    const next = r - v / d;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  let lo = -0.9999;
  let hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let iter = 0; iter < 200; iter++) {
    const mid = (lo + hi) / 2;
    const v = npv(mid);
    if (Math.abs(v) < 1e-7) return mid;
    if (npv(lo) * v < 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function simpleReturn(startValue: number, endValue: number, netContributions = 0): number | null {
  if (startValue + netContributions <= 0) return null;
  return (endValue - startValue - netContributions) / (startValue + netContributions);
}

/* ------------------------------ Scenarios ---------------------------- */

export interface Scenario {
  name: string;
  probability: number;
  value: number;
}

export function scenarioAnalysis(scenarios: Scenario[]) {
  if (scenarios.length === 0) throw new CalculationError("Add at least one scenario");
  const total = scenarios.reduce((s, x) => s + x.probability, 0);
  if (Math.abs(total - 1) > 1e-6) throw new CalculationError("Scenario probabilities must sum to 100 %");
  if (scenarios.some((s) => s.probability < 0)) throw new CalculationError("Probabilities cannot be negative");
  const expected = scenarios.reduce((s, x) => s + x.probability * x.value, 0);
  const variance = scenarios.reduce((s, x) => s + x.probability * (x.value - expected) ** 2, 0);
  return { expectedValue: expected, standardDeviation: Math.sqrt(variance), min: Math.min(...scenarios.map((s) => s.value)), max: Math.max(...scenarios.map((s) => s.value)) };
}
