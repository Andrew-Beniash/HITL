import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import { eventRoutes } from "./routes/events.js";
import { exportRoutes } from "./routes/export.js";

export async function buildServer() {
  const app = Fastify({ logger: true });

  // ── JWT ───────────────────────────────────────────────────────────────────
  await app.register(fjwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret",
  });

  // ── Request decorators ────────────────────────────────────────────────────
  app.decorateRequest("tenantId", undefined);
  app.decorateRequest("userId", undefined);

  // ── Auth preHandler ───────────────────────────────────────────────────────
  // Internal endpoints (POST /audit/events) validate via X-Internal-Service header,
  // not JWT, so we skip JWT for those in their own handler.
  app.addHook("preHandler", async (request) => {
    if (request.headers["x-internal-service"] === "true") return;

    try {
      const decoded = await request.jwtVerify<{
        tenantId: string;
        userId?: string;
        sub?: string;
      }>();
      (request as typeof request & { tenantId: string; userId: string }).tenantId =
        decoded.tenantId;
      (request as typeof request & { tenantId: string; userId: string }).userId =
        decoded.userId ?? decoded.sub ?? "unknown";
    } catch {
      // tenantId stays undefined — routes enforce auth via tenantId check
    }
  });

  // ── Health ────────────────────────────────────────────────────────────────
  app.get("/health", async () => ({ service: "audit-trail", status: "ok" }));

  // ── Routes ────────────────────────────────────────────────────────────────
  await app.register(eventRoutes);
  await app.register(exportRoutes);

  return app;
}
