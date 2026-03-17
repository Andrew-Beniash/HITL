import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../prisma.js";

export const approvalRoutes: FastifyPluginAsync = async (app) => {
  // ── POST /documents/:id/check-approval ────────────────────────────────────
  // Internal endpoint — requires X-Internal-Service: true header

  app.post<{ Params: { id: string } }>(
    "/documents/:id/check-approval",
    async (request, reply) => {
      const internalHeader = request.headers["x-internal-service"];
      if (internalHeader !== "true") {
        return reply.code(403).send({ error: "forbidden" });
      }

      const docId = request.params.id;

      const openCriticalFlags = await prisma.annotation.findMany({
        where: {
          documentId: docId,
          type: "CRITICAL_FLAG",
          status: "OPEN",
        },
        select: { id: true },
      });

      if (openCriticalFlags.length > 0) {
        return reply.code(409).send({
          error: "unresolved_critical_flags",
          flagIds: openCriticalFlags.map((f) => f.id),
        });
      }

      return { approved: true };
    }
  );
};
