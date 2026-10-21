import { parseJson, route } from "@/lib/server/api";
import { AlertInputSchema, createAlert, listAlerts } from "@/lib/services/user-data";

export const GET = route(async ({ db, user }) => ({ alerts: await listAlerts(db, user.id) }));

export const POST = route(async ({ req, db, user }) => {
  const body = await parseJson(req, AlertInputSchema);
  return { alert: await createAlert(db, user.id, body) };
});
