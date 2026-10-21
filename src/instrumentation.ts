/**
 * Next.js calls register() once when the server process starts. The in-process
 * scheduler (alert checks and provider refreshes) runs only on the Node.js
 * runtime of a running server — never during `next build`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.SCHEDULER_ENABLED === "false") return;
  const { startScheduler } = await import("@/lib/server/scheduler");
  await startScheduler();
}
