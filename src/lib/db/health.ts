import { sql } from "drizzle-orm";
import type { Database, DbMode } from "./client";

export interface DbHealth {
  ok: boolean;
  mode: DbMode;
  latencyMs: number | null;
  migrated: boolean;
  instruments: number;
  priceBars: number;
  message: string;
}

export async function checkDatabaseHealth(db: Database, mode: DbMode): Promise<DbHealth> {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    const latencyMs = Date.now() - started;
    const reg = (await db.execute(sql`select to_regclass('public.instruments')::text as t`)) as unknown as { rows: { t: string | null }[] };
    const migrated = Boolean((reg.rows[0] as { t: string | null } | undefined)?.t);
    if (!migrated) {
      return { ok: false, mode, latencyMs, migrated, instruments: 0, priceBars: 0, message: "Database reachable but not migrated. Run: npm run db:setup" };
    }
    const counts = (await db.execute(
      sql`select (select count(*)::int from instruments) as i, (select count(*)::int from price_bars) as b`,
    )) as unknown as { rows: { i: number; b: number }[] };
    const c = counts.rows[0] as { i: number; b: number };
    return {
      ok: true,
      mode,
      latencyMs,
      migrated,
      instruments: Number(c.i),
      priceBars: Number(c.b),
      message: Number(c.i) === 0 ? "Migrated but empty. Run: npm run db:seed" : "OK",
    };
  } catch (err) {
    return {
      ok: false,
      mode,
      latencyMs: null,
      migrated: false,
      instruments: 0,
      priceBars: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
