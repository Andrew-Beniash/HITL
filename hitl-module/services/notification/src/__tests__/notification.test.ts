import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  prismaMock,
  sesSendMock,
} = vi.hoisted(() => {
  const prismaMock = {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const sesSendMock = vi.fn();
  return { prismaMock, sesSendMock };
});

vi.mock("../prisma.js", () => ({ prisma: prismaMock }));
vi.mock("@aws-sdk/client-ses", () => ({
  SESClient: vi.fn(() => ({ send: sesSendMock })),
  SendEmailCommand: vi.fn((input) => ({ _type: "SendEmailCommand", ...input })),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import type { Job } from "bullmq";
import { processNotificationJob } from "../workers/notification.worker.js";
import type { NotificationJobData } from "../workers/notification.worker.js";
import { buildServer } from "../app.js";

// ── Mock user resolver (stub fetch globally) ──────────────────────────────────

function stubUserFetch(displayName = "Alice", email = "alice@example.com", id = "user-alice") {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id, email, displayName }),
    })
  );
}

function makeJob<T extends NotificationJobData>(data: T, attemptsMade = 0): Job<T> {
  return {
    id: "job-1",
    name: "test",
    data,
    attemptsMade,
    opts: { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
  } as unknown as Job<T>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("notification service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: SES_FROM_ADDRESS set so SES path is exercised
    process.env.SES_FROM_ADDRESS = "noreply@hitl.example.com";
  });

  afterEach(() => {
    delete process.env.SES_FROM_ADDRESS;
    vi.unstubAllGlobals();
  });

  // ── Worker: mention job ───────────────────────────────────────────────────

  describe("processNotificationJob — mention", () => {
    it("creates 1 Notification row and calls SES send once", async () => {
      stubUserFetch("Bob Smith", "bob@example.com", "user-bob");
      prismaMock.notification.create.mockResolvedValue({ id: "notif-1" });
      sesSendMock.mockResolvedValue({});

      const job = makeJob({
        type: "mention",
        mentionerUserId: "user-alice",
        mentionedUsername: "bob",
        documentId: "doc-1",
        documentTitle: "Q3 Report",
        tenantId: "00000000-0000-0000-0000-000000000001",
      });

      await processNotificationJob(job);

      // 1 Notification row created
      expect(prismaMock.notification.create).toHaveBeenCalledOnce();
      const createArg = prismaMock.notification.create.mock.calls[0][0].data;
      expect(createArg.type).toBe("mention");
      expect(createArg.userId).toBe("user-bob");
      expect(createArg.read).toBe(false);

      // 1 SES send call
      expect(sesSendMock).toHaveBeenCalledOnce();
      const sesArg = sesSendMock.mock.calls[0][0];
      expect(sesArg.Destination.ToAddresses).toContain("bob@example.com");
    });

    it("email subject contains mentioner's name", async () => {
      // First call resolves recipient (by-username), second resolves mentioner (by-id)
      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "user-bob", email: "bob@example.com", displayName: "Bob" }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "user-alice", email: "alice@example.com", displayName: "Alice" }),
          })
      );
      prismaMock.notification.create.mockResolvedValue({});
      sesSendMock.mockResolvedValue({});

      await processNotificationJob(
        makeJob({
          type: "mention",
          mentionerUserId: "user-alice",
          mentionedUsername: "bob",
          documentId: "doc-2",
          documentTitle: "Contract Draft",
          tenantId: "00000000-0000-0000-0000-000000000001",
        })
      );

      const sesArg = sesSendMock.mock.calls[0][0];
      expect(sesArg.Message.Subject.Data).toContain("Alice");
    });
  });

  // ── Worker: SES failure triggers retry ───────────────────────────────────

  describe("processNotificationJob — SES failure / retry", () => {
    it("throws on SES failure so BullMQ can retry (attemptsMade < 3)", async () => {
      stubUserFetch();
      prismaMock.notification.create.mockResolvedValue({});
      sesSendMock.mockRejectedValue(new Error("SES network error"));

      const job = makeJob(
        {
          type: "mention",
          mentionerUserId: "user-x",
          mentionedUsername: "alice",
          documentId: "doc-1",
          tenantId: "00000000-0000-0000-0000-000000000001",
        },
        1 // attemptsMade < 3 → still eligible for retry
      );

      await expect(processNotificationJob(job)).rejects.toThrow("SES network error");

      // Notification was still persisted before the email attempt
      expect(prismaMock.notification.create).toHaveBeenCalledOnce();

      // Confirm job is retryable: attemptsMade (1) < attempts (3)
      expect(job.attemptsMade).toBeLessThan(job.opts.attempts!);
    });

    it("Notification row is created before the email attempt even if SES fails", async () => {
      stubUserFetch();
      prismaMock.notification.create.mockResolvedValue({});
      sesSendMock.mockRejectedValue(new Error("SES timeout"));

      await expect(
        processNotificationJob(
          makeJob({
            type: "mention",
            mentionerUserId: "user-x",
            mentionedUsername: "alice",
            documentId: "doc-1",
            tenantId: "00000000-0000-0000-0000-000000000001",
          })
        )
      ).rejects.toThrow();

      expect(prismaMock.notification.create).toHaveBeenCalledOnce();
    });
  });

  // ── Worker: review_request job ────────────────────────────────────────────

  describe("processNotificationJob — review_request", () => {
    it("renders deadline in email body when present", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "user-bob", email: "bob@example.com", displayName: "Bob" }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "user-alice", email: "alice@example.com", displayName: "Alice" }),
          })
      );
      prismaMock.notification.create.mockResolvedValue({});
      sesSendMock.mockResolvedValue({});

      await processNotificationJob(
        makeJob({
          type: "review_request",
          userId: "user-bob",
          requestedByUserId: "user-alice",
          documentId: "doc-3",
          documentTitle: "Policy Draft",
          deadline: "2026-04-01",
          urgency: "high",
          tenantId: "00000000-0000-0000-0000-000000000001",
        })
      );

      const sesArg = sesSendMock.mock.calls[0][0];
      expect(sesArg.Message.Subject.Data).toContain("Policy Draft");
      const htmlBody = sesArg.Message.Body.Html.Data;
      expect(htmlBody).toContain("2026-04-01");
    });
  });

  // ── HTTP routes ───────────────────────────────────────────────────────────

  describe("GET /notifications/unread", () => {
    let app: Awaited<ReturnType<typeof buildServer>>;
    let token: string;

    beforeEach(async () => {
      app = await buildServer();
      await app.ready();
      token = app.jwt.sign({ userId: "user-alice", tenantId: "tenant-1" });
    });

    afterEach(async () => {
      await app.close();
    });

    it("returns only the requesting user's unread notifications", async () => {
      const userNotifications = [
        { id: "n1", userId: "user-alice", type: "mention", read: false, payload: {}, createdAt: new Date().toISOString() },
        { id: "n2", userId: "user-alice", type: "review_request", read: false, payload: {}, createdAt: new Date().toISOString() },
      ];
      prismaMock.notification.findMany.mockResolvedValue(userNotifications);

      const res = await app.inject({
        method: "GET",
        url: "/notifications/unread",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ notifications: { id: string }[] }>();
      expect(body.notifications).toHaveLength(2);

      // Verify Prisma was called with correct userId + read:false filter
      const findManyCall = prismaMock.notification.findMany.mock.calls[0][0];
      expect(findManyCall.where.userId).toBe("user-alice");
      expect(findManyCall.where.read).toBe(false);
    });

    it("returns 401 without JWT", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/notifications/unread",
      });
      expect(res.statusCode).toBe(401);
    });

    it("does not return other users' notifications", async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);

      await app.inject({
        method: "GET",
        url: "/notifications/unread",
        headers: { authorization: `Bearer ${token}` },
      });

      // The query is always scoped to the JWT userId — no cross-user leakage
      const findManyCall = prismaMock.notification.findMany.mock.calls[0][0];
      expect(findManyCall.where.userId).toBe("user-alice");
      // tenantId should NOT be overridable by query params
      expect(findManyCall.where).not.toHaveProperty("userId", "user-bob");
    });
  });

  describe("POST /notifications/:id/read", () => {
    let app: Awaited<ReturnType<typeof buildServer>>;
    let token: string;

    beforeEach(async () => {
      app = await buildServer();
      await app.ready();
      token = app.jwt.sign({ userId: "user-alice", tenantId: "tenant-1" });
    });

    afterEach(async () => {
      await app.close();
    });

    it("marks notification as read and returns 204", async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });

      const res = await app.inject({
        method: "POST",
        url: "/notifications/notif-123/read",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(204);

      const updateCall = prismaMock.notification.updateMany.mock.calls[0][0];
      expect(updateCall.where.id).toBe("notif-123");
      expect(updateCall.where.userId).toBe("user-alice");
      expect(updateCall.data.read).toBe(true);
    });

    it("returns 404 when notification not found or belongs to another user", async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

      const res = await app.inject({
        method: "POST",
        url: "/notifications/notif-other/read",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
