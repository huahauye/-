import { documents, documentVersions } from "@oa/domain/db";
import { uploadInitSchema } from "@oa/schemas";
import { requireUser } from "@/lib/auth";
import { serverConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { AppError, errorResponse, readJson } from "@/lib/errors";
import { requireOwnedCase } from "@/lib/ownership";
import { rateLimit } from "@/lib/rate-limit";
import { documentStorageKey } from "@/lib/storage";

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const user = await requireUser(); const { caseId } = await params; await requireOwnedCase(caseId, user.id); rateLimit(`upload:${user.id}`, 30, 60_000);
    const input = await readJson(request, uploadInitSchema);
    if (input.size > serverConfig().MAX_UPLOAD_MB * 1024 * 1024) throw new AppError("FILE_TOO_LARGE", `单个文件不能超过 ${serverConfig().MAX_UPLOAD_MB}MB。`, 413);
    const documentId = crypto.randomUUID(); const versionId = crypto.randomUUID();
    const key = documentStorageKey(caseId, documentId, versionId, input.filename);
    await db.transaction(async (tx) => {
      await tx.insert(documents).values({ id: documentId, caseId, role: "UNKNOWN", displayName: input.filename });
      await tx.insert(documentVersions).values({ id: versionId, documentId, versionNo: 1, originalFilename: input.filename, mimeType: input.mimeType, sizeBytes: input.size, sha256: input.sha256.toLowerCase(), storageKey: key, uploadStatus: "UPLOADING", parseStatus: "PENDING" });
    });
    // The upload target is a same-origin route that streams the file to object
    // storage, so the bucket needs no CORS rule for this host.
    const uploadUrl = `/api/cases/${caseId}/uploads/${versionId}/content`;
    return Response.json({ documentId, documentVersionId: versionId, uploadUrl, expiresIn: 3600, requiredHeaders: { "content-type": input.mimeType } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
