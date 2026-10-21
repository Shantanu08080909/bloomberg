import { intParam, parseJson, route } from "@/lib/server/api";
import { assertLedgerConsistent } from "@/lib/server/ledger-guard";
import { insertTransaction, listTransactions, TransactionInputSchema } from "@/lib/services/user-data";

export const GET = route<{ id: string }>(async ({ db, user, params }) => ({ transactions: await listTransactions(db, user.id, intParam(params.id)) }));

export const POST = route<{ id: string }>(async ({ req, db, user, params }) => {
  const portfolioId = intParam(params.id);
  const body = await parseJson(req, TransactionInputSchema);
  await assertLedgerConsistent(db, user.id, portfolioId, body);
  return { transaction: await insertTransaction(db, user.id, portfolioId, body) };
});
