import { and, eq } from "drizzle-orm";
import { documents, documentVersions } from "@oa/domain/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, assertSameOrigin, errorResponse } from "@/lib/errors";
import { requireOwnedCase } from "@/lib/ownership";
import { putObjectFromWebStream } from "@/lib/storage";

/**
 * Receives the raw file body and streams it into object storage.
 *
 * This replaces the browser's direct presigned PUT to OSS so the whole upload
 * flow stays same-origin: the deployment host needs no bucket CORS rule, and an
 * upload cannot be replayed against a captured signed URL.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ caseId: string; documentVersionId: string }> }) {
  try {
    const user = await requireUser();
    const { caseId, documentVersionId } = await params;
    await requireOwnedCase(caseId, user.id);
    // A same-origin PUT normally carries Origin; if it does not, the SameSite=Lax
    // session cookie is what already prevents a cross-site upload.
    if (request.headers.get("origin")) assertSameOrigin(request);

    const rows = await db.select({ version: documentVersions })
      .from(documentVersions)
      .innerJoin(documents, eq(documents.id, documentVersions.documentId))
      .where(and(eq(documentVersions.id, documentVersionId), eq(documents.caseId, caseId)))
      .limit(1);
    const version = rows[0]?.version;
    if (!version) throw new AppError("CASE_NOT_FOUND", "未找到上传记录。", 404);
    if (version.uploadStatus === "UPLOADED") return Response.json({ ok: true, documentVersionId: version.id });
    if (!request.body) throw new AppError("UPLOAD_VERIFY_FAILED", "请求缺少文件内容。", 400);

    await putObjectFromWebStream(version.storageKey, request.body, version.mimeType, version.sha256, version.sizeBytes);
    return Response.json({ ok: true, documentVersionId: version.id });
  } catch (error) {
    return errorResponse(error);
  }
}
