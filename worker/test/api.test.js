// The Worker's /api/: signing in with GitHub (faked, see fake-github.js),
// who's signed in, and signing out.
import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { forgetAuth } from "../src/auth.js";
import worker from "../src/index.js";

const SITE = "https://shaken-stirred-sauteed.com";

// A browser's cookies for the site: sent with each request, updated from each
// response's Set-Cookie.
function browser() {
  const jar = new Map();
  return {
    jar,
    async fetch(path, init = {}) {
      const headers = new Headers(init.headers);
      if (jar.size) headers.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
      if (init.method && init.method !== "GET") headers.set("Origin", SITE);
      const res = await exports.default.fetch(new Request(new URL(path, SITE), { ...init, headers, redirect: "manual" }));
      for (const line of res.headers.getSetCookie()) {
        const { name, value, attrs } = parseCookie(line);
        if (value === "" || attrs["max-age"] === "0") jar.delete(name);
        else jar.set(name, value);
      }
      return res;
    },
  };
}

function parseCookie(line) {
  const [pair, ...rest] = line.split(";").map((s) => s.trim());
  const at = pair.indexOf("=");
  const attrs = Object.fromEntries(rest.map((a) => {
    const [k, ...v] = a.split("=");
    return [k.toLowerCase(), v.length ? v.join("=") : true];
  }));
  return { name: pair.slice(0, at), value: pair.slice(at + 1), attrs };
}

const setCookies = (res) => res.headers.getSetCookie().map(parseCookie);
const sessionCookie = (res) => setCookies(res).find((c) => c.name.endsWith("session_token"));
const hintCookie = (res) => setCookies(res).find((c) => c.name === "signed-in");

// Signs in as one of the fake GitHub's people, starting on `page`.
async function signIn(as = "jacob", page = "/recipe.html?r=lemon-bars") {
  const b = browser();
  const start = await b.fetch(`/api/signin?return=${encodeURIComponent(page)}`);
  expect(start.status).toBe(302);
  const toGitHub = new URL(start.headers.get("Location"));
  const back = await b.fetch(`/api/auth/callback/github?code=${as}&state=${toGitHub.searchParams.get("state")}`);
  return { b, start, toGitHub, back };
}

describe("signed out", () => {
  for (const [method, path] of [["GET", "/api/me"], ["GET", "/api/anything"], ["POST", "/api/save"]]) {
    it(`gets 401 from ${method} ${path}`, async () => {
      const res = await browser().fetch(path, { method });
      expect(res.status).toBe(401);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });
  }

  it("can start signing in", async () => {
    const res = await browser().fetch("/api/signin?return=/");
    expect(res.status).toBe(302);
  });
});

describe("GET /api/signin", () => {
  it("sends you to GitHub's sign-in for this site's GitHub App, asking for no scopes", async () => {
    const { toGitHub } = await signIn();
    expect(toGitHub.origin + toGitHub.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(toGitHub.searchParams.get("client_id")).toBe("test-client-id");
    expect(toGitHub.searchParams.get("redirect_uri")).toBe(`${SITE}/api/auth/callback/github`);
    expect(toGitHub.searchParams.get("scope") || "").toBe("");
  });

  for (const page of ["/", "/recipe.html?r=lemon-bars", "/intake.html", "/style-guides/field-guide/"]) {
    it(`brings you back to ${page}`, async () => {
      const { back } = await signIn("jacob", page);
      expect(back.status).toBe(302);
      expect(new URL(back.headers.get("Location"), SITE).href).toBe(new URL(page, SITE).href);
    });
  }

  it("brings you back to the welcome page when no page is given", async () => {
    const b = browser();
    const start = await b.fetch("/api/signin");
    const state = new URL(start.headers.get("Location")).searchParams.get("state");
    const back = await b.fetch(`/api/auth/callback/github?code=jacob&state=${state}`);
    expect(new URL(back.headers.get("Location"), SITE).href).toBe(`${SITE}/`);
  });

  for (const page of ["https://evil.example/", "//evil.example/", "/\\evil.example/", "https:evil.example", "javascript:alert(1)",
    "/api/me", "/api/auth/sign-out", "recipe.html", "/recipes/lemon-bars.json", "/../etc/passwd"]) {
    it(`refuses to come back to ${page}`, async () => {
      const res = await browser().fetch(`/api/signin?return=${encodeURIComponent(page)}`);
      expect(res.status).toBe(400);
      expect(res.headers.get("Location")).toBeNull();
      expect(await res.text()).toMatch(/isn't a page on this site/);
    });
  }

  // Settings typed or pasted into Cloudflare's dashboard can pick up spaces or
  // invisible characters, like the zero-width space that ended up on the live
  // client ID. GitHub must get the clean ID.
  for (const [what, id] of [["a zero-width space after it", "test-client-id\u200B"],
    ["spaces around it", "  test-client-id \n"], ["other invisible characters", "\uFEFFtest-\u200Cclient\u200D-id\u2060"]]) {
    it(`sends GitHub the clean client ID when the setting has ${what}`, async () => {
      forgetAuth();
      try {
        const res = await worker.fetch(new Request(`${SITE}/api/signin?return=/`), { ...env, GITHUB_CLIENT_ID: id });
        expect(res.status).toBe(302);
        expect(new URL(res.headers.get("Location")).searchParams.get("client_id")).toBe("test-client-id");
      } finally {
        forgetAuth();
      }
    });
  }

  it("fails the callback when the sign-in wasn't started by this browser", async () => {
    const { toGitHub } = await signIn();
    const other = browser();
    const res = await other.fetch(`/api/auth/callback/github?code=jacob&state=${toGitHub.searchParams.get("state")}`);
    expect(sessionCookie(res)?.value || "").toBe("");
    expect(other.jar.has("signed-in")).toBe(false);
  });
});

describe("signing in", () => {
  it("sets the session cookie: HttpOnly, Secure, SameSite=Lax", async () => {
    const { back } = await signIn();
    const c = sessionCookie(back);
    expect(c.value).not.toBe("");
    expect(c.attrs.httponly).toBe(true);
    expect(c.attrs.secure).toBe(true);
    expect(c.attrs.samesite?.toLowerCase()).toBe("lax");
    expect(c.attrs.path).toBe("/");
  });

  it("sets a readable signed-in hint cookie with nothing secret in it", async () => {
    const { back } = await signIn();
    const c = hintCookie(back);
    expect(c.value).toBe("1");
    expect(c.attrs.httponly).toBeUndefined();
    expect(c.attrs.secure).toBe(true);
    expect(c.attrs.path).toBe("/");
    expect(Number(c.attrs["max-age"])).toBeGreaterThan(0);
  });

  it("keeps the GitHub tokens encrypted in the database", async () => {
    await signIn();
    const rows = (await env.DB.prepare(`select "accessToken", "refreshToken" from "account"`).all()).results;
    expect(rows).toHaveLength(1);
    expect(rows[0].accessToken).toBeTruthy();
    expect(rows[0].accessToken).not.toContain("ghu_jacob");
    expect(rows[0].refreshToken).not.toContain("ghr_jacob");
  });
});

describe("GET /api/me", () => {
  it("says who's signed in, and that they can edit the site", async () => {
    const { b } = await signIn("jacob");
    const res = await b.fetch("/api/me");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ name: "Jacob Dennen", canEdit: true });
  });

  it("says when the account can't push to the repo", async () => {
    const { b } = await signIn("friend");
    expect(await (await b.fetch("/api/me")).json()).toEqual({ name: "A Friend", canEdit: false });
  });

  it("asks you to sign in again, and clears the hint, when GitHub no longer accepts the token", async () => {
    const { b } = await signIn("expired");
    const res = await b.fetch("/api/me");
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/sign in again/i);
    expect(b.jar.has("signed-in")).toBe(false);
  });

  // GitHub's token lasts 8 hours; then Better Auth renews it with the refresh token.
  async function tokenRunsOut(who) {
    await fetch(`https://fake-github.test/expire?who=${who}`, { method: "POST" });
    await env.DB.prepare(`update "account" set "accessTokenExpiresAt" = ?`).bind(new Date(Date.now() - 60_000).toISOString()).run();
  }

  it("renews GitHub's token when it has run out", async () => {
    const { b } = await signIn("renew");
    await tokenRunsOut("renew");
    const res = await b.fetch("/api/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Renew User", canEdit: true });
  });

  it("asks you to sign in again when GitHub refuses to renew the token", async () => {
    const { b } = await signIn("stale");
    await tokenRunsOut("stale");
    const res = await b.fetch("/api/me");
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/sign in again/i);
  });

  it("clears a hint cookie left over from an ended session", async () => {
    const b = browser();
    b.jar.set("signed-in", "1");
    expect((await b.fetch("/api/me")).status).toBe(401);
    expect(b.jar.has("signed-in")).toBe(false);
  });
});

describe("POST /api/signout", () => {
  it("ends the session and clears both cookies", async () => {
    const { b } = await signIn();
    const session = [...b.jar.keys()].find((k) => k.endsWith("session_token"));
    const old = b.jar.get(session);

    const res = await b.fetch("/api/signout", { method: "POST" });
    expect(res.status).toBe(200);
    const cleared = setCookies(res).filter((c) => c.value === "" || c.attrs["max-age"] === "0").map((c) => c.name);
    expect(cleared).toContain(session);
    expect(cleared).toContain("signed-in");

    // The old session cookie no longer works.
    const again = browser();
    again.jar.set(session, old);
    expect((await again.fetch("/api/me")).status).toBe(401);
  });

  it("only takes POST", async () => {
    const { b } = await signIn();
    expect((await b.fetch("/api/signout")).status).toBe(405);
    expect((await b.fetch("/api/me")).status).toBe(200);
  });
});

describe("when the database fails", () => {
  it("says sign-in isn't working, and works again once the database does", async () => {
    await env.DB.exec(`alter table "verification" rename to "verification_away"`);
    const res = await browser().fetch("/api/signin?return=/");
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect((await res.json()).error).toMatch(/isn't working/);

    await env.DB.exec(`alter table "verification_away" rename to "verification"`);
    expect((await browser().fetch("/api/signin?return=/")).status).toBe(302);
  });
});

describe("the site's own files", () => {
  it("still serves a folder's index.html", async () => {
    const res = await browser().fetch("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>");
  });
});
