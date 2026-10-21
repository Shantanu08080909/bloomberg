import { checkLedgerRemoval, type LedgerTx } from "@/lib/finance/portfolio";
import { ApiError, intParam, parseJson, route } from "@/lib/server/api";
import { assertLedgerConsistent } from "@/lib/server/ledger-guard";
import { deleteTransaction, getTransactionForUser, listTransactions, TransactionInputSchema, updateTransaction } from "@/lib/services/user-data";

export const PATCH = route<{ id: string }>(async ({ req, db, user, params }) => {
  const id = intParam(params.id);
  const existing = await getTransactionForUser(db, user.id, id);
  const body = await parseJson(req, TransactionInputSchema);
  await assertLedgerConsistent(db, user.id, existing.portfolioId, body, id);
  return { transaction: await updateTransaction(db, user.id, id, body) };
});

export const DELETE = route<{ id: string }>(async ({ db, user, params }) => {
  const id = intParam(params.id);
  const existing = await getTransactionForUser(db, user.id, id);
  const ledger: LedgerTx[] = (await listTransactions(db, user.id, existing.portfolioId)).map((r) => ({
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
  const issues = checkLedgerRemoval(ledger, id);
  if (issues.length) {
    throw new ApiError(422, `Deleting this transaction would leave the ledger inconsistent: ${issues.map((i) => i.message).join("; ")}`, "ledger_inconsistent");
  }
  await deleteTransaction(db, user.id, id);
  return { ok: true };
});
