// A browser for the Worker's tests: cookies kept between requests, and
// signing in through the fake GitHub (fake-github.ts).
import { exports } from "cloudflare:workers";
import { expect } from "vitest";

export const SITE = "https://shaken-stirred-sauteed.com";

// A browser's cookies for the site: sent with each request, updated from each
// response's Set-Cookie.
export function browser() {
  const jar = new Map<string, string>();
  return {
    jar,
    async fetch(path: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers);
      if (jar.size) headers.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
      if (init.method && init.method !== "GET" && !headers.has("Origin")) headers.set("Origin", SITE);
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

type Cookie = { name: string; value: string; attrs: Record<string, string | true> };

function parseCookie(line: string): Cookie {
  const [pair, ...rest] = line.split(";").map((s) => s.trim());
  const at = pair.indexOf("=");
  const attrs = Object.fromEntries(rest.map((a): [string, string | true] => {
    const [k, ...v] = a.split("=");
    return [k.toLowerCase(), v.length ? v.join("=") : true];
  }));
  return { name: pair.slice(0, at), value: pair.slice(at + 1), attrs };
}

export type Browser = ReturnType<typeof browser>;

export const setCookies = (res: Response) => res.headers.getSetCookie().map(parseCookie);
export const sessionCookie = (res: Response) => setCookies(res).find((c) => c.name.endsWith("session_token"));
export const hintCookie = (res: Response) => setCookies(res).find((c) => c.name === "signed-in");

// Signs in as one of the fake GitHub's people, starting on `page`.
export async function signIn(as = "jacob", page = "/recipe.html?r=lemon-bars") {
  const b = browser();
  const start = await b.fetch(`/api/signin?return=${encodeURIComponent(page)}`);
  expect(start.status).toBe(302);
  const toGitHub = new URL(start.headers.get("Location")!);
  const back = await b.fetch(`/api/auth/callback/github?code=${as}&state=${toGitHub.searchParams.get("state")}`);
  return { b, start, toGitHub, back };
}
