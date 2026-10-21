import { route } from "@/lib/server/api";
import { sendEmail } from "@/lib/server/email";
import { checkAlerts } from "@/lib/services/alerts-engine";

/** Run an alert check now for the signed-in user only. */
export const POST = route(async ({ db, user }) => ({ result: await checkAlerts(db, { userId: user.id, sendEmail }) }), { heavy: true });
