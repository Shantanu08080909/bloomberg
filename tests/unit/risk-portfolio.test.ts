import { describe, expect, it } from "vitest";
import { checkLedgerChange, processLedger, valueHistory, valuePositions, type LedgerTx } from "@/lib/finance/portfolio";
import {
  alignSeries,
  annualizedVolatility,
  beta,
  concentration,
  correlationMatrix,
  rollingReturns,
  sharpeRatio,
  simpleReturns,
  worstWindows,
} from "@/lib/finance/risk";

const tx = (p: Partial<LedgerTx> & Pick<LedgerTx, "id" | "type" | "tradeDate">): LedgerTx => ({
  instrumentId: 1,
  quantity: 0,
  price: 0,
  fees: 0,
  ...p,
});

describe("portfolio ledger (weighted average cost)", () => {
  const ledger: LedgerTx[] = [
    tx({ id: 1, type: "BUY", tradeDate: "2024-01-01", quantity: 10, price: 100, fees: 10 }),
    tx({ id: 2, type: "BUY", tradeDate: "2024-02-01", quantity: 10, price: 120 }),
    tx({ id: 3, type: "SELL", tradeDate: "2024-03-01", quantity: 5, price: 130, fees: 5 }),
  ];

  it("tracks quantity, cost basis and realised P&L", () => {
    const { positions, issues } = processLedger(ledger);
    expect(issues).toEqual([]);
    const p = positions[0]!;
    expect(p.quantity).toBe(15);
    expect(p.costBasis).toBeCloseTo(2210 - 5 * 110.5, 10);
    expect(p.averageCost).toBeCloseTo(110.5, 10);
    expect(p.realizedPnl).toBeCloseTo(650 - 5 - 552.5, 10);
    expect(p.feesPaid).toBe(15);
  });

  it("splits change quantity but not cost basis", () => {
    const { positions } = processLedger([...ledger, tx({ id: 4, type: "SPLIT", tradeDate: "2024-04-01", splitRatio: 2 })]);
    expect(positions[0]!.quantity).toBe(30);
    expect(positions[0]!.averageCost).toBeCloseTo(110.5 / 2, 10);
  });

  it("rejects overselling and skips the bad transaction", () => {
    const { positions, issues } = processLedger([...ledger, tx({ id: 5, type: "SELL", tradeDate: "2024-05-01", quantity: 100, price: 1 })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("error");
    expect(positions[0]!.quantity).toBe(15);
  });

  it("orders by trade date, so a back-dated sell before any buy is an error", () => {
    const issues = checkLedgerChange(ledger, tx({ id: 9, type: "SELL", tradeDate: "2023-12-01", quantity: 1, price: 100 }));
    expect(issues.map((i) => i.txId)).toContain(9);
  });

  it("flags edits that make later sells invalid", () => {
    const issues = checkLedgerChange(ledger, tx({ id: 2, type: "BUY", tradeDate: "2024-02-01", quantity: 1, price: 120 }));
    expect(issues.some((i) => i.txId === 3)).toBe(false); // 11 held, selling 5 is fine
    const worse = checkLedgerChange(ledger, tx({ id: 1, type: "BUY", tradeDate: "2024-01-01", quantity: 1, price: 100 }));
    expect(worse).toEqual([]); // 11 held at sell time
    const invalid = checkLedgerChange(
      [tx({ id: 1, type: "BUY", tradeDate: "2024-01-01", quantity: 5, price: 100 }), tx({ id: 2, type: "SELL", tradeDate: "2024-02-01", quantity: 5, price: 100 })],
      tx({ id: 1, type: "BUY", tradeDate: "2024-01-01", quantity: 2, price: 100 }),
    );
    expect(invalid.some((i) => i.txId === 2)).toBe(true);
  });

  it("records dividends and warns when no shares are held", () => {
    const { positions, issues } = processLedger([tx({ id: 1, type: "DIVIDEND", tradeDate: "2024-01-01", amount: 50 })]);
    expect(positions[0]!.dividendIncome).toBe(50);
    expect(issues[0]!.severity).toBe("warning");
  });

  it("rejects invalid field values", () => {
    const { issues } = processLedger([tx({ id: 1, type: "BUY", tradeDate: "2024-01-01", quantity: -1, price: 10 })]);
    expect(issues[0]!.message).toMatch(/Quantity/);
  });

  it("values positions and reports missing prices instead of guessing", () => {
    const { positions } = processLedger(ledger);
    const priced = valuePositions(positions, new Map([[1, { price: 150, asOf: new Date(), status: "demo" }]]));
    expect(priced.totals.marketValue).toBe(2250);
    expect(priced.positions[0]!.unrealizedPnl).toBeCloseTo(2250 - 1657.5, 10);
    const missing = valuePositions(positions, new Map());
    expect(missing.totals.marketValue).toBeNull();
    expect(missing.missingPrices).toEqual([1]);
  });

  it("time-weighted return ignores contributions", () => {
    const d = ["2024-01-01", "2024-01-02", "2024-01-03"];
    const closes = new Map([[1, new Map([[d[0]!, 100], [d[1]!, 110], [d[2]!, 110]])]]);
    const hist = valueHistory(
      [
        tx({ id: 1, type: "BUY", tradeDate: d[0]!, quantity: 10, price: 100 }),
        tx({ id: 2, type: "BUY", tradeDate: d[2]!, quantity: 10, price: 110 }),
      ],
      closes,
      d,
    );
    expect(hist.map((h) => h.value)).toEqual([1000, 1100, 2200]);
    expect(hist[2]!.twrIndex).toBeCloseTo(110, 10);
  });
});

describe("risk analytics", () => {
  it("aligns series by inner join on date", () => {
    const r = alignSeries({
      a: [{ date: "1", close: 1 }, { date: "2", close: 2 }, { date: "3", close: 3 }],
      b: [{ date: "2", close: 20 }, { date: "3", close: 30 }],
    });
    expect(r.dates).toEqual(["2", "3"]);
    expect(r.closes.a).toEqual([2, 3]);
  });

  it("beta of a series to itself is 1 and to a 2x series is 2", () => {
    const b = [0.01, -0.02, 0.015, 0.003, -0.007];
    expect(beta(b, b)).toBeCloseTo(1, 12);
    expect(beta(b.map((x) => 2 * x), b)).toBeCloseTo(2, 12);
  });

  it("annualises volatility with √252", () => {
    const r = [0.01, -0.01, 0.01, -0.01];
    const sd = Math.sqrt((4 * 0.0001) / 3);
    expect(annualizedVolatility(r)).toBeCloseTo(sd * Math.sqrt(252), 12);
  });

  it("Sharpe is null for zero variance and uses the risk-free rate", () => {
    expect(sharpeRatio([0.01, 0.01, 0.01])).toBeNull();
    const r = [0.002, 0.001, 0.003, -0.001];
    expect(sharpeRatio(r, 0.252)!).toBeLessThan(sharpeRatio(r, 0)!);
  });

  it("correlation matrix has a unit diagonal", () => {
    const m = correlationMatrix({ a: [1, 2, 3], b: [3, 2, 1] });
    expect(m.matrix[0]![0]).toBe(1);
    expect(m.matrix[0]![1]).toBeCloseTo(-1, 12);
  });

  it("concentration: equal weights give HHI = 1/N", () => {
    const c = concentration([
      { key: "a", value: 10, sector: "X" },
      { key: "b", value: 10, sector: "X" },
      { key: "c", value: 10, sector: "Y" },
      { key: "d", value: 10, sector: null },
    ]);
    expect(c.hhi).toBeCloseTo(0.25, 12);
    expect(c.effectiveN).toBeCloseTo(4, 12);
    expect(c.bySector[0]).toEqual({ sector: "X", weight: 0.5 });
  });

  it("rolling returns and worst windows", () => {
    expect(rollingReturns([100, 110, 121], 2)).toEqual([null, null, expect.closeTo(0.21, 10)]);
    const closes = [100, 90, 80, 85, 95, 100, 70, 72];
    const dates = closes.map((_, i) => `d${i}`);
    const w = worstWindows(dates, closes, 1, 2);
    expect(w[0]!.ret).toBeCloseTo(-0.3, 10);
    expect(simpleReturns([100, 110])).toEqual([expect.closeTo(0.1, 12)]);
  });
});
