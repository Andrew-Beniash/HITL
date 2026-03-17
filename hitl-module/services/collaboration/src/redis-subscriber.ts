import type { Server } from "socket.io";
import type { Redis } from "ioredis";
import { SOCKET_EVENTS } from "@hitl/shared-types";

// ── Message handler (exported for unit-testing without a live Redis) ──────────

export function handleRedisMessage(
  io: Server,
  channel: string,
  message: string
): void {
  let data: unknown;
  try {
    data = JSON.parse(message);
  } catch {
    return;
  }

  if (channel.startsWith("hitl:annotation:")) {
    const documentId = channel.slice("hitl:annotation:".length);
    // All clients viewing this document join `doc:{documentId}` room
    io.to(`doc:${documentId}`).emit(SOCKET_EVENTS.ANNOTATION_SYNC, data);
  } else if (channel.startsWith("hitl:epub:")) {
    const documentId = channel.slice("hitl:epub:".length);
    io.to(`doc:${documentId}`).emit(SOCKET_EVENTS.EPUB_UPDATED, data);
  }
}

// ── Start subscriber (production) ─────────────────────────────────────────────

export function startRedisSubscriber(io: Server, subscriber: Redis): void {
  subscriber.psubscribe("hitl:annotation:*", "hitl:epub:*").catch((err) => {
    console.error("[redis-subscriber] psubscribe failed:", err);
  });

  subscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
    handleRedisMessage(io, channel, message);
  });

  subscriber.on("error", (err) => {
    console.error("[redis-subscriber] Redis error:", err);
  });
}
