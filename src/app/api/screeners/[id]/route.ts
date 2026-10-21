import { intParam, route } from "@/lib/server/api";
import { deleteScreener } from "@/lib/services/user-data";

export const DELETE = route<{ id: string }>(async ({ db, user, params }) => {
  await deleteScreener(db, user.id, intParam(params.id));
  return { ok: true };
});
