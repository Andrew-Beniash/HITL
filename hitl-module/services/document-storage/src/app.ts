import Fastify, { type FastifyInstance } from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import { documentRoutes } from "./routes/documents.js";

type JwtClaims = {
  sub?: string;
  tid?: string;
};

export function buildServer(opts?: { logger?: boolean }): FastifyInstance {
  const app = Fastify({
    logger: opts?.logger ?? true,
  });

  app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET ?? "development-secret",
  });

  app.register(fastifyMultipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500 MB
    },
  });

  app.decorateRequest("userId", undefined);
  app.decorateRequest("tenantId", undefined);

  // JWT verification with X-Tenant-ID fallback (same pattern as platform-config)
  app.addHook("preHandler", async (request) => {
    try {
      await request.jwtVerify<JwtClaims>();
      const claims = request.user as JwtClaims;
      request.userId = claims.sub;
      request.tenantId = claims.tid;
    } catch {
      /* JWT absent or invalid — fall through to header fallback */
    }

    // API Gateway always injects X-Tenant-ID; use as authoritative fallback
    if (!request.tenantId) {
      request.tenantId = request.headers["x-tenant-id"]?.toString();
    }
    if (!request.userId) {
      request.userId = request.headers["x-user-id"]?.toString();
    }
  });

  app.get("/health", async () => ({
    service: "document-storage",
    status: "ok",
  }));

  app.register(documentRoutes);

  return app;
}
