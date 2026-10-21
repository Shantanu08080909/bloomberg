import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DbMode = "postgres" | "pglite" | "pglite-memory";

interface DbHandle {
  db: Database;
  mode: DbMode;
  close: () => Promise<void>;
  migrate: () => Promise<void>;
}

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export function resolveDbMode(env: NodeJS.ProcessEnv = process.env): DbMode {
  if (env.DATABASE_URL && env.DATABASE_URL.trim() !== "") return "postgres";
  if (env.PGLITE_DIR === ":memory:") return "pglite-memory";
  return "pglite";
}

export async function createDb(env: NodeJS.ProcessEnv = process.env): Promise<DbHandle> {
  const mode = resolveDbMode(env);
  if (mode === "postgres") {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: Number(env.DATABASE_POOL_MAX ?? 10),
      connectionTimeoutMillis: 5000,
    });
    const db = drizzle(pool, { schema }) as unknown as Database;
    return {
      db,
      mode,
      close: () => pool.end(),
      migrate: () =>
        migrate(db as unknown as Parameters<typeof migrate>[0], {
          migrationsFolder: MIGRATIONS_FOLDER,
        }),
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir =
    mode === "pglite-memory" ? undefined : path.resolve(env.PGLITE_DIR ?? "./data/pglite");
  if (dataDir) {
    const fs = await import("node:fs");
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  }
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as Database;
  return {
    db,
    mode,
    close: () => client.close(),
    migrate: () =>
      migrate(db as unknown as Parameters<typeof migrate>[0], {
        migrationsFolder: MIGRATIONS_FOLDER,
      }),
  };
}

/* A single handle per server process (survives Next.js dev hot reloads). */
const globalForDb = globalThis as unknown as {
  __ofDb?: Promise<DbHandle>;
};

export function getDbHandle(): Promise<DbHandle> {
  if (!globalForDb.__ofDb) {
    globalForDb.__ofDb = createDb().catch((err) => {
      globalForDb.__ofDb = undefined;
      throw err;
    });
  }
  return globalForDb.__ofDb;
}

export async function getDb(): Promise<Database> {
  return (await getDbHandle()).db;
}

/** Test helper: override the process-wide database. */
export function setDbHandleForTests(handle: DbHandle | undefined) {
  globalForDb.__ofDb = handle ? Promise.resolve(handle) : undefined;
}

export { schema };
