import { randomUUID } from "node:crypto";
import path from "node:path";
import type { FastifyPluginAsync } from "fastify";
import type { SourceFormat } from "@hitl/shared-types";
import { prisma } from "../prisma.js";
import { auditClient } from "../audit.js";
import {
  uploadDocument,
  getSignedEpubUrl,
  sourceKey,
} from "../s3.js";
import {
  enqueueConversionJob,
  enqueueXlsxEditJob,
} from "../queue.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const ANNOTATION_SERVICE =
  process.env.ANNOTATION_SERVICE_URL ?? "http://annotation-session:3003";

const EXT_TO_FORMAT: Record<string, SourceFormat> = {
  ".docx": "docx",
  ".pdf": "pdf",
  ".xlsx": "xlsx",
  ".md": "md",
  ".epub": "epub",
};

function detectFormat(filename: string): SourceFormat {
  const ext = path.extname(filename).toLowerCase();
  return EXT_TO_FORMAT[ext] ?? "docx";
}

function requireTenant(request: { tenantId?: string; userId?: string }) {
  if (!request.tenantId) {
    const err = new Error("tenant context missing");
    (err as Error & { statusCode?: number }).statusCode = 401;
    throw err;
  }
  return {
    tenantId: request.tenantId,
    userId: request.userId ?? "unknown",
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

export const documentRoutes: FastifyPluginAsync = async (app) => {
  // ── POST /documents ───────────────────────────────────────────────────────

  app.post("/documents", async (request, reply) => {
    const { tenantId, userId } = requireTenant(request);

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: "no_file" });
    }

    const filename = data.filename;
    const buffer = await data.toBuffer();
    const sourceFormat = detectFormat(filename);
    const documentId = randomUUID();
    const versionId = randomUUID();
    const versionNumber = 1;

    const s3Key = await uploadDocument(
      tenantId,
      documentId,
      versionNumber,
      filename,
      buffer,
      data.mimetype
    );

    // Parse optional title from fields; fall back to filename stem
    const title =
      (await (request as unknown as { body?: { title?: string } }).body?.title) ??
      path.parse(filename).name;

    const [document, version] = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          id: documentId,
          tenantId,
          title: typeof title === "string" ? title : path.parse(filename).name,
          sourceFormat: sourceFormat.toUpperCase() as Uppercase<SourceFormat>,
        },
      });

      const ver = await tx.documentVersion.create({
        data: {
          id: versionId,
          documentId,
          versionNumber,
          sourceS3Key: s3Key,
          conversionStatus: "PENDING",
          createdBy: userId,
        },
      });

      await tx.document.update({
        where: { id: documentId },
        data: { currentVersionId: versionId },
      });

      return [doc, ver] as const;
    });

    const conversionJobId = await enqueueConversionJob({
      documentId,
      versionId,
      s3SourceKey: s3Key,
      sourceFormat,
      tenantId,
    });

    auditClient.emit({
      id: randomUUID(),
      tenantId,
      documentId,
      actorType: "user",
      actorId: userId,
      eventType: "document.opened",
      afterState: { documentId, versionId, sourceFormat, conversionJobId },
      occurredAt: new Date().toISOString(),
    });

    return reply.code(201).send({ document, version });
  });

  // ── GET /documents/:id ────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>(
    "/documents/:id",
    async (request, reply) => {
      const { tenantId } = requireTenant(request);

      const document = await prisma.document.findFirst({
        where: { id: request.params.id, tenantId },
        include: { currentVersion: true },
      });

      if (!document) {
        return reply.code(404).send({ error: "document_not_found" });
      }

      return { document, currentVersion: document.currentVersion };
    }
  );

  // ── GET /documents/:id/epub ───────────────────────────────────────────────

  app.get<{ Params: { id: string } }>(
    "/documents/:id/epub",
    async (request, reply) => {
      const { tenantId } = requireTenant(request);

      const document = await prisma.document.findFirst({
        where: { id: request.params.id, tenantId },
        include: { currentVersion: true },
      });

      if (!document?.currentVersion) {
        return reply.code(404).send({ error: "document_not_found" });
      }

      const version = document.currentVersion;

      if (version.conversionStatus !== "COMPLETE") {
        return reply.code(202).send({
          conversionStatus: version.conversionStatus.toLowerCase(),
        });
      }

      if (!version.epubS3Key) {
        return reply.code(503).send({ error: "epub_key_missing" });
      }

      const { url: signedUrl, expiresAt } = await getSignedEpubUrl(
        version.epubS3Key
      );

      return { signedUrl, expiresAt, conversionStatus: "complete" };
    }
  );

  // ── PATCH /documents/:id/content ─────────────────────────────────────────

  app.patch<{
    Params: { id: string };
    Body: { markdown: string };
  }>(
    "/documents/:id/content",
    {
      schema: {
        body: {
          type: "object",
          required: ["markdown"],
          properties: { markdown: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireTenant(request);

      const document = await prisma.document.findFirst({
        where: { id: request.params.id, tenantId },
        include: {
          versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        },
      });

      if (!document) {
        return reply.code(404).send({ error: "document_not_found" });
      }

      const prevVersionNumber = document.versions[0]?.versionNumber ?? 0;
      const newVersionNumber = prevVersionNumber + 1;
      const versionId = randomUUID();
      const filename = "content.md";

      const s3Key = await uploadDocument(
        tenantId,
        document.id,
        newVersionNumber,
        filename,
        Buffer.from(request.body.markdown, "utf-8"),
        "text/markdown"
      );

      await prisma.$transaction(async (tx) => {
        await tx.documentVersion.create({
          data: {
            id: versionId,
            documentId: document.id,
            versionNumber: newVersionNumber,
            sourceS3Key: s3Key,
            conversionStatus: "PENDING",
            createdBy: userId,
          },
        });
        await tx.document.update({
          where: { id: document.id },
          data: { currentVersionId: versionId },
        });
      });

      const conversionJobId = await enqueueConversionJob({
        documentId: document.id,
        versionId,
        s3SourceKey: s3Key,
        sourceFormat: "md",
        tenantId,
      });

      return reply.code(202).send({ versionId, conversionJobId });
    }
  );

  // ── POST /documents/:id/cells ─────────────────────────────────────────────

  app.post<{
    Params: { id: string };
    Body: { sheetName: string; row: number; col: number; value: string | number };
  }>(
    "/documents/:id/cells",
    {
      schema: {
        body: {
          type: "object",
          required: ["sheetName", "row", "col", "value"],
          properties: {
            sheetName: { type: "string" },
            row: { type: "number" },
            col: { type: "number" },
            value: { type: ["string", "number"] },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireTenant(request);

      const document = await prisma.document.findFirst({
        where: { id: request.params.id, tenantId },
        include: {
          currentVersion: true,
          versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        },
      });

      if (!document?.currentVersion) {
        return reply.code(404).send({ error: "document_not_found" });
      }

      const newVersionNumber =
        (document.versions[0]?.versionNumber ?? 0) + 1;
      const versionId = randomUUID();

      // Create version stub; the xlsx-edit worker fills in the S3 key once done
      await prisma.$transaction(async (tx) => {
        await tx.documentVersion.create({
          data: {
            id: versionId,
            documentId: document.id,
            versionNumber: newVersionNumber,
            sourceS3Key: document.currentVersion!.sourceS3Key, // placeholder
            conversionStatus: "PENDING",
            createdBy: userId,
          },
        });
        await tx.document.update({
          where: { id: document.id },
          data: { currentVersionId: versionId },
        });
      });

      const conversionJobId = await enqueueXlsxEditJob({
        documentId: document.id,
        tenantId,
        s3SourceKey: document.currentVersion.sourceS3Key,
        sheetName: request.body.sheetName,
        row: request.body.row,
        col: request.body.col,
        value: request.body.value,
        newVersionId: versionId,
      });

      return reply.code(202).send({ versionId, conversionJobId });
    }
  );

  // ── GET /documents/:id/versions ───────────────────────────────────────────

  app.get<{ Params: { id: string } }>(
    "/documents/:id/versions",
    async (request, reply) => {
      const { tenantId } = requireTenant(request);

      const document = await prisma.document.findFirst({
        where: { id: request.params.id, tenantId },
      });

      if (!document) {
        return reply.code(404).send({ error: "document_not_found" });
      }

      const versions = await prisma.documentVersion.findMany({
        where: { documentId: document.id },
        orderBy: { versionNumber: "asc" },
      });

      return { versions };
    }
  );

  // ── GET /documents/:id/versions/:vId/epub ────────────────────────────────

  app.get<{ Params: { id: string; vId: string } }>(
    "/documents/:id/versions/:vId/epub",
    async (request, reply) => {
      const { tenantId } = requireTenant(request);

      const document = await prisma.document.findFirst({
        where: { id: request.params.id, tenantId },
      });

      if (!document) {
        return reply.code(404).send({ error: "document_not_found" });
      }

      const version = await prisma.documentVersion.findFirst({
        where: { id: request.params.vId, documentId: document.id },
      });

      if (!version?.epubS3Key) {
        return reply.code(404).send({ error: "epub_not_available" });
      }

      const { url: signedUrl, expiresAt } = await getSignedEpubUrl(
        version.epubS3Key
      );

      return { signedUrl, expiresAt };
    }
  );

  // ── POST /documents/:id/approve ───────────────────────────────────────────

  app.post<{
    Params: { id: string };
    Body: { decision: "approved" | "rejected"; comment?: string };
  }>(
    "/documents/:id/approve",
    {
      schema: {
        body: {
          type: "object",
          required: ["decision"],
          properties: {
            decision: { type: "string", enum: ["approved", "rejected"] },
            comment: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireTenant(request);
      const docId = request.params.id;

      const document = await prisma.document.findFirst({
        where: { id: docId, tenantId },
      });

      if (!document) {
        return reply.code(404).send({ error: "document_not_found" });
      }

      // Delegate critical-flag check to the annotation service
      const checkRes = await fetch(
        `${ANNOTATION_SERVICE}/documents/${docId}/check-approval`,
        { headers: { "x-tenant-id": tenantId } }
      );

      if (checkRes.status === 409) {
        const body = await checkRes.json() as { error: string; flagIds: string[] };
        return reply.code(409).send(body);
      }

      const newState =
        request.body.decision === "approved" ? "APPROVED" : "REJECTED";

      const updated = await prisma.document.update({
        where: { id: docId },
        data: { reviewState: newState },
      });

      auditClient.emit({
        id: randomUUID(),
        tenantId,
        documentId: docId,
        actorType: "user",
        actorId: userId,
        eventType: "approval.state_changed",
        beforeState: { reviewState: document.reviewState },
        afterState: {
          reviewState: updated.reviewState,
          decision: request.body.decision,
          comment: request.body.comment,
        },
        occurredAt: new Date().toISOString(),
      });

      return { document: updated };
    }
  );

  // ── PUT /documents/:id/rollback ───────────────────────────────────────────

  app.put<{
    Params: { id: string };
    Body: { versionId: string };
  }>(
    "/documents/:id/rollback",
    {
      schema: {
        body: {
          type: "object",
          required: ["versionId"],
          properties: { versionId: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireTenant(request);
      const docId = request.params.id;

      const document = await prisma.document.findFirst({
        where: { id: docId, tenantId },
      });

      if (!document) {
        return reply.code(404).send({ error: "document_not_found" });
      }

      // Verify the target version belongs to this document (no cross-doc rollback)
      const targetVersion = await prisma.documentVersion.findFirst({
        where: { id: request.body.versionId, documentId: docId },
      });

      if (!targetVersion) {
        return reply.code(404).send({ error: "version_not_found" });
      }

      // Pointer update only — no S3 deletion, no row deletion
      const updated = await prisma.document.update({
        where: { id: docId },
        data: { currentVersionId: targetVersion.id },
      });

      auditClient.emit({
        id: randomUUID(),
        tenantId,
        documentId: docId,
        actorType: "user",
        actorId: userId,
        eventType: "document.rolled_back",
        beforeState: { currentVersionId: document.currentVersionId },
        afterState: { currentVersionId: targetVersion.id },
        occurredAt: new Date().toISOString(),
      });

      return { document: updated };
    }
  );
};
