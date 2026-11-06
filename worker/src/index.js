// The Worker's code. Cloudflare serves the site's files directly; this only
// runs for /api/ (see wrangler.jsonc) and for addresses that aren't a file.
//
// /api/ (docs/specs/recipe-editor-plan.md, slice 5):
//   GET  /api/signin?return=<page>  sign in with GitHub, then back to that page
//   GET  /api/auth/callback/github  where GitHub sends you back (Better Auth)
//   GET  /api/me                    who's signed in, and whether they can edit
//   POST /api/signout               sign out
//   POST /api/fetch                 a recipe website's page, for the intake (slice 7, fetch-page.js)
// Everything else under /api/ needs you to be signed in: 401 if you aren't.
import { forgetAuth, getAuth } from "./auth.js";
import { fetchPage } from "./fetch-page.js";

// The readable cookie that tells the site's pages someone is signed in, so
// they can show "Sign out" without asking the server. Nothing secret: the real
// session is the HttpOnly cookie, checked by /api/me.
const HINT = "signed-in";
const hint = (maxAge) => `${HINT}=${maxAge ? 1 : ""}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`;
const SESSION_DAYS = 30; // as in auth.js

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      let res;
      try {
        res = await api(request, env, url);
      } catch (error) {
        console.error(error);
        forgetAuth();
        res = Response.json({ error: "Sign-in isn't working right now. Try again in a minute." }, { status: 500 });
      }
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
    // A folder ("/", "/style-guides/x/"): its index.html, as GitHub Pages did.
    if (url.pathname.endsWith("/")) {
      url.pathname += "index.html";
      return env.ASSETS.fetch(new Request(url, request));
    }
    return new Response("Not found", { status: 404 });
  },
};

async function api(request, env, url) {
  const auth = getAuth(env);
  const route = `${request.method} ${url.pathname}`;

  if (url.pathname === "/api/signin") return route === "GET /api/signin" ? signIn(auth, request, env, url) : notAllowed("GET");
  if (url.pathname === "/api/signout") return route === "POST /api/signout" ? signOut(auth, request) : notAllowed("POST");
  // Better Auth's own pages that sign-in needs: GitHub's way back, and the page
  // it shows when sign-in fails. Its other routes aren't used, so they're closed.
  if (route === "GET /api/auth/callback/github") return withHint(await auth.handler(request));
  if (route === "GET /api/auth/error") return auth.handler(request);

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return signedOut("Sign in first.");

  if (route === "GET /api/me") return me(auth, request, env, session);
  if (url.pathname === "/api/fetch") return route === "POST /api/fetch" ? fetchPage(request, env) : notAllowed("POST");
  return Response.json({ error: "Not found" }, { status: 404 });
}

// Starts GitHub sign-in. Better Auth sets a short-lived cookie that ties
// GitHub's answer to this browser, so this must be a visit to the page, not a fetch.
async function signIn(auth, request, env, url) {
  const back = sitePage(url.searchParams.get("return") ?? "/", env.SITE_URL);
  if (!back) return new Response("That isn't a page on this site.", { status: 400 });
  const res = await auth.api.signInSocial({
    body: { provider: "github", callbackURL: back },
    headers: request.headers,
    asResponse: true,
  });
  const { url: toGitHub } = await res.json();
  const headers = new Headers({ Location: toGitHub });
  for (const c of res.headers.getSetCookie()) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

// A page on the site to come back to after signing in: a path from the site's
// root to an .html page or a folder, with its query. Anything else is refused,
// so the sign-in link can't be used to send people to another site.
function sitePage(path, site) {
  if (!/^\/(?![/\\])/.test(path)) return null;
  const url = new URL(path, site);
  if (url.origin !== new URL(site).origin) return null;
  if (!/^\/([\w-]+\/)*([\w-]+\.html)?$/.test(url.pathname)) return null;
  return url.pathname + url.search;
}

// Adds the hint cookie when Better Auth's response signs someone in.
function withHint(res) {
  res = new Response(res.body, res);
  const session = res.headers.getSetCookie().find((c) => /^(__Secure-)?better-auth\.session_token=[^;]/.test(c));
  if (session) res.headers.append("Set-Cookie", hint(SESSION_DAYS * 24 * 60 * 60));
  return res;
}

async function me(auth, request, env, session) {
  // Better Auth renews GitHub's 8-hour token itself when it has run out.
  let token = null;
  try {
    const accounts = await auth.api.listUserAccounts({ headers: request.headers });
    const github = accounts.find((a) => a.providerId === "github");
    if (github) ({ accessToken: token } = await auth.api.getAccessToken({ body: { accountId: github.id }, headers: request.headers }));
  } catch {
    // A refresh GitHub refused, or no GitHub account: sign in again.
  }
  const repo = token && await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "shaken-stirred-sauteed",
    },
  });
  if (!repo || repo.status === 401) return signedOut("Your GitHub sign-in has expired. Sign in again.");
  if (!repo.ok && repo.status !== 404 && repo.status !== 403) {
    return Response.json({ error: "Couldn't reach GitHub. Try again in a minute." }, { status: 502 });
  }
  const canEdit = repo.ok && (await repo.json()).permissions?.push === true;
  const res = Response.json({ name: session.user.name, canEdit });
  // Keeps the hint for as long as the session lasts.
  res.headers.append("Set-Cookie", hint(SESSION_DAYS * 24 * 60 * 60));
  return res;
}

// Ends the session (if there is one) and clears both cookies.
async function signOut(auth, request) {
  let res;
  try {
    res = await auth.api.signOut({ headers: request.headers, asResponse: true });
  } catch {
    res = null;
  }
  const out = Response.json({ signedOut: true });
  for (const c of res?.headers.getSetCookie() ?? []) out.headers.append("Set-Cookie", c);
  out.headers.append("Set-Cookie", hint(0));
  return out;
}

// 401, and clears a hint cookie that no longer matches a session.
function signedOut(error) {
  const res = Response.json({ error }, { status: 401 });
  res.headers.append("Set-Cookie", hint(0));
  return res;
}

const notAllowed = (allow) => new Response("Method not allowed", { status: 405, headers: { Allow: allow } });
