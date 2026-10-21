/**
 * Re-load the deterministic demo dataset (idempotent).
 *   npm run db:seed
 */
import { loadEnv } from "./load-env";
loadEnv();

async function main() {
  const { createDb } = await import("../src/lib/db/client");
  const { seedDemo } = await import("../src/lib/db/seed");
  const handle = await createDb();
  try {
    await handle.migrate();
    await seedDemo(handle.db, (m) => console.log(`  ${m}`));
    console.log("Demo data loaded.");
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error("Seeding failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
