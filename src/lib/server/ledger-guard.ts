import "server-only";
import type { Database } from "@/lib/db/client";
import { checkLedgerChange, type LedgerTx } from "@/lib/finance/portfolio";
import { listTransactions, type TransactionInput, TransactionInputSchema } from "@/lib/services/user-data";
import { ApiError } from "./api";

/** Reject a transaction that would make the ledger inconsistent (e.g. overselling). */
export async function assertLedgerConsistent(db: Database, userId: string, portfolioId: number, input: TransactionInput, txId = -1) {
  const t = TransactionInputSchema.parse(input);
  const existing: LedgerTx[] = (await listTransactions(db, userId, portfolioId)).map((r) => ({
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
  const issues = checkLedgerChange(existing, { id: txId, ...t, amount: t.amount ?? null, splitRatio: t.splitRatio ?? null });
  if (issues.length) throw new ApiError(422, issues.map((i) => i.message).join("; "), "ledger_inconsistent");
}
