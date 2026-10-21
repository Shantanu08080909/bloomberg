import { NextResponse } from "next/server";
import { z } from "zod";
import { changePassword, SESSION_COOKIE } from "@/lib/auth/core";
import { ApiError, parseJson, route } from "@/lib/server/api";

export const POST = route(
  async ({ req, db, user }) => {
    const { current, next } = await parseJson(req, z.object({ current: z.string().min(1).max(200), next: z.string().max(200) }));
    const ok = await changePassword(db, user.id, current, next);
    if (!ok) throw new ApiError(400, "Current password is incorrect", "bad_password");
    // All sessions were revoked; clear this browser's cookie too.
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", expires: new Date(0) });
    return res;
  },
  { heavy: true },
);
