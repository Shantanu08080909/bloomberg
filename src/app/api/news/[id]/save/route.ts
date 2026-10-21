import { intParam, route } from "@/lib/server/api";
import { saveArticle, unsaveArticle } from "@/lib/services/user-data";

export const POST = route<{ id: string }>(async ({ db, user, params }) => {
  await saveArticle(db, user.id, intParam(params.id));
  return { saved: true };
});

export const DELETE = route<{ id: string }>(async ({ db, user, params }) => {
  await unsaveArticle(db, user.id, intParam(params.id));
  return { saved: false };
});
