// A fake GitHub for the Worker's tests (runs in Node, outside the Worker).
// It holds a small git repository (the repo's main branch) that saving and
// deleting commit to, with ways for the tests to set it up, change it behind
// the Worker's back, and look at what was committed (see "For the tests").
// The test files share this fake, so each person is used by one test file.
// Sign-in code "jacob" is the site's owner, who can push to the repo; "friend"
// can sign in but not push; "expired" gets a token GitHub no longer accepts;
// "stale" gets one that's turned down once it has run out, and a refresh
// token GitHub refuses (as when it has already been used once).
import { createHash } from "node:crypto";

const PEOPLE = {
  jacob: { id: 1, login: "JDenn0514", name: "Jacob Dennen", push: true },
  friend: { id: 2, login: "a-friend", name: "A Friend", push: false },
  expired: { id: 3, login: "lapsed", name: "Lapsed User", push: true, rejected: true },
  renew: { id: 5, login: "renew", name: "Renew User", push: true },
  stale: { id: 4, login: "stale", name: "Stale User", push: true, refuseRefresh: true },
  // For saving and deleting (save.test.js).
  saver: { id: 6, login: "saver", name: "Saver", push: true },
  looker: { id: 7, login: "looker", name: "Looker", push: false },
  lapsing: { id: 8, login: "lapsing", name: "Lapsing", push: true, refuseRefresh: true },
};
// Tokens GitHub has stopped accepting (run out, or replaced by a refresh).
const deadTokens = new Set();
const byToken = (request) => {
  const token = /^(?:Bearer|token) ghu_(\w+)$/.exec(request.headers.get("Authorization") || "")?.[1];
  return token && { ...PEOPLE[token], token, rejected: PEOPLE[token]?.rejected || deadTokens.has(`ghu_${token}`) };
};
const json = (body, status = 200) => Response.json(body, { status });

export async function fakeGitHub(request) {
  const url = new URL(request.url);
  const at = `${request.method} ${url.origin}${url.pathname}`;

  if (url.origin === "https://fake-github.test" && url.pathname.startsWith("/repo")) return testControls(request, url);
  if (at === "GET https://fake-github.test/calls") return json({ calls: calls.get(url.searchParams.get("who")) || 0 });
  if (url.origin === "https://api.github.com") {
    const token = /^(?:Bearer|token) ghu_(\w+)$/.exec(request.headers.get("Authorization") || "")?.[1];
    if (token) calls.set(token, (calls.get(token) || 0) + 1);
  }

  // For the tests: GitHub stops accepting someone's token, as when it runs out.
  if (at === "POST https://fake-github.test/expire") {
    deadTokens.add(`ghu_${url.searchParams.get("who")}`);
    return new Response(null, { status: 204 });
  }

  if (at === "POST https://github.com/login/oauth/access_token") {
    const form = new URLSearchParams(await request.text());
    if (form.get("grant_type") === "refresh_token") {
      const name = /^ghr_(\w+)$/.exec(form.get("refresh_token"))?.[1];
      // GitHub answers a bad refresh with 200 and an error.
      if (!PEOPLE[name] || PEOPLE[name].refuseRefresh) return json({ error: "bad_refresh_token" });
      deadTokens.delete(`ghu_${name}`);
      return json({
        access_token: `ghu_${name}`, expires_in: 28800,
        refresh_token: `ghr_${name}`, refresh_token_expires_in: 15897600,
        token_type: "bearer", scope: "",
      });
    }
    const code = form.get("code");
    if (!PEOPLE[code]) return json({ error: "bad_verification_code" });
    deadTokens.delete(`ghu_${code}`);
    return json({
      access_token: `ghu_${code}`, expires_in: 28800,
      refresh_token: `ghr_${code}`, refresh_token_expires_in: 15897600,
      token_type: "bearer", scope: "",
    });
  }

  const who = byToken(request);
  if (url.origin === "https://api.github.com" && (!who || who.rejected) && url.pathname !== "/user" && url.pathname !== "/user/emails") {
    return json({ message: "Bad credentials" }, 401);
  }
  if (at === "GET https://api.github.com/user") {
    return who ? json({ id: who.id, login: who.login, name: who.name, email: null, avatar_url: `https://avatars.example/${who.id}` }) : json({ message: "Bad credentials" }, 401);
  }
  if (at === "GET https://api.github.com/user/emails") {
    return who ? json([{ email: `${who.login}@example.com`, primary: true, verified: true }]) : json({ message: "Bad credentials" }, 401);
  }
  if (at === "GET https://api.github.com/repos/JDenn0514/shaken-stirred-sauteed") {
    return json({ full_name: "JDenn0514/shaken-stirred-sauteed", permissions: { admin: who.push, push: who.push, pull: true } });
  }
  if (url.origin === "https://api.github.com" && url.pathname.startsWith(`${REPO}/`)) return repoAPI(request, url, who);
  return new Response(`The fake GitHub doesn't know ${at}`, { status: 599 });
}

// --- The repository -----------------------------------------------------------
//
// Just enough of GitHub's contents and Git Data APIs for saving: main's commit,
// a file with its blob SHA, and making trees, commits and moving main. Blob
// SHAs are real git ones, so the Worker's own are checked against them.
const REPO = "/repos/JDenn0514/shaken-stirred-sauteed";
const calls = new Map(); // requests to GitHub's API, by whose token
const blobs = new Map(); // sha -> text
const trees = new Map(); // sha -> Map(path -> blob sha)
const commits = new Map(); // sha -> { tree, parents, message }
let main = null;
let races = []; // commits to make on main just before the Worker's next moves of it
let made = 0;

const sha1 = (...parts) => {
  const h = createHash("sha1");
  for (const p of parts) h.update(p);
  return h.digest("hex");
};
const putBlob = (text) => {
  const sha = sha1(`blob ${Buffer.byteLength(text)}\0`, text);
  blobs.set(sha, text);
  return sha;
};
const putTree = (files) => {
  const sha = sha1("tree", JSON.stringify([...files].sort()));
  trees.set(sha, new Map(files));
  return sha;
};
const putCommit = (tree, parents, message) => {
  const sha = sha1("commit", tree, parents.join(), message, String(made++));
  commits.set(sha, { tree, parents, message });
  return sha;
};
// Changes files on main, as a push from somewhere else would: { path: text, or null to delete }.
function commitToMain(files, message) {
  const tree = new Map(main ? trees.get(commits.get(main).tree) : []);
  for (const [path, text] of Object.entries(files)) {
    if (text === null) tree.delete(path);
    else tree.set(path, putBlob(text));
  }
  main = putCommit(putTree(tree), main ? [main] : [], message);
}
const filesOf = (commit) => trees.get(commits.get(commit).tree);
const commitOf = (ref) => (ref === "main" || !ref ? main : commits.has(ref) ? ref : null);

// For the tests, at https://fake-github.test/repo...:
//   POST /repo/reset   { files }            main is one commit holding just these files
//   POST /repo/commit  { files, message }   a commit to main from somewhere else
//   POST /repo/race    { files, message }   that commit lands while the Worker is saving,
//                                           just before it moves main (once per call)
//   GET  /repo                              main's history (newest first) and its files
// and GET /calls?who=<person>: how many requests that person's token has made to GitHub's API.
async function testControls(request, url) {
  const at = `${request.method} ${url.pathname}`;
  if (at === "POST /repo/reset") {
    const { files } = await request.json();
    main = null;
    races = [];
    calls.clear();
    commitToMain(files, "Start");
    return json({ main });
  }
  if (at === "POST /repo/commit") {
    const { files, message = "A change from somewhere else" } = await request.json();
    commitToMain(files, message);
    return json({ main });
  }
  if (at === "POST /repo/race") {
    races.push({ message: "A change from somewhere else", ...(await request.json()) });
    return json({ races: races.length });
  }
  if (at === "GET /repo") {
    const history = [];
    for (let c = main; c; c = commits.get(c).parents[0]) {
      const { parents, message } = commits.get(c);
      const now = filesOf(c), before = parents[0] ? filesOf(parents[0]) : new Map();
      const changed = [...new Set([...now.keys(), ...before.keys()])].filter((p) => now.get(p) !== before.get(p)).sort();
      history.push({ sha: c, message, changed, parents: parents.length });
    }
    const files = Object.fromEntries([...filesOf(main)].map(([p, sha]) => [p, blobs.get(sha)]));
    const shas = Object.fromEntries(filesOf(main));
    return json({ main, history, files, shas });
  }
  return new Response(`The fake GitHub has no test control ${at}`, { status: 599 });
}

async function repoAPI(request, url, who) {
  const path = url.pathname.slice(REPO.length);
  const at = `${request.method} ${path}`;
  const writing = request.method !== "GET";
  if (writing && !who.push) return json({ message: "Resource not accessible by integration" }, 403);

  if (at === "GET /git/ref/heads/main") return json({ ref: "refs/heads/main", object: { sha: main, type: "commit" } });
  let m;
  if ((m = /^GET \/git\/commits\/(\w+)$/.exec(at))) {
    const c = commits.get(m[1]);
    return c ? json({ sha: m[1], tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })), message: c.message }) : json({ message: "Not Found" }, 404);
  }
  if ((m = /^GET \/contents\/(.+)$/.exec(at))) {
    const commit = commitOf(url.searchParams.get("ref"));
    const file = decodeURIComponent(m[1]);
    const sha = commit && filesOf(commit).get(file);
    if (!sha) return json({ message: "Not Found" }, 404);
    const text = blobs.get(sha);
    if ((request.headers.get("Accept") || "").includes("raw")) return new Response(text);
    // GitHub wraps its base64 every 60 characters.
    const content = Buffer.from(text).toString("base64").replace(/.{60}/g, "$&\n");
    return json({ type: "file", path: file, sha, size: Buffer.byteLength(text), encoding: "base64", content });
  }
  if (at === "POST /git/trees") {
    const { base_tree, tree } = await request.json();
    if (!trees.has(base_tree)) return json({ message: "Invalid tree info" }, 422);
    const files = new Map(trees.get(base_tree));
    for (const e of tree) {
      if (e.sha === null) {
        if (!files.has(e.path)) return json({ message: "GitTree: tried to delete a file that isn't there" }, 422);
        files.delete(e.path);
      } else if (typeof e.content === "string" && e.mode === "100644" && e.type === "blob") files.set(e.path, putBlob(e.content));
      else return json({ message: `The fake GitHub doesn't take this tree entry: ${JSON.stringify(e)}` }, 599);
    }
    return json({ sha: putTree(files) }, 201);
  }
  if (at === "POST /git/commits") {
    const { message, tree, parents } = await request.json();
    if (!trees.has(tree) || !parents.every((p) => commits.has(p))) return json({ message: "Invalid tree or parents" }, 422);
    return json({ sha: putCommit(tree, parents, message), message }, 201);
  }
  if (at === "PATCH /git/refs/heads/main") {
    const { sha, force } = await request.json();
    const race = races.shift();
    if (race) commitToMain(race.files, race.message);
    if (force) return json({ message: "The Worker should never force main" }, 599);
    if (!commits.has(sha) || commits.get(sha).parents[0] !== main) return json({ message: "Update is not a fast forward" }, 422);
    main = sha;
    return json({ ref: "refs/heads/main", object: { sha, type: "commit" } });
  }
  return new Response(`The fake GitHub doesn't know ${request.method} ${url.pathname}`, { status: 599 });
}
