import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    launchOptions: executablePath ? { executablePath } : {},
    acceptDownloads: true,
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
  ],
  webServer: [
    { command: "node e2e/mock-apify.mjs", port: 4010, reuseExistingServer: true },
    {
      command: "npx next start -p 3100",
      port: 3100,
      reuseExistingServer: true,
      env: { APIFY_API_TOKEN: "", NEXALEADS_DEMO_MODE: "true", NEXALEADS_PASSWORD: "senha-de-teste-123" },
    },
    {
      command: "npx next start -p 3101",
      port: 3101,
      reuseExistingServer: true,
      env: { APIFY_API_TOKEN: "test-token", APIFY_ACTOR_ID: "compass/crawler-google-places", APIFY_API_BASE_URL: "http://localhost:4010", APIFY_MAX_LEADS: "50", NEXALEADS_PASSWORD: "senha-de-teste-123" },
    },
    {
      command: "npx next start -p 3102",
      port: 3102,
      reuseExistingServer: true,
      env: {
        APIFY_API_TOKEN: "test-token",
        APIFY_ACTOR_ID: "compass/crawler-google-places",
        APIFY_API_BASE_URL: "http://localhost:4010",
        GOOGLE_MAPS_API_KEY: "test-google-key",
        GOOGLE_PLACES_BASE_URL: "http://localhost:4010",
        APIFY_MAX_LEADS: "50",
        NEXALEADS_PASSWORD: "senha-de-teste-123",
      },
    },
  ],
});
