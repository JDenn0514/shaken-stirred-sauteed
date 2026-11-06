// POST /api/fetch: gets a recipe website's page for the intake (browsers can't
// fetch another site's page themselves). Signed in only, https only, never a
// private or local address, with a size limit and a time limit. The outside
// site is faked (fake-sites.js).
import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

const SITE = "https://shaken-stirred-sauteed.com";

// Signs in as the fake GitHub's "jacob" and keeps the session cookie.
async function signedIn() {
  const jar = new Map();
  const send = async (path, init = {}, settings) => {
    const headers = new Headers(init.headers);
    if (jar.size) headers.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    const request = new Request(new URL(path, SITE), { ...init, headers, redirect: "manual" });
    const res = settings ? await worker.fetch(request, { ...env, ...settings }) : await exports.default.fetch(request);
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return res;
  };
  const start = await send("/api/signin?return=/intake.html");
  const state = new URL(start.headers.get("Location")).searchParams.get("state");
  await send(`/api/auth/callback/github?code=jacob&state=${state}`);
  return send;
}

const getPage = (send, url, settings) => send("/api/fetch", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url }),
}, settings);

const reached = async () => (await fetch("https://fake-sites.test/reached")).json();

describe("POST /api/fetch", () => {
  it("refuses you when you aren't signed in, without fetching anything", async () => {
    const res = await exports.default.fetch(new Request(`${SITE}/api/fetch`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://recipes.example/lemon-bars?signed-out" }),
    }));
    expect(res.status).toBe(401);
    expect(await reached()).not.toContain("https://recipes.example/lemon-bars?signed-out");
  });

  it("gives a signed-in person the page's HTML, and its address", async () => {
    const send = await signedIn();
    const res = await getPage(send, "https://recipes.example/lemon-bars");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.url).toBe("https://recipes.example/lemon-bars");
    expect(body.html).toContain('"@type":"Recipe"');
  });

  it("follows a redirect, and says where it ended up", async () => {
    const send = await signedIn();
    const body = await (await getPage(send, "https://recipes.example/moved")).json();
    expect(body.url).toBe("https://recipes.example/lemon-bars");
    expect(body.html).toContain("Lemon Bars");
  });

  it("asks like a web browser, naming the site, since some sites turn away anything else", async () => {
    const send = await signedIn();
    const { html } = await (await getPage(send, "https://recipes.example/user-agent")).json();
    expect(html).toMatch(/^Mozilla\/5\.0 .*shaken-stirred-sauteed\.com/);
  });

  for (const [what, url] of [["an http: address", "http://recipes.example/lemon-bars"], ["no address", ""],
    ["something that isn't an address", "lemon bars"], ["a file", "file:///etc/passwd"]]) {
    it(`refuses ${what}`, async () => {
      const send = await signedIn();
      const res = await getPage(send, url);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/https:\/\//);
    });
  }

  for (const url of ["https://localhost/", "https://foo.localhost/", "https://127.0.0.1/", "https://127.1.2.3:8443/",
    "https://10.0.0.5/", "https://192.168.1.1/", "https://172.16.0.1/", "https://172.31.255.255/", "https://169.254.169.254/latest/meta-data/",
    "https://0.0.0.0/", "https://100.64.0.1/", "https://2130706433/", "https://0x7f000001/", "https://[::1]/", "https://[::]/", "https://[fe80::1]/",
    "https://[fd00::1]/", "https://[::ffff:127.0.0.1]/", "https://[::ffff:a00:1]/", "https://printer.local/", "https://router.lan/",
    "https://intranet/", "https://metadata.google.internal/"]) {
    it(`refuses a private or local address: ${url}`, async () => {
      const send = await signedIn();
      const res = await getPage(send, url);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/isn't a public website/);
      expect((await reached()).some((r) => r.startsWith(new URL(url).origin))).toBe(false);
    });
  }

  it("refuses a redirect to a private address, without following it", async () => {
    const send = await signedIn();
    for (const path of ["/to-local", "/to-private"]) {
      const res = await getPage(send, `https://recipes.example${path}`);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/isn't a public website/);
    }
    const hosts = (await reached()).map((r) => new URL(r).hostname);
    expect(hosts).not.toContain("127.0.0.1");
    expect(hosts).not.toContain("10.0.0.1");
  });

  it("refuses a redirect to http:", async () => {
    const send = await signedIn();
    const res = await getPage(send, "https://recipes.example/to-http");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/https:\/\//);
  });

  it("gives up on endless redirects", async () => {
    const send = await signedIn();
    const res = await getPage(send, "https://recipes.example/loop");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/redirect/i);
  });

  for (const path of ["/huge", "/huge-unannounced"]) {
    it(`refuses a page over 5 MB (${path})`, async () => {
      const send = await signedIn();
      const res = await getPage(send, `https://recipes.example${path}`);
      expect(res.status).toBe(413);
      expect((await res.json()).error).toMatch(/too big/);
    });
  }

  it("gives up on a site that's too slow to answer", async () => {
    const send = await signedIn();
    const started = Date.now();
    const res = await getPage(send, "https://recipes.example/slow", { FETCH_TIMEOUT_MS: "200" });
    expect(res.status).toBe(504);
    expect((await res.json()).error).toMatch(/too long/);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  for (const [what, path] of [["refuses (403)", "/refused"], ["asks for payment it doesn't need (402)", "/payment-required"]]) {
    it(`says plainly when a site ${what}, and to copy the text instead`, async () => {
      const send = await signedIn();
      const res = await getPage(send, `https://recipes.example${path}`);
      expect(res.status).toBe(502);
      const { error, refused } = await res.json();
      expect(refused).toBe(true);
      expect(error).toMatch(/won't share/);
      expect(error).toMatch(/copy/i);
    });
  }

  it("says when the page doesn't exist", async () => {
    const send = await signedIn();
    const res = await getPage(send, "https://recipes.example/missing");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/doesn't exist/);
  });

  it("refuses something that isn't a web page", async () => {
    const send = await signedIn();
    const res = await getPage(send, "https://recipes.example/photo.jpg");
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/isn't a web page/);
  });

  it("only takes POST", async () => {
    const send = await signedIn();
    expect((await send("/api/fetch")).status).toBe(405);
  });
});
