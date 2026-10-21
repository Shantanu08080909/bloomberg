import { z } from "zod";
import { intParam, parseJson, route } from "@/lib/server/api";
import { addToWatchlist, removeFromWatchlist } from "@/lib/services/user-data";

const Body = z.object({ instrumentId: z.number().int().positive() });

export const POST = route<{ id: string }>(async ({ req, db, user, params }) => {
  const { instrumentId } = await parseJson(req, Body);
  await addToWatchlist(db, user.id, intParam(params.id), instrumentId);
  return { ok: true };
});

export const DELETE = route<{ id: string }>(async ({ req, db, user, params }) => {
  const { instrumentId } = await parseJson(req, Body);
  await removeFromWatchlist(db, user.id, intParam(params.id), instrumentId);
  return { ok: true };
});
