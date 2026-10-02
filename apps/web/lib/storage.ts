import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import { storageConfig } from "./config";

let client: S3Client | undefined;
function s3(): S3Client {
  if (!client) {
    const config = storageConfig();
    client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      forcePathStyle: config.S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
      // Aliyun OSS rejects the aws-chunked transfer encoding that flexible
      // checksums introduce, so only compute a checksum when it is mandatory.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED"
    });
  }
  return client;
}

export function safeFilename(filename: string): string {
  return filename.normalize("NFKC").replace(/[\\/:*?"<>|\x00-\x1F]/g, "_").replace(/^\.+/, "").slice(0, 180) || "document";
}

export function documentStorageKey(caseId: string, documentId: string, versionId: string, filename: string): string {
  return `cases/${caseId}/documents/${documentId}/versions/${versionId}/raw/${safeFilename(filename)}`;
}

/**
 * Streams a browser upload into object storage from the server.
 *
 * Uploads are proxied rather than sent straight from the browser with a
 * presigned PUT: that keeps the flow same-origin, so the bucket needs no CORS
 * rule for the deployment host. (It would also not be possible here — the
 * credentials in use may read and write objects but do not own the bucket, and
 * OSS only lets the owner manage CORS.)
 *
 * `ContentLength` is passed explicitly because the SDK otherwise switches to
 * aws-chunked transfer encoding when a stream's length is unknown, and OSS
 * rejects aws-chunked.
 */
export async function putObjectFromWebStream(key: string, body: ReadableStream<Uint8Array>, contentType: string, sha256: string, contentLength: number) {
  const config = storageConfig();
  return s3().send(new PutObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
    Body: Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
    ContentType: contentType,
    ContentLength: contentLength,
    // uploads/complete verifies the stored object against this value.
    Metadata: { sha256 }
  }));
}

export async function presignDownload(key: string, filename?: string): Promise<string> {
  const config = storageConfig();
  return getSignedUrl(s3(), new GetObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
    ...(filename ? { ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` } : {})
  }), { expiresIn: 300 });
}

export async function headObject(key: string) {
  const config = storageConfig();
  return s3().send(new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
}

export async function putObject(key: string, body: Uint8Array | string, contentType: string) {
  const config = storageConfig();
  return s3().send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const config = storageConfig();
  const result = await s3().send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
  if (!result.Body) throw new Error("Object body is empty");
  return result.Body.transformToByteArray();
}

export async function getObjectText(key: string): Promise<string> {
  return new TextDecoder().decode(await getObjectBytes(key));
}
