import { intParam, parseJson, route } from "@/lib/server/api";
import { portfolioSummaryDTO } from "@/lib/server/portfolio-dto";
import { deletePortfolio, PortfolioInputSchema, updatePortfolio } from "@/lib/services/user-data";

export const GET = route<{ id: string }>(async ({ db, user, params }) => portfolioSummaryDTO(db, user.id, intParam(params.id)));

export const PATCH = route<{ id: string }>(async ({ req, db, user, params }) => {
  const body = await parseJson(req, PortfolioInputSchema.partial());
  return { portfolio: await updatePortfolio(db, user.id, intParam(params.id), body) };
});

export const DELETE = route<{ id: string }>(async ({ db, user, params }) => {
  await deletePortfolio(db, user.id, intParam(params.id));
  return { ok: true };
});
