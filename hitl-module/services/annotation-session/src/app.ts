import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import { sessionRoutes } from "./routes/sessions.js";
import { annotationRoutes } from "./routes/annotations.js";
import { approvalRoutes } from "./routes/approval.js";

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
  app.addHook("preHandler", async (request) => {
    // Internal endpoints (check-approval) skip JWT auth
    const internalHeader = request.headers["x-internal-service"];
    if (internalHeader === "true") return;

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
      // tenantId stays undefined — routes will throw 401 via requireTenant()
    }
  });

  // ── Health ────────────────────────────────────────────────────────────────
  app.get("/health", async () => ({ service: "annotation-session", status: "ok" }));

  // ── Routes ────────────────────────────────────────────────────────────────
  await app.register(sessionRoutes);
  await app.register(annotationRoutes);
  await app.register(approvalRoutes);

  return app;
}
