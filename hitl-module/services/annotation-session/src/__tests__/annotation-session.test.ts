import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks (hoisted before imports) ─────────────────────────────────────

const { prismaMock, redisPublishMock, auditEmitMock, queueAddMock } = vi.hoisted(() => {
  const prismaMock = {
    document: { findFirst: vi.fn() },
    annotation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    annotationReply: { create: vi.fn() },
    session: { create: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  const redisPublishMock = vi.fn();
  const auditEmitMock = vi.fn();
  const queueAddMock = vi.fn();
  return { prismaMock, redisPublishMock, auditEmitMock, queueAddMock };
});

vi.mock("../prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../redis.js", () => ({
  redis: { publish: redisPublishMock },
}));
vi.mock("../audit.js", () => ({
  auditClient: { emit: auditEmitMock },
}));
vi.mock("../queue.js", () => ({
  getNotificationQueue: () => ({ add: queueAddMock }),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { validateCfi } from "../lib/cfi-validator.js";
import { extractMentions } from "../lib/mention-extractor.js";
import { buildServer } from "../app.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJwt(payload: Record<string, unknown>) {
  // encode a fake JWT — the server uses @fastify/jwt with "dev-secret"
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  // signature is skipped — we'll use a real sign via app.jwt
  return `${header}.${body}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("cfi-validator", () => {
  it("accepts valid epubcfi strings", () => {
    expect(validateCfi("epubcfi(/6/4[chap01]!/4/2/1:0)")).toBe(true);
    expect(validateCfi("epubcfi(/2/4)")).toBe(true);
  });

  it("rejects malformed strings", () => {
    expect(validateCfi("epubcfi()")).toBe(false); // empty interior
    expect(validateCfi("/6/4")).toBe(false);
    expect(validateCfi("")).toBe(false);
    expect(validateCfi("cfi(/2/4)")).toBe(false);
  });
});

describe("mention-extractor", () => {
  it("extracts single mention", () => {
    expect(extractMentions("hello @alice")).toEqual(["alice"]);
  });

  it("extracts multiple mentions", () => {
    expect(extractMentions("@bob and @carol reviewed this")).toEqual(["bob", "carol"]);
  });

  it("returns empty array when no mentions", () => {
    expect(extractMentions("no mentions here")).toEqual([]);
  });

  it("does not extract email addresses", () => {
    // email@domain — only the 'domain' part after @ if it's word chars before a dot
    // The regex /@(\w+)/g matches the word part after @
    const result = extractMentions("send to user@example.com");
    expect(result).toEqual(["example"]);
  });
});

describe("annotation-session routes", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let token: string;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildServer();
    await app.ready();
    // Sign a real JWT using the app's jwt plugin
    token = app.jwt.sign({ tenantId: "tenant-1", userId: "user-1" });
  });

  afterEach(async () => {
    await app.close();
  });

  // ── Approval block (409) ─────────────────────────────────────────────────

  describe("POST /documents/:id/check-approval", () => {
    it("returns 409 when open CRITICAL_FLAG annotations exist", async () => {
      prismaMock.annotation.findMany.mockResolvedValue([
        { id: "flag-1" },
        { id: "flag-2" },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/documents/doc-1/check-approval",
        headers: { "x-internal-service": "true" },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.error).toBe("unresolved_critical_flags");
      expect(body.flagIds).toEqual(["flag-1", "flag-2"]);
    });

    it("returns 200 approved when no open flags", async () => {
      prismaMock.annotation.findMany.mockResolvedValue([]);

      const res = await app.inject({
        method: "POST",
        url: "/documents/doc-1/check-approval",
        headers: { "x-internal-service": "true" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ approved: true });
    });

    it("returns 403 when internal header is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/documents/doc-1/check-approval",
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // ── POST /documents/:id/annotations ─────────────────────────────────────

  describe("POST /documents/:id/annotations", () => {
    it("returns 400 for invalid CFI", async () => {
      prismaMock.document.findFirst.mockResolvedValue({ id: "doc-1", tenantId: "tenant-1" });

      const res = await app.inject({
        method: "POST",
        url: "/documents/doc-1/annotations",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          sessionId: "sess-1",
          documentVersionId: "ver-1",
          type: "HUMAN_COMMENT",
          cfi: "not-a-valid-cfi",
          payload: { body: "hello" },
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("invalid_cfi");
    });

    it("publishes to Redis on annotation create", async () => {
      const annotation = {
        id: "ann-1",
        documentId: "doc-1",
        type: "HUMAN_COMMENT",
        status: "OPEN",
        replies: [],
      };
      prismaMock.document.findFirst.mockResolvedValue({ id: "doc-1", tenantId: "tenant-1" });
      prismaMock.annotation.create.mockResolvedValue(annotation);
      redisPublishMock.mockResolvedValue(1);

      const res = await app.inject({
        method: "POST",
        url: "/documents/doc-1/annotations",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          sessionId: "sess-1",
          documentVersionId: "ver-1",
          type: "HUMAN_COMMENT",
          cfi: "epubcfi(/6/4[ch01]!/4/2/1:0)",
          payload: { body: "looks good" },
          authorId: "user-1",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(redisPublishMock).toHaveBeenCalledWith(
        "hitl:annotation:doc-1",
        expect.stringContaining("\"action\":\"created\"")
      );
    });

    it("emits audit event on annotation create", async () => {
      const annotation = {
        id: "ann-2",
        documentId: "doc-1",
        type: "CRITICAL_FLAG",
        status: "OPEN",
        replies: [],
      };
      prismaMock.document.findFirst.mockResolvedValue({ id: "doc-1", tenantId: "tenant-1" });
      prismaMock.annotation.create.mockResolvedValue(annotation);
      redisPublishMock.mockResolvedValue(1);

      await app.inject({
        method: "POST",
        url: "/documents/doc-1/annotations",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          sessionId: "sess-1",
          documentVersionId: "ver-1",
          type: "CRITICAL_FLAG",
          cfi: "epubcfi(/6/4[ch01]!/4/2/1:0)",
          payload: { message: "critical issue" },
        },
      });

      expect(auditEmitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "annotation.created",
          tenantId: "tenant-1",
          documentId: "doc-1",
        })
      );
    });
  });

  // ── PATCH /annotations/:id/resolve ──────────────────────────────────────

  describe("PATCH /annotations/:id/resolve", () => {
    it("publishes to Redis and emits audit event on resolve", async () => {
      const existing = {
        id: "ann-1",
        documentId: "doc-1",
        status: "OPEN",
        session: { tenantId: "tenant-1" },
      };
      const updated = { id: "ann-1", status: "RESOLVED", replies: [] };

      prismaMock.annotation.findFirst.mockResolvedValue(existing);
      prismaMock.$transaction.mockImplementation(
        async (cb: (tx: typeof prismaMock) => Promise<unknown>) => {
          prismaMock.annotation.update.mockResolvedValue(updated);
          return cb(prismaMock);
        }
      );
      redisPublishMock.mockResolvedValue(1);

      const res = await app.inject({
        method: "PATCH",
        url: "/annotations/ann-1/resolve",
        headers: { authorization: `Bearer ${token}` },
        payload: { decision: "resolved" },
      });

      expect(res.statusCode).toBe(200);

      expect(redisPublishMock).toHaveBeenCalledWith(
        "hitl:annotation:doc-1",
        expect.stringContaining("\"action\":\"resolved\"")
      );

      expect(auditEmitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "annotation.resolved",
          tenantId: "tenant-1",
        })
      );
    });

    it("returns 403 for cross-tenant access", async () => {
      prismaMock.annotation.findFirst.mockResolvedValue({
        id: "ann-1",
        documentId: "doc-2",
        status: "OPEN",
        session: { tenantId: "tenant-other" },
      });

      const res = await app.inject({
        method: "PATCH",
        url: "/annotations/ann-1/resolve",
        headers: { authorization: `Bearer ${token}` },
        payload: { decision: "resolved" },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
