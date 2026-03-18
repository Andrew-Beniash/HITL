import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: true,
  workers: 4,
  retries: isCI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },

  reporter: isCI
    ? [["html", { outputFolder: "playwright-report" }], ["github"]]
    : [["list"]],

  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: isCI ? "on-first-retry" : "off",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
