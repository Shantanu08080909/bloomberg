/**
 * Paper-portfolio ledger accounting.
 *
 * Method: WEIGHTED AVERAGE COST per instrument.
 *  - BUY adds quantity; cost basis increases by quantity × price + fees.
 *  - SELL removes quantity at the current average cost; realised P&L =
 *    quantity × price − fees − quantity × average cost.
 *  - DIVIDEND adds cash income (the `amount` field, total received); it does not
 *    change cost basis.
 *  - SPLIT / BONUS multiplies quantity by `splitRatio` (new shares per old
 *    share); cost basis is unchanged, so average cost falls proportionally.
 *  - Transactions are processed by trade date, then by entry order.
 *  - Taxes (STT, stamp duty, GST, capital-gains tax) are not modelled except
 *    where included by the user in `fees`. Indian capital-gains reporting uses
 *    FIFO and holding-period rules that this ledger does NOT implement, so its
 *    output is not suitable for tax filing.
 *  - Symbol changes and mergers are not modelled; record them manually.
 */

export type TxType = "BUY" | "SELL" | "DIVIDEND" | "SPLIT";

export interface LedgerTx {
  id: number;
  instrumentId: number;
  type: TxType;
  tradeDate: string;
  quantity: number;
  price: number;
  fees: number;
  amount?: number | null;
  splitRatio?: number | null;
}

export interface LedgerIssue {
  txId: number;
  instrumentId: number;
  severity: "error" | "warning";
  message: string;
}

export interface PositionState {
  instrumentId: number;
  quantity: number;
  costBasis: number;
  averageCost: number | null;
  realizedPnl: number;
  dividendIncome: number;
  feesPaid: number;
  investedTotal: number;
  proceedsTotal: number;
  firstTradeDate: string | null;
}

const EPS = 1e-9;

export function sortTransactions<T extends Pick<LedgerTx, "tradeDate" | "id">>(txs: T[]): T[] {
  return [...txs].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id);
}

/** Validate a single transaction's fields (independent of ledger order). */
export function validateTransactionFields(tx: Omit<LedgerTx, "id" | "instrumentId">): string[] {
  const errs: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.tradeDate)) errs.push("Trade date must be YYYY-MM-DD");
  if (!Number.isFinite(tx.fees) || tx.fees < 0) errs.push("Fees cannot be negative");
  switch (tx.type) {
    case "BUY":
    case "SELL":
      if (!(tx.quantity > 0)) errs.push("Quantity must be greater than zero");
      if (!(tx.price > 0)) errs.push("Price must be greater than zero");
      break;
    case "DIVIDEND":
      if (!(tx.amount != null && tx.amount > 0)) errs.push("Dividend amount must be greater than zero");
      break;
    case "SPLIT":
      if (!(tx.splitRatio != null && tx.splitRatio > 0)) errs.push("Split ratio must be greater than zero");
      break;
  }
  return errs;
}

function emptyPosition(instrumentId: number): PositionState {
  return {
    instrumentId,
    quantity: 0,
    costBasis: 0,
    averageCost: null,
    realizedPnl: 0,
    dividendIncome: 0,
    feesPaid: 0,
    investedTotal: 0,
    proceedsTotal: 0,
    firstTradeDate: null,
  };
}

/** Replay a ledger. Invalid transactions are reported and skipped, never silently applied. */
export function processLedger(txs: LedgerTx[], asOf?: string) {
  const positions = new Map<number, PositionState>();
  const issues: LedgerIssue[] = [];
  for (const tx of sortTransactions(txs)) {
    if (asOf && tx.tradeDate > asOf) continue;
    const pos = positions.get(tx.instrumentId) ?? emptyPosition(tx.instrumentId);
    positions.set(tx.instrumentId, pos);
    const fieldErrors = validateTransactionFields(tx);
    if (fieldErrors.length) {
      for (const message of fieldErrors) issues.push({ txId: tx.id, instrumentId: tx.instrumentId, severity: "error", message });
      continue;
    }
    switch (tx.type) {
      case "BUY": {
        pos.quantity += tx.quantity;
        pos.costBasis += tx.quantity * tx.price + tx.fees;
        pos.feesPaid += tx.fees;
        pos.investedTotal += tx.quantity * tx.price + tx.fees;
        pos.firstTradeDate ??= tx.tradeDate;
        break;
      }
      case "SELL": {
        if (tx.quantity > pos.quantity + EPS) {
          issues.push({
            txId: tx.id,
            instrumentId: tx.instrumentId,
            severity: "error",
            message: `Sell of ${tx.quantity} exceeds holding of ${round6(pos.quantity)} on ${tx.tradeDate}; transaction ignored`,
          });
          continue;
        }
        const avg = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
        const proceeds = tx.quantity * tx.price - tx.fees;
        pos.realizedPnl += proceeds - tx.quantity * avg;
        pos.costBasis -= tx.quantity * avg;
        pos.quantity -= tx.quantity;
        pos.feesPaid += tx.fees;
        pos.proceedsTotal += proceeds;
        if (pos.quantity < EPS) {
          pos.quantity = 0;
          pos.costBasis = 0;
        }
        break;
      }
      case "DIVIDEND": {
        if (pos.quantity <= EPS) {
          issues.push({ txId: tx.id, instrumentId: tx.instrumentId, severity: "warning", message: `Dividend recorded on ${tx.tradeDate} with no shares held` });
        }
        pos.dividendIncome += tx.amount!;
        break;
      }
      case "SPLIT": {
        if (pos.quantity <= EPS) {
          issues.push({ txId: tx.id, instrumentId: tx.instrumentId, severity: "warning", message: `Split recorded on ${tx.tradeDate} with no shares held` });
        }
        pos.quantity *= tx.splitRatio!;
        break;
      }
    }
    pos.averageCost = pos.quantity > EPS ? pos.costBasis / pos.quantity : null;
  }
  return { positions: [...positions.values()], issues };
}

/** Would adding/replacing this transaction create an inconsistent ledger? */
export function checkLedgerChange(existing: LedgerTx[], candidate: LedgerTx): LedgerIssue[] {
  const next = existing.filter((t) => t.id !== candidate.id).concat(candidate);
  const before = new Set(processLedger(existing).issues.map((i) => `${i.txId}:${i.message}`));
  return processLedger(next).issues.filter((i) => i.severity === "error" && !before.has(`${i.txId}:${i.message}`));
}

export interface ValuedPosition extends PositionState {
  price: number | null;
  priceAsOf: Date | null;
  priceStatus: string | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPct: number | null;
}

export function valuePositions(
  positions: PositionState[],
  prices: Map<number, { price: number; asOf: Date; status: string }>,
): { positions: ValuedPosition[]; totals: PortfolioTotals; missingPrices: number[] } {
  const missing: number[] = [];
  const valued = positions.map((p) => {
    const q = prices.get(p.instrumentId);
    if (!q && p.quantity > EPS) missing.push(p.instrumentId);
    const mv = q && p.quantity > EPS ? p.quantity * q.price : p.quantity > EPS ? null : 0;
    const unreal = mv != null && p.quantity > EPS ? mv - p.costBasis : p.quantity > EPS ? null : 0;
    return {
      ...p,
      price: q?.price ?? null,
      priceAsOf: q?.asOf ?? null,
      priceStatus: q?.status ?? null,
      marketValue: mv,
      unrealizedPnl: unreal,
      unrealizedPct: unreal != null && p.costBasis > 0 ? unreal / p.costBasis : null,
    };
  });
  const open = valued.filter((v) => v.quantity > EPS);
  const complete = missing.length === 0;
  const totals: PortfolioTotals = {
    costBasis: sum(open.map((v) => v.costBasis)),
    marketValue: complete ? sum(open.map((v) => v.marketValue ?? 0)) : null,
    unrealizedPnl: complete ? sum(open.map((v) => v.unrealizedPnl ?? 0)) : null,
    realizedPnl: sum(valued.map((v) => v.realizedPnl)),
    dividendIncome: sum(valued.map((v) => v.dividendIncome)),
    feesPaid: sum(valued.map((v) => v.feesPaid)),
    openPositions: open.length,
    complete,
  };
  return { positions: valued, totals, missingPrices: missing };
}

export interface PortfolioTotals {
  costBasis: number;
  marketValue: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number;
  dividendIncome: number;
  feesPaid: number;
  openPositions: number;
  complete: boolean;
}

/**
 * Daily portfolio value from the ledger and close prices, plus a
 * time-weighted return index that neutralises buys and sells:
 *   r_t = (V_t − F_t) / V_{t−1} − 1, where F_t = net cash put into holdings on day t
 *   (buys + fees − sell proceeds; dividends count as returned cash, i.e. negative flow).
 * Days where any held instrument lacks a price are skipped.
 */
export function valueHistory(
  txs: LedgerTx[],
  closesByInstrument: Map<number, Map<string, number>>,
  dates: string[],
) {
  const sorted = sortTransactions(txs);
  const qty = new Map<number, number>();
  const out: { date: string; value: number; netFlow: number; twrIndex: number }[] = [];
  let k = 0;
  let prevValue: number | null = null;
  let index = 100;
  for (const date of dates) {
    let flow = 0;
    while (k < sorted.length && sorted[k]!.tradeDate <= date) {
      const tx = sorted[k++]!;
      if (validateTransactionFields(tx).length) continue;
      const q = qty.get(tx.instrumentId) ?? 0;
      if (tx.type === "BUY") {
        qty.set(tx.instrumentId, q + tx.quantity);
        flow += tx.quantity * tx.price + tx.fees;
      } else if (tx.type === "SELL") {
        if (tx.quantity > q + EPS) continue;
        qty.set(tx.instrumentId, q - tx.quantity);
        flow -= tx.quantity * tx.price - tx.fees;
      } else if (tx.type === "DIVIDEND") {
        flow -= tx.amount ?? 0;
      } else if (tx.type === "SPLIT") {
        qty.set(tx.instrumentId, q * (tx.splitRatio ?? 1));
      }
    }
    let value = 0;
    let complete = true;
    for (const [id, q] of qty) {
      if (q <= EPS) continue;
      const c = closesByInstrument.get(id)?.get(date);
      if (c == null) {
        complete = false;
        break;
      }
      value += q * c;
    }
    if (!complete) continue;
    if (prevValue != null && prevValue > 0) index *= (value - flow) / prevValue;
    if (value > 0 || prevValue != null) out.push({ date, value, netFlow: flow, twrIndex: index });
    prevValue = value;
  }
  return out;
}

function sum(xs: number[]) {
  return xs.reduce((s, x) => s + x, 0);
}

function round6(x: number) {
  return Math.round(x * 1e6) / 1e6;
}
