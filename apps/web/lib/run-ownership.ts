import { and, eq, isNull } from "drizzle-orm";
import { cases, runs } from "@oa/domain/db";
import { db } from "./db";
import { AppError } from "./errors";

export async function requireOwnedRun(runId: string, userId: string) {
  const rows = await db.select({ run: runs }).from(runs).innerJoin(cases, eq(cases.id, runs.caseId)).where(and(eq(runs.id, runId), eq(cases.ownerUserId, userId), isNull(cases.deletedAt))).limit(1);
  if (!rows[0]) throw new AppError("CASE_NOT_FOUND", "未找到运行记录。", 404);
  return rows[0].run;
}
