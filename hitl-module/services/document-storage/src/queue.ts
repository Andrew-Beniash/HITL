import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import type { SourceFormat } from "@hitl/shared-types";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Parse Redis URL into BullMQ ConnectionOptions (avoids ioredis version conflicts)
function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname || "localhost",
    port: u.port ? parseInt(u.port, 10) : 6379,
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.username ? { username: u.username } : {}),
    maxRetriesPerRequest: null, // required by BullMQ
  };
}

const sharedConnection: ConnectionOptions = parseRedisUrl(REDIS_URL);

// ── Queue instances (created lazily once) ────────────────────────────────────

let conversionQueue: Queue | null = null;
let xlsxEditQueue: Queue | null = null;

export function getConversionQueue(): Queue {
  if (!conversionQueue) {
    conversionQueue = new Queue("epub-conversion", {
      connection: sharedConnection,
    });
  }
  return conversionQueue;
}

export function getXlsxEditQueue(): Queue {
  if (!xlsxEditQueue) {
    xlsxEditQueue = new Queue("xlsx-edit", {
      connection: sharedConnection,
    });
  }
  return xlsxEditQueue;
}

// ── Job payloads ─────────────────────────────────────────────────────────────

export interface ConversionJobPayload {
  documentId: string;
  versionId: string;
  s3SourceKey: string;
  sourceFormat: SourceFormat;
  tenantId: string;
}

export interface XlsxEditJobPayload {
  documentId: string;
  tenantId: string;
  s3SourceKey: string;
  sheetName: string;
  row: number;
  col: number;
  value: string | number;
  newVersionId: string;
}

// ── Producers ────────────────────────────────────────────────────────────────

export async function enqueueConversionJob(
  payload: ConversionJobPayload
): Promise<string> {
  const job = await getConversionQueue().add("convert", payload);
  return job.id ?? "unknown";
}

export async function enqueueXlsxEditJob(
  payload: XlsxEditJobPayload
): Promise<string> {
  const job = await getXlsxEditQueue().add("edit-cell", payload);
  return job.id ?? "unknown";
}
