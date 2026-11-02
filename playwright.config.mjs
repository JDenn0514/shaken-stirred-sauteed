// Browser tests (tests/e2e). Runs the installed Google Chrome, which keeps
// itself up to date, rather than a Chromium build bundled with Playwright.
import { defineConfig } from "@playwright/test";

const PORT = 8123;

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}/`,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  // The same static server as local development, on its own port.
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    stderr: "ignore", // python logs every request here
  },
});
