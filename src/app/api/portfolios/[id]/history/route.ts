import { intParam, route } from "@/lib/server/api";
import { getPortfolioHistory } from "@/lib/services/analytics";
import { getOwnedPortfolio } from "@/lib/services/user-data";

export const GET = route<{ id: string }>(async ({ db, user, params }) => {
  const id = intParam(params.id);
  const p = await getOwnedPortfolio(db, user.id, id);
  return getPortfolioHistory(db, user.id, id, p.benchmarkInstrumentId);
});
