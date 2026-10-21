import { z } from "zod";
import { intParam, parseJson, route } from "@/lib/server/api";
import { deleteAlert, updateAlert } from "@/lib/services/user-data";

export const PATCH = route<{ id: string }>(async ({ req, db, user, params }) => {
  const body = await parseJson(req, z.object({ active: z.boolean().optional(), threshold: z.number().optional(), repeat: z.boolean().optional() }));
  return { alert: await updateAlert(db, user.id, intParam(params.id), body) };
});

export const DELETE = route<{ id: string }>(async ({ db, user, params }) => {
  await deleteAlert(db, user.id, intParam(params.id));
  return { ok: true };
});
