import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

// Serialize a raw DB row: convert BigInt id → string, Date occurredAt → ISO string
function serializeEvent(e: {
  id: bigint;
  occurredAt: Date;
  [key: string]: unknown;
}) {
  return {
    ...e,
    id: e.id.toString(),
    occurredAt: e.occurredAt.toISOString(),
  };
}

export const eventRoutes: FastifyPluginAsync = async (app) => {
  // ── POST /audit/events (INTERNAL ONLY) ────────────────────────────────────

  app.post<{
    Body: {
      tenantId: string;
      documentId?: string;
      sessionId?: string;
      actorType: "user" | "agent" | "system";
      actorId: string;
      eventType: string;
      scope?: Record<string, unknown>;
      beforeState?: Record<string, unknown>;
      afterState?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    };
  }>(
    "/audit/events",
    {
      schema: {
        body: {
          type: "object",
          required: ["tenantId", "actorType", "actorId", "eventType"],
          properties: {
            tenantId: { type: "string" },
            documentId: { type: "string" },
            sessionId: { type: "string" },
            actorType: { type: "string", enum: ["user", "agent", "system"] },
            actorId: { type: "string" },
            eventType: { type: "string" },
            scope: { type: "object" },
            beforeState: { type: "object" },
            afterState: { type: "object" },
            metadata: { type: "object" },
          },
        },
      },
    },
    async (request, reply) => {
      if (request.headers["x-internal-service"] !== "true") {
        return reply.code(403).send({ error: "forbidden" });
      }

      const body = request.body;

      await prisma.auditEvent.create({
        data: {
          tenantId: body.tenantId,
          documentId: body.documentId ?? null,
          sessionId: body.sessionId ?? null,
          actorType: body.actorType,
          actorId: body.actorId,
          eventType: body.eventType,
          scope: body.scope ?? undefined,
          beforeState: body.beforeState ?? undefined,
          afterState: body.afterState ?? undefined,
          metadata: body.metadata ?? undefined,
        },
      });

      return reply.code(204).send();
    }
  );

  // ── GET /audit/events ─────────────────────────────────────────────────────

  app.get<{
    Querystring: {
      documentId?: string;
      sessionId?: string;
      actorId?: string;
      eventType?: string;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: string;
    };
  }>("/audit/events", async (request, reply) => {
    const requestWithAuth = request as typeof request & {
      tenantId?: string;
    };

    if (!requestWithAuth.tenantId) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const tenantId = requestWithAuth.tenantId;
    const q = request.query;

    const rawLimit = Math.min(parseInt(q.limit ?? "50", 10), 500);
    const limit = isNaN(rawLimit) || rawLimit <= 0 ? 50 : rawLimit;

    // Build WHERE clause
    const where: Record<string, unknown> = { tenantId };
    if (q.documentId) where.documentId = q.documentId;
    if (q.sessionId) where.sessionId = q.sessionId;
    if (q.actorId) where.actorId = q.actorId;
    if (q.eventType) where.eventType = q.eventType;

    if (q.from ?? q.to) {
      const dateFilter: Record<string, Date> = {};
      if (q.from) dateFilter.gte = new Date(q.from);
      if (q.to) dateFilter.lte = new Date(q.to);
      where.occurredAt = dateFilter;
    }

    // Keyset pagination: WHERE id > cursor ORDER BY id ASC LIMIT limit+1
    if (q.cursor) {
      where.id = { gt: BigInt(q.cursor) };
    }

    const rawEvents = await prisma.auditEvent.findMany({
      where: where as Parameters<typeof prisma.auditEvent.findMany>[0]["where"],
      orderBy: { id: "asc" },
      take: limit + 1,
    });

    const hasMore = rawEvents.length > limit;
    const page = rawEvents.slice(0, limit);
    const events = page.map(serializeEvent);
    const nextCursor = hasMore ? page[page.length - 1].id.toString() : undefined;

    return { events, ...(nextCursor ? { nextCursor } : {}) };
  });
};
