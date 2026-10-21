import { parseJson, route } from "@/lib/server/api";
import { getProfile, ProfileUpdateSchema, updateProfile } from "@/lib/services/user-data";

export const GET = route(async ({ db, user }) => ({ profile: await getProfile(db, user.id) }));

export const PATCH = route(async ({ req, db, user }) => ({ profile: await updateProfile(db, user.id, await parseJson(req, ProfileUpdateSchema)) }));
