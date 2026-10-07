import { defineConfig, devices } from "@playwright/test";

process.env.DATABASE_POOL_SIZE = "1";
process.env.DATABASE_POOL_MAX_USES = "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { grep: /mobile .*touch|mobile sweep controls/i, name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
  },
});
