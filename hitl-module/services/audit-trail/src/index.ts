import { buildServer } from "./app.js";
import { startExportWorker } from "./workers/export.worker.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const port = Number(process.env.PORT ?? 3006);

function parseRedisUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname || "localhost",
    port: u.port ? parseInt(u.port, 10) : 6379,
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    maxRetriesPerRequest: null as null,
  };
}

// Start background export worker
startExportWorker(parseRedisUrl(REDIS_URL));

buildServer().then((app) => {
  app.listen({ host: "0.0.0.0", port }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
});
