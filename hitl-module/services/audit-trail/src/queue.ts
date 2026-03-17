import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname || "localhost",
    port: u.port ? parseInt(u.port, 10) : 6379,
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    maxRetriesPerRequest: null,
  };
}

const sharedConnection: ConnectionOptions = parseRedisUrl(REDIS_URL);

let exportQueue: Queue | null = null;

export function getExportQueue(): Queue {
  if (!exportQueue) {
    exportQueue = new Queue("audit-export", { connection: sharedConnection });
  }
  return exportQueue;
}

export interface ExportJob {
  jobId: string;
  tenantId: string;
  documentId?: string;
  from: string;
  to: string;
  format: "csv" | "json";
}
