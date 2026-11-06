// The Worker's code. Cloudflare serves the site's files directly; this only
// runs for /api/ (see wrangler.jsonc) and for addresses that aren't a file.
//
// /api/ (docs/specs/recipe-editor-plan.md, slice 5):
//   GET  /api/signin?return=<page>  sign in with GitHub, then back to that page
//   GET  /api/auth/callback/github  where GitHub sends you back (Better Auth)
//   GET  /api/me                    who's signed in, and whether they can edit
//   POST /api/signout               sign out
//   POST /api/fetch                 a recipe website's page, for the intake (slice 7, fetch-page.js)
// and saving (slice 6, src/recipes.js):
//   GET  /api/recipe/<slug>         a recipe on main, with its file's version
//   POST /api/save                  { slug, recipe, baseSha }: commit it to main
//   POST /api/delete                { slug, baseSha }: take it off main
// Everything else under /api/ needs you to be signed in: 401 if you aren't.
import { forgetAuth, getAuth } from "./auth.js";
import { fetchPage } from "./fetch-page.js";
import { Refusal, SIGN_IN_AGAIN, github } from "./github.js";
import { deleteRecipe, isSlug, loadRecipe, saveRecipe } from "./recipes.js";

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

  const recipe = /^\/api\/recipe\/([^/]+)$/.exec(url.pathname);
  const saving = url.pathname === "/api/save" || url.pathname === "/api/delete";
  if (!recipe && !saving) return Response.json({ error: "Not found" }, { status: 404 });
  if (recipe && request.method !== "GET") return notAllowed("GET");
  if (saving && request.method !== "POST") return notAllowed("POST");
  // Saving only takes requests from the site's own pages.
  const origin = request.headers.get("Origin");
  if (saving && origin !== url.origin) return Response.json({ error: "Saving only works from this site." }, { status: 403 });

  try {
    let body = null;
    if (saving) {
      body = await request.json().catch(() => null);
      const problem = badRequest(url.pathname, body);
      if (problem) return Response.json({ error: problem }, { status: 400 });
    }
    const token = await githubToken(auth, request);
    if (!token) return signedOut(SIGN_IN_AGAIN);
    const gh = github(token, env.GITHUB_REPO);
    if (recipe) return Response.json(await loadRecipe(gh, decodeURIComponent(recipe[1])));
    if (url.pathname === "/api/save") return Response.json(await saveRecipe(gh, body));
    return Response.json(await deleteRecipe(gh, body));
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return error.status === 401 ? signedOut(error.message) : Response.json(error.body, { status: error.status });
  }
}

// What's wrong with a save or delete's request, if anything.
function badRequest(path, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Send the recipe as JSON.";
  if (!isSlug(body.slug)) return "The recipe's file name must be lowercase letters, numbers and dashes.";
  if (body.baseSha !== undefined && (typeof body.baseSha !== "string" || !/^[0-9a-f]{40}$/.test(body.baseSha))) return "That isn't a version of a recipe.";
  if (path === "/api/delete") return body.baseSha === undefined ? "Say which version of the recipe to delete." : "";
  const r = body.recipe;
  if (!r || typeof r !== "object" || Array.isArray(r)) return "Send the recipe to save.";
  return "";
}

// The signed-in person's GitHub token. Better Auth renews GitHub's 8-hour
// token itself when it has run out; null when it can't (sign in again).
async function githubToken(auth, request) {
  try {
    const accounts = await auth.api.listUserAccounts({ headers: request.headers });
    const account = accounts.find((a) => a.providerId === "github");
    if (!account) return null;
    const { accessToken } = await auth.api.getAccessToken({ body: { accountId: account.id }, headers: request.headers });
    return accessToken || null;
  } catch {
    // A refresh GitHub refused, or no GitHub account.
    return null;
  }
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
  const token = await githubToken(auth, request);
  const repo = token && await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "shaken-stirred-sauteed",
    },
  });
  if (!repo || repo.status === 401) return signedOut(SIGN_IN_AGAIN);
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
