import { z } from "zod";
import { parseJson, route } from "@/lib/server/api";
import { listScreeners, saveScreener } from "@/lib/services/user-data";

export const GET = route(async ({ db, user }) => ({ screeners: await listScreeners(db, user.id) }));

export const POST = route(async ({ req, db, user }) => {
  const body = await parseJson(req, z.object({ name: z.string(), config: z.unknown() }));
  return { screener: await saveScreener(db, user.id, body) };
});
