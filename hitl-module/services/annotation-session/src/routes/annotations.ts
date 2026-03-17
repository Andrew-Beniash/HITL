import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../prisma.js";
import { auditClient } from "../audit.js";
import { redis } from "../redis.js";
import { getNotificationQueue } from "../queue.js";
import { validateCfi } from "../lib/cfi-validator.js";
import { extractMentions } from "../lib/mention-extractor.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

export const annotationRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /documents/:id/annotations ────────────────────────────────────────

  app.get<{
    Params: { id: string };
    Querystring: {
      status?: string;
      type?: string;
      authorId?: string;
      from?: string;
      to?: string;
    };
  }>("/documents/:id/annotations", async (request, reply) => {
    const { tenantId } = requireTenant(request);
    const docId = request.params.id;

    const document = await prisma.document.findFirst({
      where: { id: docId, tenantId },
    });
    if (!document) {
      return reply.code(404).send({ error: "document_not_found" });
    }

    const { status, type, authorId, from, to } = request.query;

    const where: Record<string, unknown> = { documentId: docId };
    if (status) where.status = status.toUpperCase();
    if (type) where.type = type.toUpperCase();
    if (authorId) where.authorId = authorId;
    if (from ?? to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);
      where.createdAt = dateFilter;
    }

    const [annotations, totalCritical, resolvedCritical] = await Promise.all([
      prisma.annotation.findMany({
        where,
        include: { replies: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.annotation.count({
        where: { documentId: docId, type: "CRITICAL_FLAG" },
      }),
      prisma.annotation.count({
        where: { documentId: docId, type: "CRITICAL_FLAG", status: "RESOLVED" },
      }),
    ]);

    return { annotations, totalCritical, resolvedCritical };
  });

  // ── POST /documents/:id/annotations ───────────────────────────────────────

  app.post<{
    Params: { id: string };
    Body: {
      sessionId: string;
      documentVersionId: string;
      authorId?: string;
      agentId?: string;
      type: string;
      cfi: string;
      cfiText?: string;
      payload: Record<string, unknown>;
    };
  }>(
    "/documents/:id/annotations",
    {
      schema: {
        body: {
          type: "object",
          required: ["sessionId", "documentVersionId", "type", "cfi", "payload"],
          properties: {
            sessionId: { type: "string" },
            documentVersionId: { type: "string" },
            authorId: { type: "string" },
            agentId: { type: "string" },
            type: { type: "string" },
            cfi: { type: "string" },
            cfiText: { type: "string" },
            payload: { type: "object" },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireTenant(request);
      const docId = request.params.id;
      const body = request.body;

      // Validate CFI
      if (!validateCfi(body.cfi)) {
        return reply.code(400).send({ error: "invalid_cfi" });
      }

      const document = await prisma.document.findFirst({
        where: { id: docId, tenantId },
      });
      if (!document) {
        return reply.code(404).send({ error: "document_not_found" });
      }

      const annotation = await prisma.annotation.create({
        data: {
          sessionId: body.sessionId,
          documentId: docId,
          documentVersionId: body.documentVersionId,
          authorId: body.authorId ?? null,
          agentId: body.agentId ?? null,
          type: body.type as never,
          cfi: body.cfi,
          cfiText: body.cfiText ?? null,
          payload: body.payload,
          status: "OPEN" as never,
        },
        include: { replies: true },
      });

      // @mention notification jobs for HUMAN_COMMENT
      if (body.type === "HUMAN_COMMENT") {
        const commentBody = (body.payload as { body?: string }).body ?? "";
        const mentions = extractMentions(commentBody);
        const queue = getNotificationQueue();
        for (const mention of mentions) {
          await queue.add("mention", {
            type: "mention",
            mentionerUserId: body.authorId ?? userId,
            mentionedUsername: mention,
            documentId: docId,
            annotationId: annotation.id,
          });
        }
      }

      // Redis pub/sub
      await redis.publish(
        `hitl:annotation:${docId}`,
        JSON.stringify({ action: "created", annotation })
      );

      auditClient.emit({
        id: randomUUID(),
        tenantId,
        documentId: docId,
        actorType: body.authorId ? "user" : "agent",
        actorId: body.authorId ?? body.agentId ?? userId,
        eventType: "annotation.created",
        afterState: { annotationId: annotation.id, type: body.type, cfi: body.cfi },
        occurredAt: new Date().toISOString(),
      });

      return reply.code(201).send({ annotation });
    }
  );

  // ── PATCH /annotations/:id/resolve ────────────────────────────────────────

  app.patch<{
    Params: { id: string };
    Body: { decision: "resolved" | "rejected"; comment?: string };
  }>(
    "/annotations/:id/resolve",
    {
      schema: {
        body: {
          type: "object",
          required: ["decision"],
          properties: {
            decision: { type: "string", enum: ["resolved", "rejected"] },
            comment: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireTenant(request);
      const annotationId = request.params.id;
      const { decision, comment } = request.body;

      const existing = await prisma.annotation.findFirst({
        where: { id: annotationId },
        include: { session: true },
      });
      if (!existing) {
        return reply.code(404).send({ error: "annotation_not_found" });
      }

      // Tenant isolation check via session
      if (existing.session.tenantId !== tenantId) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const beforeState = { status: existing.status };
      const newStatus = decision === "resolved" ? "RESOLVED" : "REJECTED";

      const [updatedAnnotation] = await prisma.$transaction(async (tx) => {
        const updated = await tx.annotation.update({
          where: { id: annotationId },
          data: {
            status: newStatus as never,
            resolvedById: userId,
            resolvedAt: new Date(),
          },
          include: { replies: true },
        });

        if (comment) {
          await tx.annotationReply.create({
            data: {
              annotationId,
              authorId: userId,
              body: comment,
            },
          });
        }

        return [updated] as const;
      });

      // Redis pub/sub
      await redis.publish(
        `hitl:annotation:${existing.documentId}`,
        JSON.stringify({ action: "resolved", annotationId, decision })
      );

      auditClient.emit({
        id: randomUUID(),
        tenantId,
        documentId: existing.documentId,
        actorType: "user",
        actorId: userId,
        eventType: `annotation.${decision}`,
        beforeState,
        afterState: { status: newStatus, resolvedById: userId, comment },
        occurredAt: new Date().toISOString(),
      });

      return { annotation: updatedAnnotation };
    }
  );

  // ── POST /annotations/:id/replies ─────────────────────────────────────────

  app.post<{
    Params: { id: string };
    Body: { body: string };
  }>(
    "/annotations/:id/replies",
    {
      schema: {
        body: {
          type: "object",
          required: ["body"],
          properties: { body: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireTenant(request);
      const annotationId = request.params.id;

      const annotation = await prisma.annotation.findFirst({
        where: { id: annotationId },
        include: { session: true },
      });
      if (!annotation) {
        return reply.code(404).send({ error: "annotation_not_found" });
      }
      if (annotation.session.tenantId !== tenantId) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const reply_ = await prisma.annotationReply.create({
        data: {
          annotationId,
          authorId: userId,
          body: request.body.body,
        },
      });

      // Enqueue mention notifications
      const mentions = extractMentions(request.body.body);
      if (mentions.length > 0) {
        const queue = getNotificationQueue();
        for (const mention of mentions) {
          await queue.add("mention", {
            type: "mention",
            mentionerUserId: userId,
            mentionedUsername: mention,
            documentId: annotation.documentId,
            annotationId,
          });
        }
      }

      return reply.code(201).send({ reply: reply_ });
    }
  );
};
