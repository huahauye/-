import { and, eq, isNull } from "drizzle-orm";
import { artifacts, cases, runs } from "@oa/domain/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/errors";
import { presignDownload } from "@/lib/storage";

export async function POST(_: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  try {
    const user = await requireUser(); const { artifactId } = await params;
    const rows = await db.select({ artifact: artifacts, patentCase: cases }).from(artifacts).innerJoin(runs, eq(runs.id, artifacts.runId)).innerJoin(cases, eq(cases.id, runs.caseId))
      .where(and(eq(artifacts.id, artifactId), eq(artifacts.type, "STATEMENT_DOCX"), eq(artifacts.isUserDownloadable, true), eq(cases.ownerUserId, user.id), isNull(cases.deletedAt))).limit(1);
    if (!rows[0]) throw new AppError("FORBIDDEN", "该文件不可下载。", 403);
    const filename = `${rows[0].patentCase.applicationNo ?? "OA"}_意见陈述书_工作稿.docx`;
    return Response.json({ url: await presignDownload(rows[0].artifact.storageKey, filename), expiresIn: 300 });
  } catch (error) { return errorResponse(error); }
}
