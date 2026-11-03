// Shared setup for every browser test:
// - the page only ever talks to the local test server; requests anywhere else are blocked
// - the site loads a small, fixed set of test recipes instead of the real ones, so tests
//   don't break when recipes are added. The index is built by the real build script.
import { test as base, expect } from "@playwright/test";
import { buildIndex, recipe } from "../helpers/build-index.mjs";

const RECIPES = {
  "thai-basil-chicken": recipe({
    title: "Thai Basil Chicken", added: "2026-01-03", time: { total: 25 },
    ingredients: ["1 lb chicken thighs", "1 cup Thai basil"],
    tags: { cuisine: ["thai"], course: ["full-meal"], ingredients: ["chicken"] },
  }),
  "chicken-tinga": recipe({
    title: "Chicken Tinga", added: "2026-01-10", time: { total: 45 },
    ingredients: ["2 lb chicken breast", "2 chipotles in adobo"],
    tags: { cuisine: ["mexican"], course: ["protein"], ingredients: ["chicken", "chile"] },
  }),
  // The fullest recipe: grouped lists, object-style entries, notes and a source.
  "pork-carnitas": recipe({
    title: "Pork Carnitas", added: "2026-02-01", time: { prep: 20, cook: 160 },
    description: "Slow-braised, then crisped.", yield: "Serves 6",
    beforeYouStart: ["Take the pork out of the fridge an hour ahead."],
    ingredients: [
      { grams: 1400, qty: "3 lb", item: "Pork shoulder", note: "in 2-inch chunks" },
      { group: "For the braise", items: ["1 orange", { qty: "2 tsp", item: "Kosher salt" }] },
    ],
    steps: [
      "Season the pork.",
      { do: "Braise until tender.", wait: "2 1/2 hours", cue: "Falls apart with a fork" },
      { group: "To finish", items: ["Shred the pork.", "Crisp it in a hot pan."] },
    ],
    notes: ["Freezes well."],
    source: { name: "Grandma", url: "https://example.com/carnitas" },
    tags: { cuisine: ["mexican"], course: ["protein"], ingredients: ["pork"] },
  }),
  "salsa-verde": recipe({
    title: "Salsa Verde", kind: "component", time: undefined,
    ingredients: ["1 lb tomatillos", "1 bunch cilantro"],
    tags: { cuisine: ["mexican"], course: ["sauce"], ingredients: ["fresh-herbs"] },
  }),
  // The cook-mode recipe: grouped steps that say which ingredients they use, a
  // name used twice ("Sugar"), one ingredient split across two steps, and waits.
  "lemon-bars": recipe({
    title: "Lemon Bars", category: "baking", added: "2026-03-01", time: { total: 90 },
    beforeYouStart: ["Heat the oven to 350°F."],
    ingredients: [
      { group: "Crust", items: [
        { grams: 125, qty: "1 cup", item: "Flour" },
        { grams: 50, qty: "1/4 cup", item: "Sugar" },
        { grams: 115, qty: "8 Tbsp", item: "Butter", note: "melted" },
      ] },
      { group: "Filling", items: [
        { grams: 200, qty: "1 cup", item: "Sugar" },
        { qty: "3 large", item: "Eggs" },
        { qty: "1/2 cup", item: "Lemon juice", note: "from 4 lemons" },
        "Powdered sugar, for dusting",
      ] },
    ],
    steps: [
      { group: "Crust", items: [
        { do: "Mix the flour, sugar and butter, and press into the pan.", uses: ["Flour", { group: "Crust", item: "Sugar" }, "Butter"] },
        { do: "Bake the crust.", wait: "15 to 18 min", cue: "Pale gold at the edges" },
      ] },
      { group: "Filling", items: [
        { do: "Whisk the sugar, eggs and half the lemon juice.", uses: [{ group: "Filling", item: "Sugar" }, "Eggs", { item: "Lemon juice", amount: "1/4 cup" }] },
        { do: "Whisk in the rest of the lemon juice.", uses: [{ item: "Lemon juice", amount: "the rest" }] },
        { do: "Pour over the crust and bake.", wait: "About 20 min", cue: "Set, with only a slight wobble" },
        { do: "Chill, then dust with powdered sugar.", wait: "At least 2 hr in the fridge", uses: ["Powdered sugar, for dusting"] },
      ] },
    ],
    notes: ["Keeps for 3 days in the fridge."],
    tags: { type: ["cookies-bars"], ingredients: ["lemon"] },
  }),
  daiquiri: recipe({
    title: "Daiquiri", category: "cocktails", added: "2025-12-01", time: { total: 5 }, standardDrinks: 1.5, glass: "Coupe",
    ingredients: ["2 oz white rum", "1 oz lime juice"],
    tags: { spirit: ["rum"], ingredients: ["lime"] },
  }),
};

const built = buildIndex(RECIPES);
if (!built.ok) throw new Error(`Test recipes don't pass the recipe checker:\n${built.output}`);
export const INDEX = built.index;

// Recipe files the page can open but that aren't in the index. This one would
// fail the recipe checker; it stands in for a bad file that slipped past it.
const PAGE_ONLY = {
  "sneaky-recipe": {
    title: `Sneaky <img src="x" class="injected">`,
    category: "cooking",
    description: `<b class="injected">bold</b>`,
    ingredients: [`<script class="injected">1</script> flour`],
    steps: [{ do: `<i class="injected">Stir</i>`, cue: `<u class="injected">done</u>` }],
    notes: [`<a class="injected" href="https://example.com">link</a>`],
    source: { name: "Bad link", url: "javascript:alert(1)" },
  },
};
// Every way the real recipes write a wait, one per step, for cook mode's timers.
// Each step's text is the timer its wait should get ("none" for no timer).
const WAITS = ["15 to 18 min", "About 20 min", "~90 min", "1 1/2 to 2 1/2 hr", "4 hr, ideally overnight",
  "30 min ice bath, then about 1 hr fridge", "10 min or more", "2 1/2 hours", "1 hr 15 min", "45 sec", "Until it sets"];
const TIMERS = ["15 min", "20 min", "1 hr 30 min", "1 hr 30 min", "4 hr", "30 min", "10 min", "2 hr 30 min", "1 hr 15 min", "45 sec", "none"];
PAGE_ONLY["every-wait"] = recipe({
  title: "Every Wait",
  steps: WAITS.map((wait, n) => ({ do: TIMERS[n], wait })),
});
const FILES = { ...RECIPES, ...PAGE_ONLY };

export const test = base.extend({
  // Serve the test recipes in place of the real ones. Turn off with
  // test.use({ testRecipes: false }) to check the real recipes.
  testRecipes: [true, { option: true }],
  page: async ({ page, baseURL, testRecipes }, use) => {
    const origin = new URL(baseURL).origin;
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort("blockedbyclient");
      if (testRecipes) {
        if (url.pathname.endsWith("/recipes/index.json")) return route.fulfill({ json: INDEX });
        const slug = /\/recipes\/([a-z0-9-]+)\.json$/.exec(url.pathname)?.[1];
        if (slug && slug !== "vocabulary") {
          return FILES[slug] ? route.fulfill({ json: FILES[slug] }) : route.fulfill({ status: 404 });
        }
      }
      return route.continue();
    });
    await use(page);
  },
});

export { expect };
