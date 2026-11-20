// The Worker's tests (npm test in worker/, or npm run test:worker at the repo
// root). They run in Cloudflare's real Workers runtime with a local D1 database
// made from migrations/, a fake GitHub (test/fake-github.js) and fake outside
// websites for /api/fetch (test/fake-sites.js): nothing leaves this computer.
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { fakeGitHub } from "./test/fake-github.js";
import { fakeSites } from "./test/fake-sites.js";

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "../wrangler.jsonc" },
      miniflare: {
        // Stand-ins for the secrets set in Cloudflare's dashboard.
        bindings: {
          GITHUB_CLIENT_ID: "test-client-id",
          GITHUB_CLIENT_SECRET: "test-client-secret",
          BETTER_AUTH_SECRET: "a-test-secret-that-is-long-enough-for-better-auth",
          MIGRATIONS: await readD1Migrations("migrations"),
          // Replays the access laws' random requests (test/access-laws.test.js).
          ACCESS_SEED: process.env.ACCESS_SEED ?? "",
          // Every fake GitHub person may sign in but "stranger" and "impostor" (fake-github.js).
          ALLOWED_GITHUB_IDS: "1,2,3,4,5,6,7,8,9,12,14",
        },
        // Every request the Worker makes to anywhere goes here instead.
        outboundService: (request) => (/(^|\.)github\.com$|^fake-github\.test$/.test(new URL(request.url).hostname) ? fakeGitHub(request) : fakeSites(request)),
      },
    }),
  ],
  test: { setupFiles: ["./test/setup.js"] },
}));
