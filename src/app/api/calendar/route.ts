import { parseJson, route } from "@/lib/server/api";
import { createEvent, EventInputSchema, listEvents } from "@/lib/services/user-data";

export const GET = route(async ({ db, user }) => ({ events: await listEvents(db, user.id) }));

export const POST = route(async ({ req, db, user }) => ({ event: await createEvent(db, user.id, await parseJson(req, EventInputSchema)) }));
