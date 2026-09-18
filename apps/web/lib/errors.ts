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

export function errorResponse(error: unknown, id = requestId()): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, requestId: id } }, { status: error.status });
  }
  return NextResponse.json({ error: { code: "WORKER_UNAVAILABLE", message: "请求未完成，请稍后重试。", requestId: id } }, { status: 500 });
}

export async function readJson<T>(request: Request, schema: { parse: (value: unknown) => T }): Promise<T> {
  try { return schema.parse(await request.json()); }
  catch { throw new AppError("MODEL_SCHEMA_INVALID", "请求内容格式不正确。", 422); }
}
