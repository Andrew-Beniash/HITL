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

let notificationQueue: Queue | null = null;

export function getNotificationQueue(): Queue {
  if (!notificationQueue) {
    notificationQueue = new Queue("notifications", {
      connection: sharedConnection,
    });
  }
  return notificationQueue;
}

export interface MentionNotificationJob {
  type: "mention";
  mentionerUserId: string;
  mentionedUsername: string;
  documentId: string;
  annotationId: string;
}
