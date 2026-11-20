// Saving and deleting recipes (docs/specs/recipe-editor-plan.md, slice 6):
// GET /api/recipe/:slug, POST /api/save and POST /api/delete, against the fake
// GitHub's repository (fake-github.js). Each test starts from the same small
// set of recipes on main, with an index.json built from them.
import { env } from "cloudflare:test";
import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import checks from "../../assets/recipe-checks.js";
import vocab from "../../recipes/vocabulary.json";
import { formatRecipe } from "../src/format.js";
import { SITE, browser, signIn } from "./browser.js";

const { indexEntry, patchIndex } = checks;
const fake = (path, init) => fetch(`https://fake-github.test${path}`, init);
const post = (path, body) => fake(path, { method: "POST", body: JSON.stringify(body) });

const recipe = (overrides = {}) => ({
  title: "Test Recipe", category: "cooking",
  ingredients: ["1 cup rice"], steps: ["Cook the rice."],
  tags: { ingredients: ["rice"] }, time: { total: 20 },
  ...overrides,
});
const RECIPES = {
  "garlic-butter": recipe({
    title: "Garlic Butter", kind: "component",
    ingredients: [{ qty: "8 tbsp", item: "Butter" }, { qty: "4 cloves", item: "Garlic" }],
    steps: [{ do: "Mash the garlic into the butter.", uses: ["Butter", "Garlic"] }],
    tags: { ingredients: ["garlic"] },
  }),
  "garlic-bread": recipe({
    title: "Garlic Bread",
    ingredients: [{ qty: "1", item: "Baguette" }, { qty: "4 tbsp", item: "Garlic butter", recipe: "garlic-butter" }],
    steps: [{ do: "Spread the garlic butter on the baguette.", uses: ["Baguette", "Garlic butter"] }],
    tags: { ingredients: ["garlic"] },
  }),
  salsa: recipe({ title: "Salsa", ingredients: ["4 tomatoes", "1 onion"], steps: ["Chop and mix."], tags: { ingredients: ["tomato"] } }),
};

// The index the build script would write for these recipes.
const indexOf = (recipes) => Object.entries(recipes).reduce((index, [slug, r]) => patchIndex(index, slug, indexEntry(slug, r, vocab)), []);
const indexFile = (recipes) => `${JSON.stringify(indexOf(recipes), null, 2)}\n`;
const filesOf = (recipes) => ({
  "recipes/vocabulary.json": JSON.stringify(vocab, null, 2),
  "recipes/index.json": indexFile(recipes),
  ...Object.fromEntries(Object.entries(recipes).map(([slug, r]) => [`recipes/${slug}.json`, JSON.stringify(r, null, 2)])),
  "README.md": "The site.\n",
});

const repo = async () => (await fake("/repo")).json();
// The recipes on main now, read from their files.
const recipesOn = (state) => Object.fromEntries(Object.entries(state.files)
  .filter(([p]) => /^recipes\/[a-z0-9-]+\.json$/.test(p) && !/(index|vocabulary)\.json$/.test(p))
  .map(([p, text]) => [p.slice(8, -5), JSON.parse(text)]));

let b;
beforeEach(async () => {
  await post("/repo/reset", { files: filesOf(RECIPES) });
  ({ b } = await signIn("saver", "/edit.html?r=salsa"));
});

const send = (path, body, who = b) => who.fetch(path, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const open = async (slug, who = b) => (await who.fetch(`/api/recipe/${slug}`)).json();

describe("GET /api/recipe/:slug", () => {
  it("gives the recipe on main, with its file's git version (blob SHA)", async () => {
    const res = await b.fetch("/api/recipe/salsa");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.recipe).toEqual(RECIPES.salsa);
    expect(body.sha).toBe((await repo()).shas["recipes/salsa.json"]);
  });

  it("says when there's no such recipe", async () => {
    const res = await b.fetch("/api/recipe/not-a-recipe");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/no recipe/i);
  });

  it("refuses a name that isn't a recipe's file name", async () => {
    expect((await b.fetch("/api/recipe/..%2FREADME.md")).status).toBe(404);
    expect((await b.fetch("/api/recipe/index")).status).toBe(404);
    expect((await b.fetch("/api/recipe/vocabulary")).status).toBe(404);
  });

  it("needs you to be signed in", async () => {
    expect((await browser().fetch("/api/recipe/salsa")).status).toBe(401);
  });
});

describe("POST /api/save", () => {
  it("an edit makes exactly one commit, holding the recipe and index.json", async () => {
    const before = await repo();
    const { recipe: r, sha } = await open("salsa");
    const edited = { ...r, description: "Fresh and sharp." };
    const res = await send("/api/save", { slug: "salsa", recipe: edited, baseSha: sha });
    expect(res.status).toBe(200);

    const after = await repo();
    expect(after.history.length).toBe(before.history.length + 1);
    expect(after.history[0]).toMatchObject({ message: "Edit Salsa", changed: ["recipes/index.json", "recipes/salsa.json"], parents: 1 });
    expect(JSON.parse(after.files["recipes/salsa.json"])).toEqual(edited);
    // The patched index is what a full rebuild of main's recipes gives.
    expect(after.files["recipes/index.json"]).toBe(indexFile(recipesOn(after)));
    expect(JSON.parse(after.files["recipes/index.json"]).find((e) => e.slug === "salsa").description).toBe("Fresh and sharp.");

    // The answer has the file's new version, for the next save.
    const body = await res.json();
    expect(body).toMatchObject({ slug: "salsa", title: "Salsa", sha: after.shas["recipes/salsa.json"], commit: after.main });
  });

  it("saving twice in a row works, with the version the first save gave back", async () => {
    const { recipe: r, sha } = await open("salsa");
    const first = await (await send("/api/save", { slug: "salsa", recipe: { ...r, yield: "Serves 4" }, baseSha: sha })).json();
    const second = await send("/api/save", { slug: "salsa", recipe: { ...r, yield: "Serves 6" }, baseSha: first.sha });
    expect(second.status).toBe(200);
    expect(JSON.parse((await repo()).files["recipes/salsa.json"]).yield).toBe("Serves 6");
  });

  it("a new recipe is added, with its index entry, in one commit", async () => {
    const pico = recipe({ title: "Pico de Gallo", ingredients: ["3 tomatoes"], steps: ["Dice."], tags: { ingredients: ["tomato"] } });
    const res = await send("/api/save", { slug: "pico-de-gallo", recipe: pico });
    expect(res.status).toBe(200);
    const after = await repo();
    expect(after.history[0]).toMatchObject({ message: "Add Pico de Gallo", changed: ["recipes/index.json", "recipes/pico-de-gallo.json"] });
    expect(JSON.parse(after.files["recipes/pico-de-gallo.json"])).toEqual(pico);
    expect(after.files["recipes/index.json"]).toBe(indexFile(recipesOn(after)));
  });

  it("writes the file with short lists on one line, as the hand-written files are", async () => {
    const { recipe: r, sha } = await open("salsa");
    await send("/api/save", { slug: "salsa", recipe: r, baseSha: sha });
    const text = (await repo()).files["recipes/salsa.json"];
    expect(text).toBe(formatRecipe(r));
    expect(text).toContain(`"ingredients": ["tomato"]`);
    expect(text.endsWith("}\n")).toBe(true);
  });

  it("a new recipe whose file name is taken is refused, with nothing committed", async () => {
    const before = await repo();
    const res = await send("/api/save", { slug: "salsa", recipe: recipe({ title: "Salsa" }) });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already a recipe/i);
    expect((await repo()).main).toBe(before.main);
  });

  it("a recipe changed on main since it was opened gets 409, with nothing committed", async () => {
    const { recipe: r, sha } = await open("salsa");
    await post("/repo/commit", { files: { "recipes/salsa.json": JSON.stringify({ ...r, yield: "Serves 2" }) } });
    const before = await repo();

    const res = await send("/api/save", { slug: "salsa", recipe: { ...r, description: "Mine." }, baseSha: sha });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/changed since you opened it/);
    expect((await repo()).main).toBe(before.main);
  });

  it("a recipe deleted on main since it was opened gets 409", async () => {
    const { recipe: r, sha } = await open("salsa");
    await post("/repo/commit", { files: { "recipes/salsa.json": null } });
    const res = await send("/api/save", { slug: "salsa", recipe: r, baseSha: sha });
    expect(res.status).toBe(409);
  });

  it("a change to another recipe on main doesn't block the save, and the index keeps it", async () => {
    const { recipe: r, sha } = await open("salsa");
    const butter = { ...RECIPES["garlic-butter"], description: "Changed on the computer." };
    await post("/repo/commit", { files: {
      "recipes/garlic-butter.json": JSON.stringify(butter),
      "recipes/index.json": indexFile({ ...RECIPES, "garlic-butter": butter }),
    } });

    const res = await send("/api/save", { slug: "salsa", recipe: { ...r, description: "Mine." }, baseSha: sha });
    expect(res.status).toBe(200);
    const index = JSON.parse((await repo()).files["recipes/index.json"]);
    expect(index.find((e) => e.slug === "garlic-butter").description).toBe("Changed on the computer.");
    expect(index.find((e) => e.slug === "salsa").description).toBe("Mine.");
  });

  it("when main moves during the save, it tries once more from the new main", async () => {
    const { recipe: r, sha } = await open("salsa");
    const butter = { ...RECIPES["garlic-butter"], description: "Landed mid-save." };
    await post("/repo/race", { files: {
      "recipes/garlic-butter.json": JSON.stringify(butter),
      "recipes/index.json": indexFile({ ...RECIPES, "garlic-butter": butter }),
    }, message: "Landed mid-save" });

    const res = await send("/api/save", { slug: "salsa", recipe: { ...r, description: "Mine." }, baseSha: sha });
    expect(res.status).toBe(200);
    const after = await repo();
    expect(after.history.slice(0, 2).map((c) => c.message)).toEqual(["Edit Salsa", "Landed mid-save"]);
    const index = JSON.parse(after.files["recipes/index.json"]);
    expect(index.find((e) => e.slug === "garlic-butter").description).toBe("Landed mid-save.");
    expect(index.find((e) => e.slug === "salsa").description).toBe("Mine.");
  });

  it("when main keeps moving, it gives up after the second try, with nothing committed", async () => {
    const { recipe: r, sha } = await open("salsa");
    for (const n of [1, 2]) await post("/repo/race", { files: { "README.md": `Change ${n}\n` }, message: `Race ${n}` });
    const res = await send("/api/save", { slug: "salsa", recipe: r, baseSha: sha });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/changed since you opened it/);
    expect((await repo()).history.map((c) => c.message).slice(0, 3)).toEqual(["Race 2", "Race 1", "Start"]);
  });

  it("a recipe that fails the checks is refused, saying why, with nothing committed", async () => {
    const before = await repo();
    const { recipe: r, sha } = await open("salsa");
    const res = await send("/api/save", { slug: "salsa", recipe: { ...r, title: "", steps: [{ do: "Mix.", uses: ["Lime"] }] }, baseSha: sha });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.problems).toContain(`missing "title"`);
    expect(body.problems).toContain(`step 1 uses "Lime", which isn't one of the ingredients`);
    expect((await repo()).main).toBe(before.main);
  });

  it("a link to a recipe that doesn't exist is refused", async () => {
    const { recipe: r, sha } = await open("salsa");
    const linked = { ...r, ingredients: [...r.ingredients, { item: "Hot sauce", recipe: "hot-sauce" }] };
    const res = await send("/api/save", { slug: "salsa", recipe: linked, baseSha: sha });
    expect(res.status).toBe(422);
    expect((await res.json()).problems).toEqual([`"Hot sauce" links to recipe "hot-sauce", which doesn't exist`]);
  });

  it("a link that makes a loop is refused", async () => {
    const { recipe: r, sha } = await open("garlic-butter");
    const loop = { ...r, ingredients: [...r.ingredients, { item: "Garlic bread", recipe: "garlic-bread" }] };
    const res = await send("/api/save", { slug: "garlic-butter", recipe: loop, baseSha: sha });
    expect(res.status).toBe(422);
    expect((await res.json()).problems).toEqual(["recipe links loop: garlic-bread → garlic-butter → garlic-bread"]);
  });

  // A title from an imported page can hold anything: the commit message keeps
  // only its first line, without control characters, at most 72 characters.
  it("commits with the title on one short line", async () => {
    for (const [slug, title, message] of [
      ["two-lines", "Rice\nCo-authored-by: Someone <a@b.example>", "Add Rice"],
      ["tabbed", "Rice\tand\u0007 beans", "Add Riceand beans"],
      ["long", "A".repeat(200), `Add ${"A".repeat(71)}…`],
      ["emoji", `${"A".repeat(70)}🍋🍋🍋`, `Add ${"A".repeat(70)}🍋…`],
      ["other-breaks", "Rice\u0085and\u2028 beans", "Add Riceand beans"],
      ["blank-first", "\nRice", "Add blank-first"],
    ]) {
      const res = await send("/api/save", { slug, recipe: recipe({ title }) });
      expect(res.status, slug).toBe(200);
      expect((await repo()).history[0].message, slug).toBe(message);
    }
  });

  // From the save law: shapes the checker can't even read are refused, not a 500.
  it("refuses a recipe the checker can't read, with nothing committed", async () => {
    const before = await repo();
    for (const r of [
      { title: {}, category: null, ingredients: ["1 cup rice"], steps: 0, tags: { ingredients: ["rice"] }, time: [], image: { toString: null } },
      recipe({ ingredients: [{ qty: { toString: null }, item: "Rice" }] }),
    ]) {
      const res = await send("/api/save", { slug: "odd", recipe: r });
      expect(res.status, JSON.stringify(r)).toBe(422);
      expect((await res.json()).error).toMatch(/problems to fix/);
    }
    expect((await repo()).main).toBe(before.main);
  });

  it("someone who can't push to the repo is told so, with nothing committed", async () => {
    const before = await repo();
    const { b: looker } = await signIn("looker");
    const { recipe: r, sha } = await open("salsa", looker);
    const res = await send("/api/save", { slug: "salsa", recipe: r, baseSha: sha }, looker);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("This account can't edit this site.");
    expect((await repo()).main).toBe(before.main);
  });

  it("asks you to sign in again when GitHub won't renew the token", async () => {
    const { b: lapsing } = await signIn("lapsing");
    const { recipe: r, sha } = await open("salsa", lapsing);
    await fake("/expire?who=lapsing", { method: "POST" });
    await env.DB.prepare(`update "account" set "accessTokenExpiresAt" = ?`).bind(new Date(Date.now() - 60_000).toISOString()).run();
    const res = await send("/api/save", { slug: "salsa", recipe: r, baseSha: sha }, lapsing);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/sign in again/i);
  });

  it("refuses what isn't a recipe to save", async () => {
    for (const body of [{ slug: "Salsa!", recipe: RECIPES.salsa }, { slug: "salsa" }, { slug: "salsa", recipe: [] }, { slug: "index", recipe: RECIPES.salsa }]) {
      const res = await send("/api/save", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const res = await b.fetch("/api/save", { method: "POST", body: "not json" });
    expect(res.status).toBe(400);
  });

  it("refuses a save sent from another site", async () => {
    const res = await b.fetch("/api/save", { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}" });
    expect(res.status).toBe(403);
  });

  it("only takes POST", async () => {
    expect((await b.fetch("/api/save")).status).toBe(405);
  });

  it("stays well within the free plan's 50 requests to other sites, even when it tries twice", async () => {
    const { recipe: r, sha } = await open("salsa");
    await post("/repo/race", { files: { "README.md": "Moved\n" } });
    const before = (await (await fake("/calls?who=saver")).json()).calls;
    expect((await send("/api/save", { slug: "salsa", recipe: r, baseSha: sha })).status).toBe(200);
    const used = (await (await fake("/calls?who=saver")).json()).calls - before;
    expect(used).toBeLessThanOrEqual(25);
  });
});

describe("POST /api/delete", () => {
  it("removes the file and its index entry together, in one commit", async () => {
    const { sha } = await open("salsa");
    const res = await send("/api/delete", { slug: "salsa", baseSha: sha });
    expect(res.status).toBe(200);
    const after = await repo();
    expect(after.history[0]).toMatchObject({ message: "Delete Salsa", changed: ["recipes/index.json", "recipes/salsa.json"] });
    expect(after.files["recipes/salsa.json"]).toBeUndefined();
    expect(after.files["recipes/index.json"]).toBe(indexFile(recipesOn(after)));
  });

  it("refuses to delete a recipe another links to, naming it, with nothing committed", async () => {
    const before = await repo();
    const { sha } = await open("garlic-butter");
    const res = await send("/api/delete", { slug: "garlic-butter", baseSha: sha });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe(`Garlic Bread uses this recipe for its "Garlic butter". Take that link out first.`);
    expect(body.usedBy).toEqual([{ slug: "garlic-bread", title: "Garlic Bread", item: "Garlic butter" }]);
    expect((await repo()).main).toBe(before.main);
  });

  it("refuses to delete a recipe changed since it was opened", async () => {
    const { recipe: r, sha } = await open("salsa");
    await post("/repo/commit", { files: { "recipes/salsa.json": JSON.stringify({ ...r, yield: "Serves 2" }) } });
    const res = await send("/api/delete", { slug: "salsa", baseSha: sha });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/changed since you opened it/);
  });

  it("needs the version that was opened", async () => {
    expect((await send("/api/delete", { slug: "salsa" })).status).toBe(400);
  });
});

describe("formatRecipe", () => {
  it("keeps short lists of words and numbers on one line, and everything else as JSON.stringify lays it out", () => {
    const r = { title: "X", tags: { course: ["protein"], ingredients: ["chicken", "chile"] }, steps: [{ do: "Go.", uses: ["A", "B"] }], empty: [] };
    expect(formatRecipe(r)).toBe(`{
  "title": "X",
  "tags": {
    "course": ["protein"],
    "ingredients": ["chicken", "chile"]
  },
  "steps": [
    {
      "do": "Go.",
      "uses": ["A", "B"]
    }
  ],
  "empty": []
}
`);
    expect(JSON.parse(formatRecipe(RECIPES["garlic-bread"]))).toEqual(RECIPES["garlic-bread"]);
  });

  it("puts a long list one item to a line", () => {
    const long = Array.from({ length: 12 }, (_, i) => `ingredient number ${i}`);
    expect(formatRecipe({ uses: long })).toBe(JSON.stringify({ uses: long }, null, 2) + "\n");
  });
});

// Laws: who can change main, on random saves and deletes. Here rather than in
// access-laws.test.js because they need this file's repository; the seed works
// the same way (ACCESS_SEED=<seed> replays it).
const seed = Number(env.ACCESS_SEED) || Date.now() % 2 ** 31;
describe(`who can change main: laws (seed ${seed})`, { timeout: 30_000 }, () => {
  const opts = { numRuns: 40, seed };
  // A save or delete: of a recipe that's there or a new one, with its current
  // version or none.
  const change = fc.record({
    path: fc.constantFrom("/api/save", "/api/delete"),
    slug: fc.oneof(fc.constantFrom(...Object.keys(RECIPES)), fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/)),
    title: fc.constantFrom("Test Recipe", "Green Salsa", "Rice"),
    withSha: fc.boolean(),
  });
  const bodyOf = async ({ path, slug, title, withSha }) => {
    const baseSha = withSha ? (await repo()).shas[`recipes/${slug}.json`] : undefined;
    return path === "/api/save" ? { slug, recipe: recipe({ title }), baseSha } : { slug, baseSha };
  };
  // Any other site's address, or none.
  const elsewhere = fc.oneof(
    fc.constantFrom("", "null", "https://evil.example", "http://shaken-stirred-sauteed.com", "https://shaken-stirred-sauteed.com.evil.example"),
    fc.webUrl().map((u) => new URL(u).origin),
  ).filter((o) => o !== SITE);

  it("someone who can't push never changes main, whatever they send", async () => {
    const { b: looker } = await signIn("looker");
    await fc.assert(fc.asyncProperty(change, async (c) => {
      const before = (await repo()).main;
      const res = await send(c.path, await bodyOf(c), looker);
      expect(res.ok, `${c.path} ${JSON.stringify(c)}`).toBe(false);
      expect((await repo()).main).toBe(before);
    }), opts);
  });

  // A recipe whose fields are any JSON at all: wrong types, nesting, nulls.
  const anyRecipe = fc.record({
    title: fc.jsonValue(), category: fc.oneof(fc.constant("cooking"), fc.jsonValue()),
    ingredients: fc.oneof(fc.constant(["1 cup rice"]), fc.jsonValue()), steps: fc.oneof(fc.constant(["Cook the rice."]), fc.jsonValue()),
    tags: fc.oneof(fc.constant({ ingredients: ["rice"] }), fc.jsonValue()), time: fc.oneof(fc.constant({ total: 20 }), fc.jsonValue()),
    image: fc.jsonValue(), source: fc.jsonValue(), description: fc.jsonValue(),
    glass: fc.jsonValue(), garnish: fc.jsonValue(), origin: fc.jsonValue(), kind: fc.jsonValue(), yield: fc.jsonValue(),
  }, { requiredKeys: ["title", "category", "ingredients", "steps", "tags", "time"] });
  it("no recipe an editor sends breaks the Worker: a save never answers 500", async () => {
    await fc.assert(fc.asyncProperty(fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/), anyRecipe, async (slug, r) => {
      const res = await send("/api/save", { slug, recipe: r });
      expect(res.status, `save ${JSON.stringify(r)}`).not.toBe(500);
      expect(res.status, "still signed in").not.toBe(401);
    }), opts);
  });

  it("an editor's changes only count from the site's own pages", async () => {
    await fc.assert(fc.asyncProperty(change, elsewhere, async (c, origin) => {
      const before = (await repo()).main;
      const res = await b.fetch(c.path, {
        method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(await bodyOf(c)),
      });
      expect(res.status, `${c.path} from "${origin}"`).toBe(403);
      expect((await repo()).main).toBe(before);
    }), opts);
  });
});
