// Sign-in with GitHub, run by Better Auth (docs/specs/recipe-editor-design.md,
// "Signing in"). Its tables are in the D1 database (worker/migrations).
import { betterAuth, type BetterAuthOptions } from "better-auth";

// A secret as typed or pasted into Cloudflare's dashboard, without the spaces
// or invisible characters that can come with it: zero-width space, zero-width
// non-joiner and joiner, word joiner, and byte-order mark.
const clean = <T extends string | undefined>(value: T) => value?.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim() as T;

// The settings Better Auth needs; worker/scripts/auth-schema.mjs passes only these.
type AuthEnv = Pick<Env, "SITE_URL" | "BETTER_AUTH_SECRET" | "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET"> & { DB?: D1Database };
export type Auth = ReturnType<typeof betterAuth<ReturnType<typeof authOptions>>>;

// Better Auth's settings. Also used by worker/scripts/auth-schema.mjs, which
// writes the SQL for the tables these settings need.
export function authOptions(env: AuthEnv, database: BetterAuthOptions["database"] = env.DB) {
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
    // The GitHub token can commit to the repo, so it's encrypted in D1. No
    // linking: Better Auth would otherwise attach a new GitHub account to an
    // existing user with the same verified email, so whoever verified the
    // owner's old address on GitHub would become the owner's user.
    account: { encryptOAuthTokens: true, accountLinking: { enabled: false } },
    // Signed in for 30 days from the last visit (Better Auth renews it once a
    // day of use). GitHub's own token lasts 8 hours and is renewed by Better
    // Auth with its refresh token, which lasts 6 months.
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    advanced: {
      useSecureCookies: true,
      defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: "lax" },
    },
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions;
}

// One Better Auth per Worker instance: its settings don't change between
// requests. forgetAuth() drops it after an error, so a failed start (the
// database out of reach, or its tables not made yet) is retried on the next
// request rather than kept until Cloudflare restarts the Worker.
let auth: Auth | undefined;
export function getAuth(env: Env) {
  // Better Auth would quietly use a public default without one (it only
  // refuses when NODE_ENV is "production", which Workers don't set), and the
  // secret is what encrypts the GitHub tokens: no secret, no sign-in.
  if ((clean(env.BETTER_AUTH_SECRET) ?? "").length < 32) throw new Error("BETTER_AUTH_SECRET is missing or shorter than 32 characters");
  return (auth ??= betterAuth(authOptions(env)));
}
export const forgetAuth = () => { auth = undefined; };

// Who may sign in: the GitHub accounts in ALLOWED_GITHUB_IDS (wrangler.jsonc),
// by GitHub's account ID. Today only the site's owner, until the multi-user
// project opens it up (docs/specs/multi-user-security.md).
export async function isAllowed(env: Env, userId: string) {
  const ids = new Set(String(env.ALLOWED_GITHUB_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const { results } = await env.DB.prepare(`select "accountId" from "account" where "userId" = ? and "providerId" = 'github'`).bind(userId).all<{ accountId: string }>();
  return results.length > 0 && results.every((a) => ids.has(String(a.accountId)));
}

// Deletes everything kept for a person: their sessions, their GitHub account
// (with its tokens) and the user itself.
export async function removeUser(env: Env, userId: string) {
  await env.DB.batch([
    env.DB.prepare(`delete from "session" where "userId" = ?`).bind(userId),
    env.DB.prepare(`delete from "account" where "userId" = ?`).bind(userId),
    env.DB.prepare(`delete from "user" where "id" = ?`).bind(userId),
  ]);
}
