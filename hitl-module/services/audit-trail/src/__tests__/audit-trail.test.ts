import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  prismaMock,
  redisMock,
  s3SendMock,
  getSignedUrlMock,
  queueAddMock,
} = vi.hoisted(() => {
  const prismaMock = {
    auditEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  };
  const redisMock = {
    get: vi.fn(),
    setex: vi.fn(),
  };
  const s3SendMock = vi.fn();
  const getSignedUrlMock = vi.fn();
  const queueAddMock = vi.fn();
  return { prismaMock, redisMock, s3SendMock, getSignedUrlMock, queueAddMock };
});

vi.mock("../db.js", () => ({ prisma: prismaMock }));
vi.mock("../redis.js", () => ({ redis: redisMock }));
vi.mock("../queue.js", () => ({
  getExportQueue: () => ({ add: queueAddMock }),
  ExportJob: {},
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(() => ({ send: s3SendMock })),
  PutObjectCommand: vi.fn((args) => ({ _type: "PutObject", ...args })),
  GetObjectCommand: vi.fn((args) => ({ _type: "GetObject", ...args })),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { buildServer } from "../app.js";
import { runExport, s3 } from "../workers/export.worker.js";
import { AuditClient } from "@hitl/audit-client";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(id: number, tenantId = "tenant-1") {
  return {
    id: BigInt(id),
    tenantId,
    documentId: null,
    sessionId: null,
    actorType: "user",
    actorId: `user-${id}`,
    eventType: "annotation.created",
    scope: null,
    beforeState: null,
    afterState: null,
    metadata: null,
    occurredAt: new Date("2026-03-17T12:00:00Z"),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("audit-trail", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let token: string;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildServer();
    await app.ready();
    token = app.jwt.sign({ tenantId: "tenant-1", userId: "user-1" });
  });

  afterEach(async () => {
    await app.close();
  });

  // ── UPDATE permission enforcement ──────────────────────────────────────────

  describe("audit_writer role — UPDATE permission", () => {
    it("rejects UPDATE on audit_events (pg integration, skipped if DB unavailable)", async () => {
      // Dynamic import pg only when running this test — keeps CI fast when no DB.
      let pg: typeof import("pg");
      try {
        pg = await import("pg");
      } catch {
        console.warn("pg not importable — skipping DB role test");
        return;
      }

      const connStr =
        process.env.DATABASE_URL_AUDIT ??
        "postgresql://audit_writer:changeme@localhost:5432/hitl";

      const client = new pg.Client({ connectionString: connStr });
      try {
        await client.connect();
      } catch {
        console.warn("DB not reachable — skipping audit_writer UPDATE test");
        return;
      }

      try {
        await client.query(
          "UPDATE audit_events SET actor_id = $1 WHERE id = $2",
          ["hacked", 1]
        );
        // If we get here the role is misconfigured
        expect.fail("UPDATE should have been denied by the audit_writer role");
      } catch (err: unknown) {
        // PostgreSQL error code 42501 = insufficient_privilege
        expect((err as { code?: string }).code).toBe("42501");
      } finally {
        await client.end();
      }
    });
  });

  // ── POST /audit/events ────────────────────────────────────────────────────

  describe("POST /audit/events", () => {
    it("returns 403 without internal header", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/audit/events",
        payload: {
          tenantId: "t1",
          actorType: "user",
          actorId: "u1",
          eventType: "annotation.created",
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 204 and creates event with internal header", async () => {
      prismaMock.auditEvent.create.mockResolvedValue({ id: BigInt(1) });

      const res = await app.inject({
        method: "POST",
        url: "/audit/events",
        headers: { "x-internal-service": "true" },
        payload: {
          tenantId: "tenant-1",
          actorType: "user",
          actorId: "user-1",
          eventType: "annotation.created",
        },
      });

      expect(res.statusCode).toBe(204);
      expect(prismaMock.auditEvent.create).toHaveBeenCalledOnce();
    });
  });

  // ── GET /audit/events — keyset pagination ─────────────────────────────────

  describe("GET /audit/events — keyset pagination", () => {
    it("paginates 150 events in two pages with no duplicates", async () => {
      // Page 1: return 101 items (limit=100 → hasMore=true)
      const page1Items = Array.from({ length: 101 }, (_, i) => makeEvent(i + 1));
      // Page 2: return 50 items (no more)
      const page2Items = Array.from({ length: 50 }, (_, i) => makeEvent(i + 101));

      prismaMock.auditEvent.findMany
        .mockResolvedValueOnce(page1Items)
        .mockResolvedValueOnce(page2Items);

      // Fetch page 1
      const res1 = await app.inject({
        method: "GET",
        url: "/audit/events?limit=100",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res1.statusCode).toBe(200);
      const body1 = res1.json<{ events: { id: string }[]; nextCursor: string }>();
      expect(body1.events).toHaveLength(100);
      expect(body1.nextCursor).toBeDefined();

      // The second findMany call should use id > nextCursor
      const res2 = await app.inject({
        method: "GET",
        url: `/audit/events?limit=100&cursor=${body1.nextCursor}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res2.statusCode).toBe(200);
      const body2 = res2.json<{ events: { id: string }[]; nextCursor?: string }>();
      expect(body2.events).toHaveLength(50);
      expect(body2.nextCursor).toBeUndefined();

      // Total retrieved = 150, no duplicates
      const allIds = [
        ...body1.events.map((e) => e.id),
        ...body2.events.map((e) => e.id),
      ];
      expect(allIds).toHaveLength(150);
      expect(new Set(allIds).size).toBe(150);
    });

    it("enforces tenantId from JWT, not query params", async () => {
      prismaMock.auditEvent.findMany.mockResolvedValue([]);

      await app.inject({
        method: "GET",
        url: "/audit/events?tenantId=evil-tenant",
        headers: { authorization: `Bearer ${token}` },
      });

      // The where clause should use tenantId from JWT (tenant-1), not query params
      const calledWhere = prismaMock.auditEvent.findMany.mock.calls[0][0].where;
      expect(calledWhere.tenantId).toBe("tenant-1");
    });

    it("returns 401 without JWT", async () => {
      const res = await app.inject({ method: "GET", url: "/audit/events" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── Export job ─────────────────────────────────────────────────────────────

  describe("POST /audit/export", () => {
    it("enqueues job and returns 202 with jobId", async () => {
      queueAddMock.mockResolvedValue({ id: "bull-1" });

      const res = await app.inject({
        method: "POST",
        url: "/audit/export",
        headers: { authorization: `Bearer ${token}` },
        payload: { from: "2026-01-01", to: "2026-03-17", format: "csv" },
      });

      expect(res.statusCode).toBe(202);
      const body = res.json<{ jobId: string }>();
      expect(body.jobId).toBeTruthy();
      expect(queueAddMock).toHaveBeenCalledOnce();
    });
  });

  describe("GET /audit/export/:jobId", () => {
    it("returns pending when Redis key absent", async () => {
      redisMock.get.mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: "/audit/export/some-job-id",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "pending" });
    });

    it("returns ready with downloadUrl when Redis key present", async () => {
      redisMock.get.mockResolvedValue(
        JSON.stringify({ status: "ready", downloadUrl: "https://s3.example.com/signed" })
      );

      const res = await app.inject({
        method: "GET",
        url: "/audit/export/job-done",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ status: string; downloadUrl: string }>();
      expect(body.status).toBe("ready");
      expect(body.downloadUrl).toBe("https://s3.example.com/signed");
    });
  });

  // ── runExport — CSV and JSON structure ────────────────────────────────────

  describe("runExport worker", () => {
    beforeEach(() => {
      // Reset s3.send mock (the s3 instance is shared via module)
      s3SendMock.mockResolvedValue({});
      getSignedUrlMock.mockResolvedValue("https://s3.example.com/audit-exports/tenant-1/job-1.csv");
      redisMock.setex.mockResolvedValue("OK");

      // Replace the s3 send method on the exported instance
      (s3 as unknown as { send: typeof s3SendMock }).send = s3SendMock;
    });

    it("produces correct CSV structure with header row", async () => {
      const events = [makeEvent(1), makeEvent(2)];
      prismaMock.auditEvent.findMany
        .mockResolvedValueOnce(events) // batch 1 (< BATCH_SIZE → done)
        .mockResolvedValueOnce([]);    // safety fallback

      await runExport({
        jobId: "job-1",
        tenantId: "tenant-1",
        from: "2026-01-01",
        to: "2026-03-17",
        format: "csv",
      });

      expect(s3SendMock).toHaveBeenCalled();
      const putCall = s3SendMock.mock.calls[0][0] as { Body: Buffer };
      const csvStr = putCall.Body.toString("utf8");

      // Should have a header row
      const lines = csvStr.trim().split("\n");
      expect(lines[0]).toContain("id");
      expect(lines[0]).toContain("tenantId");
      expect(lines[0]).toContain("eventType");
      // Data rows
      expect(lines).toHaveLength(3); // header + 2 data rows
      expect(lines[1]).toContain("tenant-1");
    });

    it("produces correct newline-delimited JSON structure", async () => {
      const events = [makeEvent(10), makeEvent(11)];
      prismaMock.auditEvent.findMany
        .mockResolvedValueOnce(events)
        .mockResolvedValueOnce([]);

      await runExport({
        jobId: "job-2",
        tenantId: "tenant-1",
        from: "2026-01-01",
        to: "2026-03-17",
        format: "json",
      });

      const putCall = s3SendMock.mock.calls[0][0] as { Body: Buffer };
      const ndjson = putCall.Body.toString("utf8");
      const lines = ndjson.trim().split("\n");

      expect(lines).toHaveLength(2);
      const obj = JSON.parse(lines[0]) as { id: string; eventType: string };
      expect(obj.id).toBe("10");
      expect(obj.eventType).toBe("annotation.created");
    });

    it("sets Redis key with status=ready and downloadUrl", async () => {
      prismaMock.auditEvent.findMany.mockResolvedValueOnce([makeEvent(1)]).mockResolvedValueOnce([]);
      const signedUrl = "https://s3.example.com/signed-url";
      getSignedUrlMock.mockResolvedValue(signedUrl);

      await runExport({
        jobId: "job-3",
        tenantId: "tenant-1",
        from: "2026-01-01",
        to: "2026-03-17",
        format: "csv",
      });

      expect(redisMock.setex).toHaveBeenCalledWith(
        "audit:export:job-3",
        86400,
        JSON.stringify({ status: "ready", downloadUrl: signedUrl })
      );
    });
  });

  // ── AuditClient — fire-and-forget ─────────────────────────────────────────

  describe("AuditClient", () => {
    it("never throws when fetch succeeds", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      const client = new AuditClient("http://localhost:3006");
      await expect(
        client.emit({
          tenantId: "t1",
          actorType: "user",
          actorId: "u1",
          eventType: "annotation.created",
        })
      ).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledOnce();
      vi.unstubAllGlobals();
    });

    it("never throws when fetch rejects (network error)", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      vi.stubGlobal("fetch", fetchMock);

      const client = new AuditClient("http://localhost:3006");
      // Must not throw
      await expect(
        client.emit({
          tenantId: "t1",
          actorType: "user",
          actorId: "u1",
          eventType: "annotation.created",
        })
      ).resolves.toBeUndefined();

      vi.unstubAllGlobals();
    });

    it("sends X-Internal-Service: true header", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      const client = new AuditClient("http://localhost:3006");
      await client.emit({
        tenantId: "t1",
        actorType: "agent",
        actorId: "agent-gpt",
        eventType: "ai.response.completed",
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)["X-Internal-Service"]).toBe("true");
      vi.unstubAllGlobals();
    });
  });
});
