import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import { Server } from "socket.io";
import type { IRedis } from "./redis.js";
import { presenceHandler } from "./presence.js";

export interface BuildServerOptions {
  /** Inject a mock Redis for testing; defaults to the shared production client */
  redis?: IRedis;
}

export async function buildServer(opts: BuildServerOptions = {}) {
  // ── HTTP server (Fastify) ─────────────────────────────────────────────────
  const app = Fastify({ logger: true });

  await app.register(fjwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret",
  });

  app.get("/health", async () => ({
    service: "collaboration",
    status: "ok",
    connections: io.engine.clientsCount,
  }));

  // ── Socket.IO (attached to Fastify's underlying http.Server) ─────────────
  const io = new Server(app.server, {
    cors: { origin: "*" },
  });

  const redisClient: IRedis =
    opts.redis ??
    (await import("./redis.js").then((m) => m.redis));

  // ── JWT middleware ────────────────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error("unauthorized: missing token"));

    try {
      const decoded = app.jwt.verify<{
        userId?: string;
        sub?: string;
        tenantId: string;
      }>(token);
      const data = socket.data as Record<string, string>;
      data.userId = decoded.userId ?? decoded.sub ?? "unknown";
      data.tenantId = decoded.tenantId;
      next();
    } catch {
      next(new Error("unauthorized: invalid token"));
    }
  });

  // ── Connection handler ────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    presenceHandler(socket, io, redisClient);
  });

  return { app, io };
}
