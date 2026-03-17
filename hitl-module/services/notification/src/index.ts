import { buildServer } from "./app.js";
import { startNotificationWorker } from "./workers/notification.worker.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const port = Number(process.env.PORT ?? 3007);

function parseRedisUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname || "localhost",
    port: u.port ? parseInt(u.port, 10) : 6379,
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    maxRetriesPerRequest: null as null,
  };
}

// Start BullMQ worker (concurrency 5, attempts 3, exponential backoff)
startNotificationWorker(parseRedisUrl(REDIS_URL));

buildServer().then((app) => {
  app.listen({ host: "0.0.0.0", port }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
});
