/**
 * Check that the database is reachable and migrated.
 *   npm run db:health
 */
import { loadEnv } from "./load-env";
loadEnv();

async function main() {
  const { createDb } = await import("../src/lib/db/client");
  const { checkDatabaseHealth } = await import("../src/lib/db/health");
  const handle = await createDb();
  try {
    const h = await checkDatabaseHealth(handle.db, handle.mode);
    console.log(JSON.stringify(h, null, 2));
    if (!h.ok) process.exit(1);
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error("Database is not reachable:", err instanceof Error ? err.message : err);
  process.exit(1);
});
