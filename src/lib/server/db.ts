import "server-only";
import type { Database } from "@/lib/db/client";
import { getDbHandle } from "@/lib/db/client";
import { setupDatabase } from "@/lib/db/seed";
import { hasEodData } from "@/lib/eod/importer";

const g = globalThis as unknown as { __ofReady?: Promise<Database>; __ofHasEod?: boolean };

/** Whether imported end-of-day data exists (cached; refreshed after imports). */
export function hasEodCached(): boolean {
  return g.__ofHasEod === true;
}

export async function refreshEodFlag(database: Database) {
  g.__ofHasEod = await hasEodData(database);
  return g.__ofHasEod;
}

/**
 * Database handle that is guaranteed to be migrated and, on a fresh install,
 * loaded with demo data. Runs at most once per server process.
 */
export function db(): Promise<Database> {
  if (!g.__ofReady) {
    g.__ofReady = (async () => {
      const handle = await getDbHandle();
      await setupDatabase(handle, (m) => console.log(`[db] ${m}`));
      await refreshEodFlag(handle.db);
      return handle.db;
    })().catch((err) => {
      g.__ofReady = undefined;
      throw new DatabaseUnavailableError(err);
    });
  }
  return g.__ofReady;
}

export class DatabaseUnavailableError extends Error {
  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Database unavailable: ${detail}`);
    this.name = "DatabaseUnavailableError";
  }
}
