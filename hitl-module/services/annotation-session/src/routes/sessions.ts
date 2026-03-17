import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../prisma.js";
import { auditClient } from "../audit.js";

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  // ── POST /sessions ─────────────────────────────────────────────────────────

  app.post<{
    Body: { documentId: string; kbConnectionId?: string };
  }>(
    "/sessions",
    {
      schema: {
        body: {
          type: "object",
          required: ["documentId"],
          properties: {
            documentId: { type: "string" },
            kbConnectionId: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireTenant(request);
      const { documentId, kbConnectionId } = request.body;

      const session = await prisma.session.create({
        data: {
          documentId,
          tenantId,
          userId,
          ...(kbConnectionId ? { kbConnectionId } : {}),
        },
      });

      auditClient.emit({
        id: randomUUID(),
        tenantId,
        documentId,
        sessionId: session.id,
        actorType: "user",
        actorId: userId,
        eventType: "document.opened",
        afterState: { sessionId: session.id, documentId },
        occurredAt: new Date().toISOString(),
      });

      return reply.code(201).send({ session });
    }
  );

  // ── GET /sessions/:id ──────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>(
    "/sessions/:id",
    async (request, reply) => {
      const { tenantId } = requireTenant(request);

      const session = await prisma.session.findFirst({
        where: { id: request.params.id, tenantId },
        include: { document: true },
      });

      if (!session) {
        return reply.code(404).send({ error: "session_not_found" });
      }

      return { session, document: session.document };
    }
  );
};

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
