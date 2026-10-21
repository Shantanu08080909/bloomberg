import { z } from "zod";
import { parseJson, route } from "@/lib/server/api";
import { listNotifications, markNotificationsRead } from "@/lib/services/user-data";

export const GET = route(async ({ db, user }) => ({ notifications: await listNotifications(db, user.id, 100) }));

export const PATCH = route(async ({ req, db, user }) => {
  const { ids } = await parseJson(req, z.object({ ids: z.array(z.number().int().positive()).max(500).optional() }));
  await markNotificationsRead(db, user.id, ids);
  return { ok: true };
});
