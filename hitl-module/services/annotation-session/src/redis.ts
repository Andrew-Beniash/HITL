import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

function parseRedisUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname || "localhost",
    port: u.port ? parseInt(u.port, 10) : 6379,
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    maxRetriesPerRequest: null as null,
    lazyConnect: true,
  };
}

export const redis = new Redis(parseRedisUrl(REDIS_URL));
