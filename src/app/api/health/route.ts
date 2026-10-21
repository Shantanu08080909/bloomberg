import { NextResponse } from "next/server";
import { getDbHandle } from "@/lib/db/client";
import { checkDatabaseHealth } from "@/lib/db/health";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** Unauthenticated liveness check. Reveals no user data. */
export async function GET() {
  try {
    await db();
    const handle = await getDbHandle();
    const h = await checkDatabaseHealth(handle.db, handle.mode);
    return NextResponse.json({ ok: h.ok, database: { ok: h.ok, mode: h.mode, latencyMs: h.latencyMs, migrated: h.migrated, message: h.message } }, { status: h.ok ? 200 : 503 });
  } catch (err) {
    return NextResponse.json({ ok: false, database: { ok: false, message: err instanceof Error ? err.message : String(err) } }, { status: 503 });
  }
}
