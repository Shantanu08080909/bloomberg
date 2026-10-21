/**
 * Next.js calls register() once when the server process starts. The in-process
 * scheduler (alert checks and provider refreshes) runs only on the Node.js
 * runtime of a running server — never during `next build`.
 *
 * The `if (process.env.NEXT_RUNTIME === "nodejs")` block form lets the bundler
 * drop the Node-only import from the edge build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE !== "phase-production-build" && process.env.SCHEDULER_ENABLED !== "false") {
      const { startScheduler } = await import("@/lib/server/scheduler");
      await startScheduler();
    }
  }
}
