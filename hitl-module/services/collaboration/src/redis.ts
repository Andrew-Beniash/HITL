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

// Minimal Redis interface satisfied by ioredis.Redis and test MockRedis
export interface IRedis {
  get(key: string): Promise<string | null>;
  setex(key: string, ttl: number, value: string): Promise<string | "OK">;
  hset(key: string, field: string, value: string): Promise<number | "OK">;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  hdel(key: string, ...fields: string[]): Promise<number>;
  expire(key: string, ttl: number): Promise<number>;
}

export const redis: IRedis = new Redis(parseRedisUrl(REDIS_URL));

export function createRedisSubscriber() {
  return new Redis(parseRedisUrl(REDIS_URL));
}
