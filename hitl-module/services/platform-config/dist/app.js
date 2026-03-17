import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import { fontProfilesRoutes } from "./routes/font-profiles.js";
export function buildServer() {
    const app = Fastify({ logger: true });
    app.register(fastifyJwt, {
        secret: process.env.JWT_SECRET ?? "development-secret"
    });
    app.decorateRequest("userId", undefined);
    app.decorateRequest("tenantId", undefined);
    app.addHook("preHandler", async (request) => {
        try {
            await request.jwtVerify();
            const claims = request.user;
            request.userId = claims.sub;
            request.tenantId = claims.tid;
        }
        catch {
            request.tenantId =
                request.headers["x-tenant-id"]?.toString() ?? request.tenantId;
            request.userId = request.headers["x-user-id"]?.toString() ?? request.userId;
        }
        request.tenantId =
            request.tenantId ?? request.headers["x-tenant-id"]?.toString();
    });
    app.get("/health", async () => ({ status: "ok" }));
    app.register(fontProfilesRoutes);
    return app;
}
//# sourceMappingURL=app.js.map