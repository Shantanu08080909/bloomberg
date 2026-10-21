/**
 * Apply database migrations and load demo data if it is missing.
 *   npm run db:setup
 * Uses DATABASE_URL when set, otherwise embedded PostgreSQL (PGlite) in ./data/pglite.
 * Stop the dev server first when using PGlite: only one process may open its data directory.
 */
import { loadEnv } from "./load-env";
loadEnv();

async function main() {
  const { createDb } = await import("../src/lib/db/client");
  const { setupDatabase } = await import("../src/lib/db/seed");
  const started = Date.now();
  const handle = await createDb();
  console.log(`Database mode: ${handle.mode}`);
  try {
    const res = await setupDatabase(handle, (m) => console.log(`  ${m}`));
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s (seeded: ${res.seeded}).`);
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error("Database setup failed:", err instanceof Error ? err.message : err);
  console.error("See README → Troubleshooting.");
  process.exit(1);
});
