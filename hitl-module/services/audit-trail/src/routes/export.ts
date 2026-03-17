import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { getExportQueue } from "../queue.js";
import { redis } from "../redis.js";

export const exportRoutes: FastifyPluginAsync = async (app) => {
  // ── POST /audit/export ────────────────────────────────────────────────────

  app.post<{
    Body: {
      documentId?: string;
      from: string;
      to: string;
      format: "csv" | "json";
    };
  }>(
    "/audit/export",
    {
      schema: {
        body: {
          type: "object",
          required: ["from", "to", "format"],
          properties: {
            documentId: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
            format: { type: "string", enum: ["csv", "json"] },
          },
        },
      },
    },
    async (request, reply) => {
      const requestWithAuth = request as typeof request & {
        tenantId?: string;
      };

      if (!requestWithAuth.tenantId) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const tenantId = requestWithAuth.tenantId;
      const { documentId, from, to, format } = request.body;
      const jobId = randomUUID();

      const queue = getExportQueue();
      await queue.add("export", {
        jobId,
        tenantId,
        documentId,
        from,
        to,
        format,
      });

      return reply.code(202).send({ jobId });
    }
  );

  // ── GET /audit/export/:jobId ──────────────────────────────────────────────

  app.get<{ Params: { jobId: string } }>(
    "/audit/export/:jobId",
    async (request, reply) => {
      const requestWithAuth = request as typeof request & {
        tenantId?: string;
      };

      if (!requestWithAuth.tenantId) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const { jobId } = request.params;
      const raw = await redis.get(`audit:export:${jobId}`);

      if (!raw) {
        return { status: "pending" };
      }

      const data = JSON.parse(raw) as {
        status: "pending" | "ready";
        downloadUrl?: string;
      };
      return { status: data.status, ...(data.downloadUrl ? { downloadUrl: data.downloadUrl } : {}) };
    }
  );
};
