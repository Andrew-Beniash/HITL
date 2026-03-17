import type { Server, Socket } from "socket.io";
import type { IRedis } from "./redis.js";
import { SOCKET_EVENTS } from "@hitl/shared-types";
import type { PresenceUser } from "@hitl/shared-types";

const ANNOTATION_SESSION_HOST =
  process.env.ANNOTATION_SESSION_HOST ?? "annotation-session:3003";

// Module-level cursor throttle: keyed by userId, value = last broadcast ms
const lastCursorBroadcast = new Map<string, number>();

// ── Redis helpers ─────────────────────────────────────────────────────────────

export async function getAllPresence(
  documentId: string,
  redis: IRedis
): Promise<PresenceUser[]> {
  const raw = await redis.hgetall(`hitl:presence:${documentId}`);
  if (!raw) return [];
  return Object.values(raw).map((v) => JSON.parse(v) as PresenceUser);
}

export async function getCursorPositions(
  documentId: string,
  redis: IRedis
): Promise<Record<string, string>> {
  const raw = await redis.hgetall(`hitl:presence:${documentId}`);
  if (!raw) return {};
  const positions: Record<string, string> = {};
  for (const [userId, v] of Object.entries(raw)) {
    const user = JSON.parse(v) as PresenceUser;
    positions[userId] = user.currentCfi;
  }
  return positions;
}

// ── Session → Document lookup (cached in Redis for 60 s) ──────────────────────

export async function getDocumentId(
  sessionId: string,
  redis: IRedis
): Promise<string> {
  const cacheKey = `hitl:session-doc:${sessionId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const res = await fetch(
    `http://${ANNOTATION_SESSION_HOST}/sessions/${sessionId}`
  );
  if (!res.ok) throw new Error(`session lookup failed: ${res.status}`);
  const data = (await res.json()) as { session: { documentId: string } };
  const documentId = data.session.documentId;

  await redis.setex(cacheKey, 60, documentId);
  return documentId;
}

// ── Presence handler ──────────────────────────────────────────────────────────

export function presenceHandler(
  socket: Socket,
  io: Server,
  redis: IRedis
): void {
  // ── presence:join ────────────────────────────────────────────────────────

  socket.on(
    SOCKET_EVENTS.PRESENCE_JOIN,
    async ({
      sessionId,
      userId,
      displayName,
      avatarUrl,
    }: {
      sessionId: string;
      userId: string;
      displayName: string;
      avatarUrl: string;
    }) => {
      try {
        const documentId = await getDocumentId(sessionId, redis);
        const tenantId =
          (socket.data as { tenantId?: string }).tenantId ?? "default";
        const roomId = `${tenantId}:${documentId}`;

        // Store on socket for later use (cursor, disconnect)
        const data = socket.data as Record<string, string>;
        data.documentId = documentId;
        data.roomId = roomId;
        data.userId = userId;

        // Join tenant-scoped room (presence/cursor) + document room (Redis bridge)
        await socket.join(roomId);
        await socket.join(`doc:${documentId}`);

        // Store presence in Redis
        const user: PresenceUser = {
          userId,
          displayName,
          avatarUrl,
          currentCfi: "",
          lastSeenAt: new Date().toISOString(),
        };
        await redis.hset(
          `hitl:presence:${documentId}`,
          userId,
          JSON.stringify(user)
        );
        await redis.expire(`hitl:presence:${documentId}`, 3600);

        // Broadcast updated presence to the room
        const users = await getAllPresence(documentId, redis);
        io.to(roomId).emit(SOCKET_EVENTS.PRESENCE_UPDATE, users);
      } catch (err) {
        socket.emit("error", { message: (err as Error).message });
      }
    }
  );

  // ── cursor:update ────────────────────────────────────────────────────────

  socket.on(
    SOCKET_EVENTS.CURSOR_UPDATE,
    async ({ cfi }: { userId: string; cfi: string }) => {
      const { documentId, roomId, userId } = socket.data as Record<
        string,
        string | undefined
      >;
      if (!documentId || !roomId || !userId) return;

      // Rate limit: one broadcast per 50ms per user
      const now = Date.now();
      const last = lastCursorBroadcast.get(userId) ?? 0;
      if (now - last < 50) return;
      lastCursorBroadcast.set(userId, now);

      // Update currentCfi in Redis
      const existing = await redis.hget(`hitl:presence:${documentId}`, userId);
      if (existing) {
        const user = JSON.parse(existing) as PresenceUser;
        user.currentCfi = cfi;
        user.lastSeenAt = new Date().toISOString();
        await redis.hset(
          `hitl:presence:${documentId}`,
          userId,
          JSON.stringify(user)
        );
      }

      const positions = await getCursorPositions(documentId, redis);
      io.to(roomId).emit(SOCKET_EVENTS.CURSOR_POSITIONS, positions);
    }
  );

  // ── disconnect ───────────────────────────────────────────────────────────

  socket.on("disconnect", async () => {
    const { documentId, roomId, userId } = socket.data as Record<
      string,
      string | undefined
    >;
    if (!documentId || !userId) return;

    await redis.hdel(`hitl:presence:${documentId}`, userId);

    if (roomId) {
      const users = await getAllPresence(documentId, redis);
      io.to(roomId).emit(SOCKET_EVENTS.PRESENCE_UPDATE, users);
    }
  });
}
