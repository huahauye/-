import { and, eq, isNull } from "drizzle-orm";
import { cases } from "@oa/domain/db";
import { db } from "./db";
import { AppError } from "./errors";

export async function requireOwnedCase(caseId: string, ownerUserId: string) {
  const rows = await db.select().from(cases).where(and(eq(cases.id, caseId), eq(cases.ownerUserId, ownerUserId), isNull(cases.deletedAt))).limit(1);
  const patentCase = rows[0];
  if (!patentCase) throw new AppError("CASE_NOT_FOUND", "未找到案件。", 404);
  return patentCase;
}
