import { parseJson, route } from "@/lib/server/api";
import { createPortfolio, listPortfolios, PortfolioInputSchema } from "@/lib/services/user-data";

export const GET = route(async ({ db, user }) => ({ portfolios: await listPortfolios(db, user.id) }));

export const POST = route(async ({ req, db, user }) => {
  const body = await parseJson(req, PortfolioInputSchema);
  return { portfolio: await createPortfolio(db, user.id, body) };
});
