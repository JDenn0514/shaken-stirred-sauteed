// Browser tests (tests/e2e). Every test can run twice: in the installed Google
// Chrome, which keeps itself up to date, rather than a Chromium build bundled
// with Playwright; and in Playwright's WebKit, the engine behind Safari and
// every browser on an iPhone (install it once with `npx playwright install webkit`).
// CI runs both. Locally, `npm test` runs Chrome only, to halve the wait;
// `npm run test:all` runs both, like CI.
import { defineConfig } from "@playwright/test";

const PORT = 8123;

export default defineConfig({
  testDir: "tests/e2e",
  // Lets CI split the tests evenly across machines (--shard), test by test
  // rather than file by file.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chrome", use: { browserName: "chromium", channel: "chrome" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: `node tests/helpers/serve.mjs ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
