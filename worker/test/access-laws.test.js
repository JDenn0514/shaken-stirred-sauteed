// Laws for the Worker's /api/: rules about who can do what that hold for every
// request, not just the examples in api.test.js and save.test.js. fast-check
// makes the requests at random; when one breaks a law, it shrinks it to the
// smallest one that still does and prints it, with the seed. Each run picks a
// new seed, shown in the test group's name: ACCESS_SEED=<seed> npm run
// test:worker runs the same requests again.
import { env } from "cloudflare:test";
import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { browser, signIn } from "./browser.js";

// The Worker's code, as text.
const SOURCES = import.meta.glob("../src/*.js", { query: "?raw", import: "default", eager: true });

const RUNS = 300;
const seed = Number(env.ACCESS_SEED) || Date.now() % 2 ** 31;
const opts = { numRuns: RUNS, seed };

// A piece of a path: one of the Worker's own words, or anything, including
// broken %-codes, which trip up decoding.
const segment = fc.oneof(
  fc.constantFrom("me", "recipe", "save", "delete", "fetch", "signin", "signout", "auth", "callback", "github", "error", "salsa", "session", "sign-out", "sign-in", "get-session", "list-accounts"),
  fc.constantFrom("%", "%E0", "%zz", "%2F", "..", "%00"),
  fc.stringMatching(/^[a-z0-9%.~_-]{1,12}$/),
);
// The Worker's routes. A route its code names but this list doesn't fails the
// first test below, so every new route gets these laws.
const ROUTES = ["/api/recipe", "/api/me", "/api/save", "/api/delete", "/api/fetch", "/api/signin", "/api/signout", "/api/auth/callback/github", "/api/auth/error",
  // Better Auth's own routes start here; only the two above are open.
  "/api/auth"];

// Mostly the start of one of the Worker's routes, then up to two more pieces.
const start = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...ROUTES) },
  { weight: 1, arbitrary: fc.constant("/api") },
);
// Only paths still under /api/ once a browser resolves them ("/api/.." is "/").
const path = fc.tuple(start, fc.array(segment, { maxLength: 2 }))
  .map(([s, parts]) => (s === "/api" && !parts.length ? "/api/" : [s, ...parts].join("/")))
  .filter((p) => new URL(p, "https://x.test").pathname.startsWith("/api/"));
const method = fc.constantFrom("GET", "GET", "POST", "POST", "PUT", "DELETE", "PATCH");

// The routes anyone can use without signing in. Every other path under /api/
// is for people who are signed in.
const PUBLIC = new Set(["/api/signin", "/api/signout", "/api/auth/callback/github", "/api/auth/error"]);

// A cookie someone made up, as a browser would send it: a session token that
// was never issued, or junk.
const forged = fc.oneof(
  fc.constant(""),
  fc.stringMatching(/^[A-Za-z0-9._-]{1,40}$/).map((v) => `better-auth.session_token=${v}`),
  fc.stringMatching(/^[A-Za-z0-9._-]{1,40}$/).map((v) => `__Secure-better-auth.session_token=${v}; signed-in=1`),
);

// Hundreds of requests each, so more than vitest's 5 s a test: with the test
// files running side by side on a busy machine, the broad law can go past it.
describe(`access laws (seed ${seed})`, { timeout: 30_000 }, () => {
  it("cover every route the Worker's code names", () => {
    const named = new Set(Object.values(SOURCES).flatMap((code) => code.match(/\/api\/[a-z][a-z/-]*/g) ?? [])
      .map((p) => p.replace(/\/$/, "")));
    expect([...named].filter((p) => !ROUTES.includes(p)), "add these to ROUTES in access-laws.test.js").toEqual([]);
  });

  it("signed out, every route but sign-in's own answers 401, whatever the cookie", async () => {
    await fc.assert(fc.asyncProperty(path.filter((p) => !PUBLIC.has(new URL(p, "https://x.test").pathname)), method, forged, async (p, m, cookie) => {
      const res = await browser().fetch(p, { method: m, headers: cookie ? { Cookie: cookie } : {} });
      expect(res.status, `${m} ${p} with "${cookie}"`).toBe(401);
      expect(res.headers.get("Cache-Control"), `${m} ${p}`).toBe("no-store");
    }), opts);
  });

  let editor;
  beforeEach(async () => {
    ({ b: editor } = await signIn("lawEditor"));
  });

  // Found by a security review: a broken %-code in a recipe's name.
  it("answers 404, not 500, for a recipe address with a broken %-code", async () => {
    const res = await editor.fetch("/api/recipe/%E0");
    expect(res.status).toBe(404);
  });

  // 500 is the Worker's own catch-all for an error it didn't expect (it also
  // drops its Better Auth set-up). 502 means GitHub didn't answer, which is
  // fair here: this file's fake GitHub has no repository in it.
  it("no request breaks the Worker: nothing under /api/ answers 500", async () => {
    await fc.assert(fc.asyncProperty(path, method, async (p, m) => {
      // Signed in afresh each time, as one of these may be POST /api/signout.
      const { b } = await signIn("lawEditor");
      const res = await b.fetch(p, { method: m });
      expect(res.status, `${m} ${p}`).not.toBe(500);
    }), opts);
  });

  // The routes that read a value out of the address, where decoding happens.
  const anyName = fc.oneof(segment, fc.string({ maxLength: 8 }).map(encodeURIComponent), fc.string({ maxLength: 8 }));
  it("no recipe name breaks the Worker: GET /api/recipe/<anything> never answers 500", async () => {
    await fc.assert(fc.asyncProperty(anyName, async (name) => {
      const res = await editor.fetch(`/api/recipe/${name}`);
      expect(res.status, `GET /api/recipe/${name}`).not.toBe(500);
      // Still signed in, so the law tested the route, not the sign-in check.
      expect(res.status, `GET /api/recipe/${name}`).not.toBe(401);
    }), opts);
  });
});
