/**
 * Temporary diagnostic for the background dispatch path.
 *
 * The background function accepts the request (202) but never reaches the
 * database, and function logs are not retrievable from this environment. This
 * probe gathers the same facts over HTTP instead: every dependency is imported
 * lazily and every step is caught, so a module that fails to load is reported
 * as data rather than killing the probe.
 *
 * Delete `probe-entry.ts`, `dispatch-probe.ts` and the probe entry in
 * `scripts/bundle-background-function.mjs` once dispatch is trusted.
 */

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

const ENV_KEY_PATTERN = /DB|DATABASE|S3_|ALIYUN|DEEPSEEK|IMM|OCR|AWS/i;

export async function probeDispatchEnvironment(): Promise<Record<string, unknown>> {
  const report: Record<string, unknown> = {
    node: process.version,
    platform: process.platform,
    moduleLoad: "ok",
    env: {
      NETLIFY_DB_URL: Boolean(process.env.NETLIFY_DB_URL),
      DATABASE_URL: Boolean(process.env.DATABASE_URL),
      DEEPSEEK_API_KEY: Boolean(process.env.DEEPSEEK_API_KEY),
      URL: process.env.URL ?? null,
      NODE_ENV: process.env.NODE_ENV ?? null
    },
    // Names only: enough to tell which integrations reach a user function.
    envKeys: Object.keys(process.env).filter((key) => ENV_KEY_PATTERN.test(key)).sort()
  };

  try {
    const { db } = await import("../db");
    const { runs } = await import("@oa/domain/db");
    const rows = await db.select({ id: runs.id }).from(runs).limit(1);
    report.dbProbe = `ok (${rows.length} run row visible)`;
  } catch (error) {
    report.dbProbe = `error: ${describe(error)}`;
  }

  // Run the real background entry point in-process against a run id that
  // cannot exist, so it stops at its guard instead of starting a workflow.
  try {
    const entry = await import("./background-entry");
    const response = await entry.default(
      new Request("https://probe.invalid/run-workflow-background", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: "00000000-0000-0000-0000-000000000000" })
      })
    );
    report.entryLoad = "ok";
    report.entryStatus = response.status;
    report.entryBody = await response.text();
  } catch (error) {
    report.entryLoad = `error: ${describe(error)}`;
  }

  return report;
}

export const PROBE_TOKEN = "d7f3a1c9b24e5f60a8c1d3e7f9b2a4c6";
