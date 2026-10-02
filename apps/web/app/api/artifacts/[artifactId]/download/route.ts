import { and, eq, isNull } from "drizzle-orm";
import { artifacts, cases, runs } from "@oa/domain/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/errors";
import { getObjectBytes } from "@/lib/storage";

const DOWNLOADABLE_TYPES = new Set(["STATEMENT_DOCX", "RENDERED_PDF"]);
const EXTENSIONS: Record<string, string> = { STATEMENT_DOCX: "docx", RENDERED_PDF: "pdf" };

/**
 * Streams a produced document to its owner through this origin.
 *
 * A presigned OSS URL would put the browser on a different origin for the
 * download, which fails outright on networks that cannot reach the bucket (and
 * needs the bucket's CORS to allow it). The server already has working access to
 * OSS, so the transfer happens here and the client only ever talks to us.
 */
export async function GET(_: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  try {
    const user = await requireUser();
    const { artifactId } = await params;
    const rows = await db.select({ artifact: artifacts, patentCase: cases })
      .from(artifacts)
      .innerJoin(runs, eq(runs.id, artifacts.runId))
      .innerJoin(cases, eq(cases.id, runs.caseId))
      .where(and(eq(artifacts.id, artifactId), eq(artifacts.isUserDownloadable, true), eq(cases.ownerUserId, user.id), isNull(cases.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row || !DOWNLOADABLE_TYPES.has(row.artifact.type)) throw new AppError("FORBIDDEN", "该文件不可下载。", 403);

    const bytes = await getObjectBytes(row.artifact.storageKey);
    const extension = EXTENSIONS[row.artifact.type] ?? "bin";
    const filename = `${row.patentCase.applicationNo ?? "OA"}_意见陈述书_工作稿.${extension}`;
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "content-type": row.artifact.mimeType,
        "content-length": String(bytes.byteLength),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "private, no-store"
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
