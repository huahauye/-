/**
 * Server start-up hook.
 *
 * A self-hosted process can be restarted while a run is in flight (deploy,
 * reboot, crash). Nothing would ever move those runs to a terminal state, so
 * they are closed out once at start-up; the user can then start the run again.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next build` also loads instrumentation; there is no database work to do then.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { recoverInterruptedRuns } = await import("./lib/run-service");
    const recovered = await recoverInterruptedRuns();
    if (recovered > 0) console.warn(`recovered ${recovered} interrupted run(s) at start-up`);
  } catch (error) {
    console.error("run recovery failed at start-up", error instanceof Error ? error.message : String(error));
  }
}
