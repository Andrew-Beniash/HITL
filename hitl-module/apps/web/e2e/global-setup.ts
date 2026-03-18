import { request } from "@playwright/test";
import path from "path";
import fs from "fs/promises";

const API_BASE = process.env.E2E_API_BASE ?? "http://localhost:3001";
const STORAGE_DIR = path.resolve("e2e/.auth");

async function globalSetup() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });

  const ctx = await request.newContext({ baseURL: API_BASE });

  // Seed test tenant + users via the test-only endpoint on document-storage service
  const seedRes = await ctx.post("/auth/seed-test-data");
  if (!seedRes.ok()) {
    throw new Error(
      `Seed endpoint failed: ${seedRes.status()} ${await seedRes.text()}`
    );
  }

  const { reviewerToken, adminToken } = await seedRes.json() as {
    reviewerToken: string;
    adminToken: string;
  };

  process.env.TEST_REVIEWER_TOKEN = reviewerToken;
  process.env.TEST_ADMIN_TOKEN = adminToken;

  // Persist storage states so individual tests can reuse browser sessions
  const reviewerCtx = await request.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    extraHTTPHeaders: { Authorization: `Bearer ${reviewerToken}` },
  });
  await reviewerCtx.storageState({
    path: path.join(STORAGE_DIR, "reviewer.json"),
  });
  await reviewerCtx.dispose();

  const adminCtx = await request.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
  });
  await adminCtx.storageState({
    path: path.join(STORAGE_DIR, "admin.json"),
  });
  await adminCtx.dispose();

  await ctx.dispose();
}

export default globalSetup;
