import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import { notificationRoutes } from "./routes/notifications.js";

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(fjwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret",
  });

  app.decorateRequest("userId", undefined);
  app.decorateRequest("tenantId", undefined);

  app.addHook("preHandler", async (request) => {
    try {
      const decoded = await request.jwtVerify<{
        userId?: string;
        sub?: string;
        tenantId?: string;
      }>();
      (request as typeof request & { userId: string; tenantId: string }).userId =
        decoded.userId ?? decoded.sub ?? "unknown";
      (request as typeof request & { userId: string; tenantId: string }).tenantId =
        decoded.tenantId ?? "unknown";
    } catch {
      // userId stays undefined — routes enforce auth via userId check
    }
  });

  app.get("/health", async () => ({ service: "notification", status: "ok" }));

  await app.register(notificationRoutes);

  return app;
}
