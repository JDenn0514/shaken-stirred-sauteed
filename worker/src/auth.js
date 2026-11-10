// Sign-in with GitHub, run by Better Auth (docs/specs/recipe-editor-design.md,
// "Signing in"). Its tables are in the D1 database (worker/migrations).
import { betterAuth } from "better-auth";

// A secret as typed or pasted into Cloudflare's dashboard, without the spaces
// or invisible characters that can come with it: zero-width space, zero-width
// non-joiner and joiner, word joiner, and byte-order mark.
const clean = (value) => value?.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();

// Better Auth's settings. Also used by worker/scripts/auth-schema.mjs, which
// writes the SQL for the tables these settings need.
export function authOptions(env, database = env.DB) {
  return {
    appName: "Shaken, Stirred & Sautéed",
    // Sign-in only works on the real domain: GitHub sends you back to the
    // callback URL set in the GitHub App, which is on this address. Branch
    // previews can't sign in.
    baseURL: env.SITE_URL,
    basePath: "/api/auth",
    secret: clean(env.BETTER_AUTH_SECRET),
    database,
    socialProviders: {
      github: {
        clientId: clean(env.GITHUB_CLIENT_ID),
        clientSecret: clean(env.GITHUB_CLIENT_SECRET),
        // A GitHub App ignores scopes: its permissions are set on the app.
        disableDefaultScope: true,
      },
    },
    // The GitHub token can commit to the repo, so it's encrypted in D1.
    account: { encryptOAuthTokens: true },
    // Signed in for 30 days from the last visit (Better Auth renews it once a
    // day of use). GitHub's own token lasts 8 hours and is renewed by Better
    // Auth with its refresh token, which lasts 6 months.
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    advanced: {
      useSecureCookies: true,
      defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: "lax" },
    },
    telemetry: { enabled: false },
  };
}

// One Better Auth per Worker instance: its settings don't change between
// requests. forgetAuth() drops it after an error, so a failed start (the
// database out of reach, or its tables not made yet) is retried on the next
// request rather than kept until Cloudflare restarts the Worker.
let auth;
export const getAuth = (env) => (auth ??= betterAuth(authOptions(env)));
export const forgetAuth = () => { auth = undefined; };
