import { Worker } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { writeToBuffer } from "fast-csv";
import { prisma } from "../db.js";
import { redis } from "../redis.js";
import type { ExportJob } from "../queue.js";

const BATCH_SIZE = 1000;
const BUCKET = process.env.AUDIT_S3_BUCKET ?? "hitl-audit-exports";
const SIGNED_URL_TTL = 86400; // 24 h

export const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
});

// ── Core export logic (exported for unit-testing) ─────────────────────────────

export async function runExport(job: ExportJob): Promise<string> {
  const { jobId, tenantId, documentId, from, to, format } = job;

  // Build WHERE filters
  const where: Record<string, unknown> = { tenantId };
  if (documentId) where.documentId = documentId;
  where.occurredAt = {
    gte: new Date(from),
    lte: new Date(to),
  };

  // Pull events in batches via keyset cursor
  const allRows: Record<string, unknown>[] = [];
  let cursor: bigint | undefined;

  for (;;) {
    const batch = await prisma.auditEvent.findMany({
      where: {
        ...where,
        ...(cursor !== undefined ? { id: { gt: cursor } } : {}),
      } as Parameters<typeof prisma.auditEvent.findMany>[0]["where"],
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;

    for (const row of batch) {
      allRows.push({
        id: row.id.toString(),
        tenantId: row.tenantId,
        documentId: row.documentId ?? "",
        sessionId: row.sessionId ?? "",
        actorType: row.actorType,
        actorId: row.actorId,
        eventType: row.eventType,
        scope: row.scope ? JSON.stringify(row.scope) : "",
        beforeState: row.beforeState ? JSON.stringify(row.beforeState) : "",
        afterState: row.afterState ? JSON.stringify(row.afterState) : "",
        metadata: row.metadata ? JSON.stringify(row.metadata) : "",
        occurredAt: row.occurredAt.toISOString(),
      });
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < BATCH_SIZE) break;
  }

  // Serialize
  let body: Buffer;
  let contentType: string;

  if (format === "csv") {
    body = await writeToBuffer(allRows, { headers: true });
    contentType = "text/csv";
  } else {
    const ndjson = allRows.map((r) => JSON.stringify(r)).join("\n");
    body = Buffer.from(ndjson, "utf8");
    contentType = "application/x-ndjson";
  }

  // Upload to S3
  const key = `audit-exports/${tenantId}/${jobId}.${format}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  // Generate signed download URL
  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: SIGNED_URL_TTL }
  );

  // Write status to Redis (TTL matches signed URL expiry)
  await redis.setex(
    `audit:export:${jobId}`,
    SIGNED_URL_TTL,
    JSON.stringify({ status: "ready", downloadUrl })
  );

  return downloadUrl;
}

// ── BullMQ Worker ─────────────────────────────────────────────────────────────

export function startExportWorker(connection: ConnectionOptions): Worker {
  const worker = new Worker<ExportJob>(
    "audit-export",
    async (job) => {
      await runExport(job.data);
    },
    { connection }
  );

  worker.on("failed", (job, err) => {
    console.error(`[export-worker] job ${job?.id} failed:`, err);
  });

  return worker;
}
