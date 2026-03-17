import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../prisma.js";

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /notifications/unread ─────────────────────────────────────────────

  app.get("/notifications/unread", async (request, reply) => {
    const { userId } = request as typeof request & { userId?: string };
    if (!userId) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId, read: false },
      orderBy: { createdAt: "desc" },
    });

    return { notifications };
  });

  // ── POST /notifications/:id/read ──────────────────────────────────────────

  app.post<{ Params: { id: string } }>(
    "/notifications/:id/read",
    async (request, reply) => {
      const { userId } = request as typeof request & { userId?: string };
      if (!userId) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const { id } = request.params;

      const result = await prisma.notification.updateMany({
        where: { id, userId },
        data: { read: true },
      });

      if (result.count === 0) {
        return reply.code(404).send({ error: "notification_not_found" });
      }

      return reply.code(204).send();
    }
  );
};
