import { NextResponse } from "next/server";
import { deleteSession, SESSION_COOKIE } from "@/lib/auth/core";
import { route } from "@/lib/server/api";

export const POST = route(
  async ({ req, db }) => {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token) await deleteSession(db, token);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", expires: new Date(0) });
    return res;
  },
  { auth: false },
);
