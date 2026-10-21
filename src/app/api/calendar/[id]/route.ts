import { intParam, route } from "@/lib/server/api";
import { deleteEvent } from "@/lib/services/user-data";

export const DELETE = route<{ id: string }>(async ({ db, user, params }) => {
  await deleteEvent(db, user.id, intParam(params.id));
  return { ok: true };
});
