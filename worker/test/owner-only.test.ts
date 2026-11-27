// Only the GitHub accounts in ALLOWED_GITHUB_IDS (wrangler.jsonc) can sign in:
// today just the site's owner, until the multi-user project opens it up
// (docs/specs/multi-user-security.md). Anyone else is turned away at GitHub's
// way back, with nothing of theirs kept, and a session from before the list
// changed stops working, its rows deleted.
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { forgetAuth } from "../src/auth.ts";
import worker from "../src/index.ts";
import { SITE, sessionCookie, signIn } from "./browser.ts";

const rowsFor = async (email: string) => ({
  users: (await env.DB.prepare(`select "id" from "user" where "email" = ?`).bind(email).all()).results.length,
  accounts: (await env.DB.prepare(`select a."id" from "account" a join "user" u on u."id" = a."userId" where u."email" = ?`).bind(email).all()).results.length,
  sessions: (await env.DB.prepare(`select s."id" from "session" s join "user" u on u."id" = s."userId" where u."email" = ?`).bind(email).all()).results.length,
});
const NONE = { users: 0, accounts: 0, sessions: 0 };

describe("an account that isn't on the list", () => {
  it("is turned away at GitHub's way back, with no session and nothing kept", async () => {
    const { b, back } = await signIn("stranger");
    expect(back.status).toBe(302);
    const to = new URL(back.headers.get("Location")!, SITE);
    expect(to.pathname).toBe("/api/auth/error");
    expect(to.searchParams.get("error")).toBe("not_open_yet");
    expect(sessionCookie(back)?.value || "").toBe("");
    expect(b.jar.has("signed-in")).toBe(false);
    expect([...b.jar.keys()].some((k) => k.endsWith("session_token"))).toBe(false);
    expect(await rowsFor("stranger@example.com")).toEqual(NONE);
  });

  it("can't use the API", async () => {
    const { b } = await signIn("stranger");
    expect((await b.fetch("/api/me")).status).toBe(401);
    expect((await b.fetch("/api/fetch", { method: "POST", body: JSON.stringify({ url: "https://example.com/" }) })).status).toBe(401);
  });
});

// Found by review: Better Auth links a new GitHub account to an existing user
// with the same verified email, so a stranger who verified the owner's old
// address on GitHub became the owner's user, and the check above then deleted
// the owner's rows.
describe("an account with a listed user's email", () => {
  it("is turned away, and the listed user's rows are untouched", async () => {
    const { b: owner } = await signIn("linked");
    expect(await rowsFor("linked@example.com")).toEqual({ users: 1, accounts: 1, sessions: 1 });

    const { back } = await signIn("impostor");
    expect(new URL(back.headers.get("Location")!, SITE).pathname).toBe("/api/auth/error");
    expect(sessionCookie(back)?.value || "").toBe("");
    expect(await rowsFor("linked@example.com")).toEqual({ users: 1, accounts: 1, sessions: 1 });
    expect((await owner.fetch("/api/me")).status).toBe(200);
  });
});

describe("an account taken off the list", () => {
  it("is signed out on its next request, and its rows are deleted", async () => {
    const { b } = await signIn("former");
    expect((await b.fetch("/api/me")).status).toBe(200);
    expect(await rowsFor("former@example.com")).toEqual({ users: 1, accounts: 1, sessions: 1 });

    const cookie = [...b.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await worker.fetch(new Request(`${SITE}/api/me`, { headers: { Cookie: cookie } }), { ...env, ALLOWED_GITHUB_IDS: "1" });
    expect(res.status).toBe(401);
    expect((await res.json<any>()).error).toMatch(/only open to its owner/i);
    expect(await rowsFor("former@example.com")).toEqual(NONE);
  });
});

describe("an account on the list", () => {
  it("signs in as before", async () => {
    const { b, back } = await signIn("jacob");
    expect(new URL(back.headers.get("Location")!, SITE).pathname).toBe("/recipe.html");
    expect((await b.fetch("/api/me")).status).toBe(200);
  });
});

describe("the secret", () => {
  for (const [what, secret] of [["missing", undefined], ["empty", ""], ["only invisible characters", " ​ "], ["short", "too-short"]] as const) {
    it(`when it's ${what}, sign-in refuses to start rather than use a default`, async () => {
      forgetAuth();
      try {
        const res = await worker.fetch(new Request(`${SITE}/api/signin?return=/`), { ...env, BETTER_AUTH_SECRET: secret } as Env);
        expect(res.status).toBe(500);
        expect(res.headers.get("Location")).toBeNull();
      } finally {
        forgetAuth();
      }
    });
  }
});
