import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/server/db";
import { SESSION_COOKIE, getSessionUser, type SessionUser } from "./core";

/** Current user for server components (memoised per request). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(await db(), token);
});

/** For pages: redirect to login when there is no valid session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function sessionCookieOptions(expires: Date, requestIsHttps: boolean) {
  const mode = getConfig().COOKIE_SECURE;
  const secure = mode === "true" || (mode === "auto" && requestIsHttps);
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    expires,
  };
}
