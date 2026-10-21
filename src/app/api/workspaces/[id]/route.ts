import { z } from "zod";
import { intParam, parseJson, route } from "@/lib/server/api";
import { deleteWorkspace, saveWorkspace } from "@/lib/services/user-data";

export const PATCH = route<{ id: string }>(async ({ req, db, user, params }) => {
  const body = await parseJson(req, z.object({ name: z.string(), layout: z.unknown(), isDefault: z.boolean().optional() }));
  return { workspace: await saveWorkspace(db, user.id, { ...body, id: intParam(params.id) }) };
});

export const DELETE = route<{ id: string }>(async ({ db, user, params }) => {
  await deleteWorkspace(db, user.id, intParam(params.id));
  return { ok: true };
});
