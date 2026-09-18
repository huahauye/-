import type { ErrorCode } from "@oa/domain";
import { NextResponse } from "next/server";

export class AppError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly status = 400) {
    super(message);
  }
}

export function requestId(): string {
  return crypto.randomUUID();
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Service-side CSRF guard. Replaces the previous Next.js middleware so that the
 * check runs inside the route handler on every runtime (Node middleware is not
 * deployable from every local toolchain).
 */
export function assertSameOrigin(request: Request): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  if (!origin) throw new AppError("FORBIDDEN", "请求缺少 Origin。", 403);
  const allowed = new Set<string>();
  try { allowed.add(new URL(request.url).origin); } catch { /* ignore malformed request url */ }
  const configured = process.env.APP_BASE_URL;
  if (configured) { try { allowed.add(new URL(configured).origin); } catch { /* ignore malformed configuration */ } }
  let normalized: string;
  try { normalized = new URL(origin).origin; } catch { throw new AppError("FORBIDDEN", "Origin 无效。", 403); }
  if (!allowed.has(normalized)) throw new AppError("FORBIDDEN", "跨站请求已被拒绝。", 403);
}

export function errorResponse(error: unknown, id = requestId()): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, requestId: id } }, { status: error.status });
  }
  return NextResponse.json({ error: { code: "WORKER_UNAVAILABLE", message: "请求未完成，请稍后重试。", requestId: id } }, { status: 500 });
}

export async function readJson<T>(request: Request, schema: { parse: (value: unknown) => T }): Promise<T> {
  assertSameOrigin(request);
  try { return schema.parse(await request.json()); }
  catch { throw new AppError("MODEL_SCHEMA_INVALID", "请求内容格式不正确。", 422); }
}
