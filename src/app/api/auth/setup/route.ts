import { NextResponse } from "next/server";
import { z } from "zod";
import { countUsers, createSession, createUser, SESSION_COOKIE } from "@/lib/auth/core";
import { sessionCookieOptions } from "@/lib/auth/server";
import { getConfig } from "@/lib/config";
import { ApiError, parseJson, route } from "@/lib/server/api";

const Body = z.object({
  username: z.string(),
  password: z.string(),
  displayName: z.string().max(60).optional(),
});

/**
 * Creates the first account (no default credentials exist). Afterwards this
 * endpoint only works when ALLOW_REGISTRATION=true.
 */
export const POST = route(
  async ({ req, db }) => {
    const body = await parseJson(req, Body);
    const existing = await countUsers(db);
    if (existing > 0 && getConfig().ALLOW_REGISTRATION !== "true") {
      throw new ApiError(403, "Registration is closed. Ask the owner of this installation to enable ALLOW_REGISTRATION.", "registration_closed");
    }
    const user = await createUser(db, body);
    const { token, expiresAt } = await createSession(db, user.id, getConfig().SESSION_TTL_DAYS);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt, req.nextUrl.protocol === "https:"));
    return res;
  },
  { auth: false, heavy: true },
);
