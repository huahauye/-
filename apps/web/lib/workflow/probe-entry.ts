/**
 * Entry point for a temporary *synchronous* Netlify function that reports how
 * the serverless environment behaves around the background dispatch function.
 *
 * Unlike the background function, a synchronous function returns its response
 * body to the caller, which makes this the only reliable way to observe module
 * loading, environment injection and database reachability from inside the
 * function runtime.
 *
 * It is guarded by a token so it is not a public endpoint in practice, and it
 * is removed once the dispatch path is trusted.
 */
import { probeDispatchEnvironment, PROBE_TOKEN } from "./dispatch-probe";

export default async function handler(request: Request): Promise<Response> {
  const headers = (request as unknown as { headers?: { get?: (name: string) => string | null } }).headers;
  const token = typeof headers?.get === "function" ? headers.get("x-probe-token") : null;
  if (token !== PROBE_TOKEN) return new Response("not found", { status: 404 });

  const report = await probeDispatchEnvironment();
  return new Response(JSON.stringify(report, null, 2), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
