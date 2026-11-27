// What the Worker's env holds beyond wrangler.jsonc, which `wrangler types`
// reads into worker-configuration.d.ts.
interface MoreEnv {
  // Secrets, set in Cloudflare's dashboard (wrangler.jsonc).
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  // Set only by the tests, to wait less than 10 seconds for a slow site.
  FETCH_TIMEOUT_MS?: string;
}
interface Env extends MoreEnv {}
declare namespace Cloudflare {
  interface Env extends MoreEnv {}
}
