import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, createSession, SESSION_COOKIE } from "@/lib/auth/core";
import { sessionCookieOptions } from "@/lib/auth/server";
import { getConfig } from "@/lib/config";
import { KeyedRateLimiter } from "@/lib/rate-limit";
import { ApiError, parseJson, route } from "@/lib/server/api";

const g = globalThis as unknown as { __ofLoginLimiter?: KeyedRateLimiter };
// 8 attempts, then one more every 15 seconds per IP+username.
const loginLimiter = (g.__ofLoginLimiter ??= new KeyedRateLimiter(8, 1 / 15));

const Body = z.object({ username: z.string().min(1).max(40), password: z.string().min(1).max(200) });

export const POST = route(
  async ({ req, db }) => {
    const { username, password } = await parseJson(req, Body);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const rl = loginLimiter.check(`${ip}:${username.toLowerCase()}`);
    if (!rl.allowed) throw new ApiError(429, `Too many sign-in attempts. Try again in ${Math.ceil(rl.retryAfterMs / 1000)}s.`, "rate_limited");
    const user = await authenticate(db, username, password);
    if (!user) throw new ApiError(401, "Incorrect username or password", "invalid_credentials");
    const { token, expiresAt } = await createSession(db, user.id, getConfig().SESSION_TTL_DAYS);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt, req.nextUrl.protocol === "https:"));
    return res;
  },
  { auth: false },
);
