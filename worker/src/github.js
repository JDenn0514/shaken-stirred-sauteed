// Calls to GitHub's API with the signed-in person's own token, for the repo in
// wrangler.jsonc's GITHUB_REPO. Every call counts against the free plan's 50
// requests a Worker request may make to other sites; a save makes about 8.
const API = "https://api.github.com";

// What went wrong, as an answer for the browser: thrown, and turned into a
// response by the route.
export class Refusal extends Error {
  constructor(status, error, more = {}) {
    super(error);
    this.status = status;
    this.body = { error, ...more };
  }
}

export const SIGN_IN_AGAIN = "Your GitHub sign-in has expired. Sign in again.";
export const CANT_EDIT = "This account can't edit this site.";
const UNREACHABLE = "Couldn't reach GitHub. Try again in a minute.";

export function github(token, repo) {
  async function call(method, path, { body, raw } = {}) {
    let res;
    try {
      res = await fetch(`${API}${path.startsWith("/repos/") ? path : `/repos/${repo}${path}`}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "shaken-stirred-sauteed",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new Refusal(502, UNREACHABLE);
    }
    if (res.status === 401) throw new Refusal(401, SIGN_IN_AGAIN);
    // Writing without push access: GitHub says 403, or 404 for a repo it hides.
    if (method !== "GET" && (res.status === 403 || res.status === 404)) throw new Refusal(403, CANT_EDIT);
    return res;
  }

  const ok = async (res) => {
    if (!res.ok) {
      console.error(`GitHub said ${res.status}: ${await res.text()}`);
      throw new Refusal(502, UNREACHABLE);
    }
    return res;
  };

  return {
    // main's latest commit, and its tree.
    async main() {
      const { object } = await (await ok(await call("GET", "/git/ref/heads/main"))).json();
      const { tree } = await (await ok(await call("GET", `/git/commits/${object.sha}`))).json();
      return { commit: object.sha, tree: tree.sha };
    },
    // A file at a commit: { text, sha }, or null when it isn't there.
    async file(path, commit) {
      const res = await call("GET", `/contents/${path}?ref=${commit}`);
      if (res.status === 404) return null;
      const { content, sha } = await (await ok(res)).json();
      const bytes = Uint8Array.from(atob(content.replace(/\s/g, "")), (c) => c.charCodeAt(0));
      return { text: new TextDecoder().decode(bytes), sha };
    },
    // A file's text at a commit, however large (the contents API's JSON stops at 1 MB).
    async text(path, commit) {
      return (await ok(await call("GET", `/contents/${path}?ref=${commit}`, { raw: true }))).text();
    },
    // One commit on top of `parent`: files written ({ path: text }) or deleted
    // ({ path: null }). Returns the commit's SHA; main isn't moved yet.
    async commit(parent, tree, files, message) {
      const entries = Object.entries(files).map(([path, text]) => (text === null
        ? { path, mode: "100644", type: "blob", sha: null }
        : { path, mode: "100644", type: "blob", content: text }));
      const made = await (await ok(await call("POST", "/git/trees", { body: { base_tree: tree, tree: entries } }))).json();
      const commit = await (await ok(await call("POST", "/git/commits", { body: { message, tree: made.sha, parents: [parent] } }))).json();
      return commit.sha;
    },
    // Moves main to the commit. false when main has moved on since (not a fast forward).
    async moveMain(commit) {
      const res = await call("PATCH", "/git/refs/heads/main", { body: { sha: commit, force: false } });
      if (res.status === 422 || res.status === 409) return false;
      await ok(res);
      return true;
    },
  };
}

// Git's own name for a file's contents (its blob SHA), so the editor knows the
// version it just saved without asking GitHub again.
export async function blobSha(text) {
  const body = new TextEncoder().encode(text);
  const head = new TextEncoder().encode(`blob ${body.length}\0`);
  const all = new Uint8Array(head.length + body.length);
  all.set(head);
  all.set(body, head.length);
  const hash = await crypto.subtle.digest("SHA-1", all);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
