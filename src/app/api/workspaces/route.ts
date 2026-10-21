import { z } from "zod";
import { parseJson, route } from "@/lib/server/api";
import { listWorkspaces, saveWorkspace } from "@/lib/services/user-data";

export const GET = route(async ({ db, user }) => ({ workspaces: await listWorkspaces(db, user.id) }));

export const POST = route(async ({ req, db, user }) => {
  const body = await parseJson(req, z.object({ name: z.string(), layout: z.unknown(), isDefault: z.boolean().optional() }));
  return { workspace: await saveWorkspace(db, user.id, body) };
});
