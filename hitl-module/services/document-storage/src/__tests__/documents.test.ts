import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks (hoisted before imports) ─────────────────────────────────────

const prismaMock = {
  document: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  documentVersion: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
};

const uploadDocumentMock = vi.fn();
const getSignedEpubUrlMock = vi.fn();
const enqueueConversionJobMock = vi.fn();
const enqueueXlsxEditJobMock = vi.fn();
const auditEmitMock = vi.fn();

vi.mock("../prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../s3.js", () => ({
  uploadDocument: uploadDocumentMock,
  getSignedEpubUrl: getSignedEpubUrlMock,
  sourceKey: vi.fn((t: string, d: string, v: number, f: string) => `${t}/${d}/source/v${v}/${f}`),
}));
vi.mock("../queue.js", () => ({
  enqueueConversionJob: enqueueConversionJobMock,
  enqueueXlsxEditJob: enqueueXlsxEditJobMock,
}));
vi.mock("../audit.js", () => ({
  auditClient: { emit: auditEmitMock },
}));

// ── Test suite ────────────────────────────────────────────────────────────────

describe("document routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Upload flow ─────────────────────────────────────────────────────────────

  describe("POST /documents", () => {
    it("stores file in S3, creates rows, enqueues conversion, returns 201", async () => {
      const docId = "doc-1";
      const verId = "ver-1";

      uploadDocumentMock.mockResolvedValue("tenant-a/doc-1/source/v1/report.docx");
      enqueueConversionJobMock.mockResolvedValue("job-abc");

      prismaMock.$transaction.mockImplementation(
        async (cb: (tx: typeof prismaMock) => Promise<unknown>) => {
          prismaMock.document.create.mockResolvedValueOnce({
            id: docId,
            tenantId: "tenant-a",
            title: "report",
            sourceFormat: "DOCX",
            reviewState: "OPEN",
            currentVersionId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          prismaMock.documentVersion.create.mockResolvedValueOnce({
            id: verId,
            documentId: docId,
            versionNumber: 1,
            sourceS3Key: "tenant-a/doc-1/source/v1/report.docx",
            conversionStatus: "PENDING",
            createdBy: "user-1",
            createdAt: new Date(),
          });
          prismaMock.document.update.mockResolvedValueOnce({});
          return cb(prismaMock);
        }
      );

      const { buildServer } = await import("../app.js");
      const app = buildServer({ logger: false });

      // Build multipart form body manually
      const boundary = "----TestBoundary";
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="report.docx"',
        "Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "",
        "FAKE_DOCX_CONTENT",
        `--${boundary}--`,
      ].join("\r\n");

      const response = await app.inject({
        method: "POST",
        url: "/documents",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "x-tenant-id": "tenant-a",
          "x-user-id": "user-1",
        },
        payload: body,
      });

      expect(response.statusCode).toBe(201);
      expect(uploadDocumentMock).toHaveBeenCalledTimes(1);
      expect(enqueueConversionJobMock).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(auditEmitMock).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "document.opened" })
      );
      await app.close();
    });
  });

  // ── Signed URL 202 / 200 state machine ──────────────────────────────────────

  describe("GET /documents/:id/epub", () => {
    it("returns 202 while conversion is pending", async () => {
      prismaMock.document.findFirst.mockResolvedValue({
        id: "doc-1",
        tenantId: "tenant-a",
        currentVersion: {
          id: "ver-1",
          conversionStatus: "PENDING",
          epubS3Key: null,
        },
      });

      const { buildServer } = await import("../app.js");
      const app = buildServer({ logger: false });

      const response = await app.inject({
        method: "GET",
        url: "/documents/doc-1/epub",
        headers: { "x-tenant-id": "tenant-a" },
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({ conversionStatus: "pending" });
      await app.close();
    });

    it("returns 200 with signed URL once conversion is complete", async () => {
      prismaMock.document.findFirst.mockResolvedValue({
        id: "doc-1",
        tenantId: "tenant-a",
        currentVersion: {
          id: "ver-1",
          conversionStatus: "COMPLETE",
          epubS3Key: "tenant-a/doc-1/epub/v1/document.epub",
        },
      });
      getSignedEpubUrlMock.mockResolvedValue({
        url: "https://s3.example.com/signed-url",
        expiresAt: "2026-03-17T15:00:00.000Z",
      });

      const { buildServer } = await import("../app.js");
      const app = buildServer({ logger: false });

      const response = await app.inject({
        method: "GET",
        url: "/documents/doc-1/epub",
        headers: { "x-tenant-id": "tenant-a" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        signedUrl: "https://s3.example.com/signed-url",
        conversionStatus: "complete",
      });
      expect(getSignedEpubUrlMock).toHaveBeenCalledWith(
        "tenant-a/doc-1/epub/v1/document.epub"
      );
      await app.close();
    });
  });

  // ── Rollback does not delete any rows ───────────────────────────────────────

  describe("PUT /documents/:id/rollback", () => {
    it("updates currentVersionId without calling any delete operations", async () => {
      prismaMock.document.findFirst.mockResolvedValue({
        id: "doc-1",
        tenantId: "tenant-a",
        currentVersionId: "ver-2",
        reviewState: "OPEN",
      });
      prismaMock.documentVersion.findFirst.mockResolvedValue({
        id: "ver-1",
        documentId: "doc-1",
        versionNumber: 1,
        sourceS3Key: "tenant-a/doc-1/source/v1/file.docx",
        conversionStatus: "COMPLETE",
      });
      prismaMock.document.update.mockResolvedValue({
        id: "doc-1",
        tenantId: "tenant-a",
        currentVersionId: "ver-1",
        reviewState: "OPEN",
      });

      const { buildServer } = await import("../app.js");
      const app = buildServer({ logger: false });

      const response = await app.inject({
        method: "PUT",
        url: "/documents/doc-1/rollback",
        headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-1" },
        payload: { versionId: "ver-1" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().document.currentVersionId).toBe("ver-1");

      // No delete should ever be called
      expect(prismaMock.document).not.toHaveProperty("delete");
      expect(prismaMock.documentVersion).not.toHaveProperty("delete");

      expect(prismaMock.document.update).toHaveBeenCalledWith({
        where: { id: "doc-1" },
        data: { currentVersionId: "ver-1" },
      });

      expect(auditEmitMock).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "document.rolled_back" })
      );
      await app.close();
    });
  });

  // ── Approve: forward 409 from annotation service ────────────────────────────

  describe("POST /documents/:id/approve", () => {
    it("forwards 409 with flagIds when unresolved critical flags exist", async () => {
      prismaMock.document.findFirst.mockResolvedValue({
        id: "doc-1",
        tenantId: "tenant-a",
        reviewState: "OPEN",
        currentVersionId: "ver-1",
      });

      // Stub global fetch to simulate annotation service returning 409
      const flagIds = ["flag-a", "flag-b"];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          status: 409,
          json: async () => ({
            error: "unresolved_critical_flags",
            flagIds,
          }),
        })
      );

      const { buildServer } = await import("../app.js");
      const app = buildServer({ logger: false });

      const response = await app.inject({
        method: "POST",
        url: "/documents/doc-1/approve",
        headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-1" },
        payload: { decision: "approved" },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: "unresolved_critical_flags",
        flagIds,
      });
      // Document should NOT be updated when blocked
      expect(prismaMock.document.update).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
      await app.close();
    });

    it("updates reviewState and emits audit event when no blocking flags", async () => {
      prismaMock.document.findFirst.mockResolvedValue({
        id: "doc-1",
        tenantId: "tenant-a",
        reviewState: "OPEN",
        currentVersionId: "ver-1",
      });
      prismaMock.document.update.mockResolvedValue({
        id: "doc-1",
        tenantId: "tenant-a",
        reviewState: "APPROVED",
        currentVersionId: "ver-1",
      });

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ status: 200, json: async () => ({}) })
      );

      const { buildServer } = await import("../app.js");
      const app = buildServer({ logger: false });

      const response = await app.inject({
        method: "POST",
        url: "/documents/doc-1/approve",
        headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-1" },
        payload: { decision: "approved" },
      });

      expect(response.statusCode).toBe(200);
      expect(prismaMock.document.update).toHaveBeenCalledWith({
        where: { id: "doc-1" },
        data: { reviewState: "APPROVED" },
      });
      expect(auditEmitMock).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "approval.state_changed" })
      );

      vi.unstubAllGlobals();
      await app.close();
    });
  });
});
