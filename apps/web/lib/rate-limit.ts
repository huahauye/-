import { AppError } from "./errors";

const buckets = new Map<string, number[]>();
export function rateLimit(key: string, maximum: number, windowMs: number): void {
  const now = Date.now();
  const active = (buckets.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (active.length >= maximum) throw new AppError("FORBIDDEN", "操作过于频繁，请稍后重试。", 429);
  active.push(now);
  buckets.set(key, active);
}
