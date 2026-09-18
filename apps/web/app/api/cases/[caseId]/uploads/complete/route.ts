import { and, eq } from "drizzle-orm";
import { documents, documentVersions, workerJobs } from "@oa/domain/db";
import { uploadCompleteSchema } from "@oa/schemas";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, errorResponse, readJson } from "@/lib/errors";
import { requireOwnedCase } from "@/lib/ownership";
import { headObject } from "@/lib/storage";

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const user = await requireUser(); const { caseId } = await params; await requireOwnedCase(caseId, user.id);
    const input = await readJson(request, uploadCompleteSchema);
    const rows = await db.select({ version: documentVersions }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).where(and(eq(documentVersions.id, input.documentVersionId), eq(documents.caseId, caseId))).limit(1);
    const version = rows[0]?.version;
    if (!version) throw new AppError("CASE_NOT_FOUND", "未找到上传记录。", 404);
    if (version.uploadStatus === "UPLOADED") return Response.json({ status: "processing", documentVersionId: version.id });
    const object = await headObject(version.storageKey);
    if (object.ContentLength !== version.sizeBytes || object.Metadata?.sha256 !== version.sha256) throw new AppError("UPLOAD_VERIFY_FAILED", "文件大小或摘要校验失败。", 409);
    await db.transaction(async (tx) => {
      await tx.update(documentVersions).set({ uploadStatus: "UPLOADED", parseStatus: "PENDING" }).where(eq(documentVersions.id, version.id));
      await tx.insert(workerJobs).values({ documentVersionId: version.id, jobType: "PARSE_DOCUMENT", payload: { storageKey: version.storageKey, mimeType: version.mimeType, sha256: version.sha256 } }).onConflictDoNothing();
    });
    return Response.json({ status: "processing", documentVersionId: version.id }, { status: 202 });
  } catch (error) { return errorResponse(error); }
}
