import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import type { AddressInfo } from "node:net";
import { SOCKET_EVENTS } from "@hitl/shared-types";
import type { PresenceUser } from "@hitl/shared-types";
import { buildServer } from "../app.js";
import { handleRedisMessage } from "../redis-subscriber.js";
import type { Server } from "socket.io";

// ── Minimal in-memory Redis mock ──────────────────────────────────────────────

class MockRedis {
  private strings = new Map<string, string>();
  private hashes = new Map<string, Map<string, string>>();

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }
  async setex(key: string, _ttl: number, value: string): Promise<"OK"> {
    this.strings.set(key, value);
    return "OK";
  }
  async hset(key: string, field: string, value: string): Promise<number> {
    if (!this.hashes.has(key)) this.hashes.set(key, new Map());
    this.hashes.get(key)!.set(field, value);
    return 1;
  }
  async hget(key: string, field: string): Promise<string | null> {
    return this.hashes.get(key)?.get(field) ?? null;
  }
  async hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.hashes.get(key);
    if (!hash) return {};
    return Object.fromEntries(hash.entries());
  }
  async hdel(key: string, ...fields: string[]): Promise<number> {
    const hash = this.hashes.get(key);
    if (!hash) return 0;
    let n = 0;
    for (const f of fields) if (hash.delete(f)) n++;
    return n;
  }
  async expire(_key: string, _ttl: number): Promise<number> {
    return 1;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function waitForEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${event}`)),
      2000
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function connectClient(
  port: number,
  token: string,
  id = `client-${Math.random()}`
): ClientSocket {
  return ioc(`http://localhost:${port}`, {
    auth: { token },
    forceNew: true,
    transports: ["websocket"],
  });
}

async function waitForConnect(socket: ClientSocket): Promise<void> {
  if (socket.connected) return;
  return new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
}

// ── Server factory ────────────────────────────────────────────────────────────

async function createTestServer() {
  const mockRedis = new MockRedis();
  const { app, io } = await buildServer({ redis: mockRedis });

  // Mock fetch for getDocumentId session lookup
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session: { documentId: "doc-test-1" },
        document: { id: "doc-test-1", tenantId: "tenant-1" },
      }),
    })
  );

  await app.listen({ port: 0 });
  const port = (app.server.address() as AddressInfo).port;
  const token = app.jwt.sign({ userId: "user-1", tenantId: "tenant-1" });

  return { app, io, port, token, mockRedis };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("collaboration service", () => {
  let app: Awaited<ReturnType<typeof buildServer>>["app"];
  let io: Server;
  let port: number;
  let token: string;
  let mockRedis: MockRedis;
  let clients: ClientSocket[] = [];

  beforeEach(async () => {
    ({ app, io, port, token, mockRedis } = await createTestServer());
    clients = [];
  });

  afterEach(async () => {
    for (const c of clients) c.disconnect();
    await app.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ── Presence: two clients see each other ──────────────────────────────────

  describe("presence:join", () => {
    it("two clients joining same document both appear in each other's presence list within 500ms", async () => {
      const token1 = app.jwt.sign({ userId: "user-1", tenantId: "tenant-1" });
      const token2 = app.jwt.sign({ userId: "user-2", tenantId: "tenant-1" });

      const c1 = connectClient(port, token1);
      const c2 = connectClient(port, token2);
      clients.push(c1, c2);

      await Promise.all([waitForConnect(c1), waitForConnect(c2)]);

      // Track presence updates received by each client
      const c1Updates: PresenceUser[][] = [];
      const c2Updates: PresenceUser[][] = [];
      c1.on(SOCKET_EVENTS.PRESENCE_UPDATE, (u: PresenceUser[]) => c1Updates.push(u));
      c2.on(SOCKET_EVENTS.PRESENCE_UPDATE, (u: PresenceUser[]) => c2Updates.push(u));

      // Both join with different userIds
      c1.emit(SOCKET_EVENTS.PRESENCE_JOIN, {
        sessionId: "sess-1",
        userId: "user-1",
        displayName: "Alice",
        avatarUrl: "https://example.com/alice.png",
      });
      c2.emit(SOCKET_EVENTS.PRESENCE_JOIN, {
        sessionId: "sess-2",
        userId: "user-2",
        displayName: "Bob",
        avatarUrl: "https://example.com/bob.png",
      });

      // Wait up to 500ms for presence to converge
      await new Promise((r) => setTimeout(r, 300));

      // Both clients should have received a presence update with 2 users
      const lastC1 = c1Updates[c1Updates.length - 1];
      const lastC2 = c2Updates[c2Updates.length - 1];

      expect(lastC1).toBeDefined();
      expect(lastC2).toBeDefined();
      expect(lastC1.length).toBe(2);
      expect(lastC2.length).toBe(2);

      const userIds1 = lastC1.map((u) => u.userId).sort();
      const userIds2 = lastC2.map((u) => u.userId).sort();
      expect(userIds1).toEqual(["user-1", "user-2"]);
      expect(userIds2).toEqual(["user-1", "user-2"]);
    });

    it("removes user from presence on disconnect", async () => {
      const c1 = connectClient(port, token);
      clients.push(c1);
      await waitForConnect(c1);

      c1.emit(SOCKET_EVENTS.PRESENCE_JOIN, {
        sessionId: "sess-1",
        userId: "user-1",
        displayName: "Alice",
        avatarUrl: "",
      });

      // Wait for join to complete
      await waitForEvent<PresenceUser[]>(c1, SOCKET_EVENTS.PRESENCE_UPDATE);

      // Now connect observer
      const token2 = app.jwt.sign({ userId: "user-2", tenantId: "tenant-1" });
      const c2 = connectClient(port, token2);
      clients.push(c2);
      await waitForConnect(c2);
      c2.emit(SOCKET_EVENTS.PRESENCE_JOIN, {
        sessionId: "sess-2",
        userId: "user-2",
        displayName: "Bob",
        avatarUrl: "",
      });

      // Wait for 2-user presence update
      let updateReceived: PresenceUser[] = [];
      c2.on(SOCKET_EVENTS.PRESENCE_UPDATE, (u: PresenceUser[]) => {
        updateReceived = u;
      });
      await new Promise((r) => setTimeout(r, 200));

      // c1 disconnects
      const disconnectUpdate = waitForEvent<PresenceUser[]>(
        c2,
        SOCKET_EVENTS.PRESENCE_UPDATE
      );
      c1.disconnect();
      const afterDisconnect = await disconnectUpdate;

      expect(afterDisconnect.some((u) => u.userId === "user-1")).toBe(false);
    });
  });

  // ── Cursor throttling ─────────────────────────────────────────────────────

  describe("cursor:update throttling", () => {
    it("rate-limits cursor broadcasts to ≤2 per 40ms with 10 rapid emits", async () => {
      const c1 = connectClient(port, token);
      const observer = connectClient(
        port,
        app.jwt.sign({ userId: "user-obs", tenantId: "tenant-1" })
      );
      clients.push(c1, observer);

      await Promise.all([waitForConnect(c1), waitForConnect(observer)]);

      // Both join the same room
      c1.emit(SOCKET_EVENTS.PRESENCE_JOIN, {
        sessionId: "sess-1",
        userId: "user-1",
        displayName: "Alice",
        avatarUrl: "",
      });
      observer.emit(SOCKET_EVENTS.PRESENCE_JOIN, {
        sessionId: "sess-obs",
        userId: "user-obs",
        displayName: "Observer",
        avatarUrl: "",
      });
      await new Promise((r) => setTimeout(r, 150));

      // Count cursor broadcasts observed
      let cursorBroadcastCount = 0;
      observer.on(SOCKET_EVENTS.CURSOR_POSITIONS, () => {
        cursorBroadcastCount++;
      });

      // Emit 10 cursor updates within 40ms
      for (let i = 0; i < 10; i++) {
        c1.emit(SOCKET_EVENTS.CURSOR_UPDATE, {
          userId: "user-1",
          cfi: `epubcfi(/6/4[ch01]!/4/${i}:0)`,
        });
      }

      // Wait for throttle window to pass
      await new Promise((r) => setTimeout(r, 200));

      expect(cursorBroadcastCount).toBeLessThanOrEqual(2);
      expect(cursorBroadcastCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Redis pub/sub bridge ──────────────────────────────────────────────────

  describe("redis-subscriber bridge", () => {
    it("handleRedisMessage pushes annotation:sync to doc room members", async () => {
      const c1 = connectClient(port, token);
      clients.push(c1);
      await waitForConnect(c1);

      c1.emit(SOCKET_EVENTS.PRESENCE_JOIN, {
        sessionId: "sess-1",
        userId: "user-1",
        displayName: "Alice",
        avatarUrl: "",
      });
      await new Promise((r) => setTimeout(r, 150));

      // Listen for annotation:sync
      const annotationPromise = waitForEvent<{ action: string }>(
        c1,
        SOCKET_EVENTS.ANNOTATION_SYNC
      );

      // Simulate Redis publish on hitl:annotation:doc-test-1
      const payload = { action: "created", annotationId: "ann-1" };
      handleRedisMessage(io, "hitl:annotation:doc-test-1", JSON.stringify(payload));

      const received = await annotationPromise;
      expect(received).toMatchObject({ action: "created", annotationId: "ann-1" });
    });

    it("handleRedisMessage pushes epub:updated to doc room members", async () => {
      const c1 = connectClient(port, token);
      clients.push(c1);
      await waitForConnect(c1);

      c1.emit(SOCKET_EVENTS.PRESENCE_JOIN, {
        sessionId: "sess-1",
        userId: "user-1",
        displayName: "Alice",
        avatarUrl: "",
      });
      await new Promise((r) => setTimeout(r, 150));

      // Listen for epub:updated
      const epubPromise = waitForEvent<{ epubS3Key: string }>(
        c1,
        SOCKET_EVENTS.EPUB_UPDATED
      );

      const payload = { epubS3Key: "tenant-1/doc-1/epub/v2.epub" };
      handleRedisMessage(io, "hitl:epub:doc-test-1", JSON.stringify(payload));

      const received = await epubPromise;
      expect(received).toMatchObject({ epubS3Key: "tenant-1/doc-1/epub/v2.epub" });
    });

    it("does not deliver annotation:sync to clients in a different document room", async () => {
      const c1 = connectClient(port, token);
      clients.push(c1);
      await waitForConnect(c1);

      c1.emit(SOCKET_EVENTS.PRESENCE_JOIN, {
        sessionId: "sess-1",
        userId: "user-1",
        displayName: "Alice",
        avatarUrl: "",
      });
      await new Promise((r) => setTimeout(r, 150));

      let received = false;
      c1.on(SOCKET_EVENTS.ANNOTATION_SYNC, () => { received = true; });

      // Publish to a DIFFERENT documentId
      handleRedisMessage(
        io,
        "hitl:annotation:doc-OTHER",
        JSON.stringify({ action: "created" })
      );

      await new Promise((r) => setTimeout(r, 100));
      expect(received).toBe(false);
    });
  });

  // ── Health endpoint ───────────────────────────────────────────────────────

  describe("GET /health", () => {
    it("returns status ok with connection count", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ status: string; connections: number }>();
      expect(body.status).toBe("ok");
      expect(typeof body.connections).toBe("number");
    });
  });

  // ── JWT auth ──────────────────────────────────────────────────────────────

  describe("Socket.IO JWT middleware", () => {
    it("rejects connection without a token", async () => {
      const bad = ioc(`http://localhost:${port}`, {
        auth: {},
        forceNew: true,
        transports: ["websocket"],
      });
      clients.push(bad);

      await new Promise<void>((resolve) => {
        bad.on("connect_error", (err) => {
          expect(err.message).toContain("unauthorized");
          resolve();
        });
        // Fail if it connects
        bad.on("connect", () => {
          throw new Error("should not have connected");
        });
      });
    });
  });
});
