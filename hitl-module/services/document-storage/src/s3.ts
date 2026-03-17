import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";

const BUCKET = process.env.S3_BUCKET ?? "hitl-documents";
const SIGNED_URL_TTL_SECONDS = 900; // 15 minutes

export function createS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,          // MinIO in dev; omit for AWS
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "minioadmin",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "minioadmin",
    },
    forcePathStyle: !!process.env.S3_ENDPOINT,  // required for MinIO
  });
}

// ── Key builders (§5.2 layout) ────────────────────────────────────────────────

export function sourceKey(
  tenantId: string,
  documentId: string,
  versionNumber: number,
  filename: string
): string {
  return `${tenantId}/${documentId}/source/v${versionNumber}/${filename}`;
}

export function epubKey(
  tenantId: string,
  documentId: string,
  versionNumber: number
): string {
  return `${tenantId}/${documentId}/epub/v${versionNumber}/document.epub`;
}

export function manifestKey(
  tenantId: string,
  documentId: string,
  versionNumber: number
): string {
  return `${tenantId}/${documentId}/manifest/v${versionNumber}.json`;
}

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadDocument(
  tenantId: string,
  documentId: string,
  versionNumber: number,
  filename: string,
  buffer: Buffer,
  contentType?: string
): Promise<string> {
  const client = createS3Client();
  const key = sourceKey(tenantId, documentId, versionNumber, filename);

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType ?? "application/octet-stream",
    })
  );

  return key;
}

// ── Download ──────────────────────────────────────────────────────────────────

export async function downloadToBuffer(s3Key: string): Promise<Buffer> {
  const client = createS3Client();
  const response = await client.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: s3Key })
  );

  if (!response.Body) {
    throw new Error(`Empty body for S3 key: ${s3Key}`);
  }

  const stream = response.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

// ── Signed URL (GET) ──────────────────────────────────────────────────────────

export async function getSignedEpubUrl(
  s3Key: string
): Promise<{ url: string; expiresAt: string }> {
  const client = createS3Client();
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  const url = await getSignedUrl(client, command, {
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });

  const expiresAt = new Date(
    Date.now() + SIGNED_URL_TTL_SECONDS * 1000
  ).toISOString();

  return { url, expiresAt };
}
