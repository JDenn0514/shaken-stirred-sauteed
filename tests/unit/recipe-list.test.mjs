// The recipes page's list (assets/recipe-list.mjs): search, sections,
// filters, sorting, and keeping them in the URL. recipes.html only draws what
// these return. Uses a small made-up index and vocabulary, shaped like
// recipes/index.json and recipes/vocabulary.json, so new recipes or tags never
// change these results.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as L from "../../assets/recipe-list.mjs";

const entry = (slug, title, category, facets, extra = {}) => ({
  slug, title, category, facets, search: `${title} ${extra.words || ""}`.toLowerCase(),
  added: extra.added || "", totalMinutes: extra.totalMinutes ?? null,
});
const RECIPES = [
  entry("thai-basil-chicken", "Thai Basil Chicken", "cooking", { cuisine: ["thai"], ingredients: ["chicken"], time: ["under-30", "under-60"] },
    { words: "thai chicken thighs basil", added: "2026-01-03", totalMinutes: 25 }),
  entry("chicken-tinga", "Chicken Tinga", "cooking", { cuisine: ["mexican"], ingredients: ["chicken", "chile"], time: ["under-60"] },
    { words: "mexican chicken breast chipotles", added: "2026-01-10", totalMinutes: 45 }),
  entry("pork-carnitas", "Pork Carnitas", "cooking", { cuisine: ["mexican"], ingredients: ["pork"] },
    { words: "mexican pork shoulder orange", added: "2026-02-01", totalMinutes: 180 }),
  entry("salsa-verde", "Salsa Verde", "cooking", { cuisine: ["mexican"], ingredients: ["fresh-herbs"] },
    { words: "mexican tomatillos cilantro" }),
  entry("lemon-bars", "Lemon Bars", "baking", { type: ["bars"], ingredients: ["lemon"] },
    { words: "flour sugar butter lemon", added: "2026-03-01", totalMinutes: 90 }),
  entry("daiquiri", "Daiquiri", "cocktails", { spirit: ["rum"], ingredients: ["lime"], time: ["under-30", "under-60"] },
    { words: "rum lime", totalMinutes: 5 }),
];
const SECTIONS = ["baking", "cooking", "cocktails"];
const DIMS = [
  { key: "cuisine", label: "Cuisine", sections: ["cooking"], values: [{ key: "thai", label: "Thai" }, { key: "mexican", label: "Mexican" }] },
  { key: "type", label: "Type", sections: ["baking"], values: [{ key: "bars", label: "Bars" }, { key: "cake", label: "Cake" }] },
  { key: "spirit", label: "Base spirit", sections: ["cocktails"], values: [{ key: "rum", label: "Rum" }] },
  { key: "flavor", label: "Flavor", sections: ["baking", "cooking"], valuesBySection: {
    cooking: [{ key: "smoky", label: "Smoky" }], baking: [{ key: "tart", label: "Tart" }],
  } },
  { key: "ingredients", label: "Ingredients", shared: true, sections: SECTIONS, groups: [
    { label: "Proteins", values: [{ key: "chicken", label: "Chicken" }, { key: "pork", label: "Pork" }] },
    { label: "Produce", values: [{ key: "chile", label: "Chile" }, { key: "fresh-herbs", label: "Fresh herbs" }, { key: "lemon", label: "Lemon" }, { key: "lime", label: "Lime" }] },
  ] },
  { key: "time", label: "Time", shared: true, sections: SECTIONS, computed: "From the total time.",
    values: [{ key: "under-30", label: "Under 30 min" }, { key: "under-60", label: "Under 1 hour" }] },
  { key: "diet", label: "Diet", shared: true, sections: SECTIONS, values: [{ key: "vegan", label: "Vegan" }] },
];

const state = (s = {}) => L.readState(new URLSearchParams(s), DIMS);
const titles = (s) => L.results(RECIPES, typeof s === "string" ? state(s) : s).map((r) => r.title);

describe("search", () => {
  test("finds a recipe by name", () => assert.deepEqual(titles("q=carnitas"), ["Pork Carnitas"]));
  test("finds a recipe by an ingredient line", () => assert.deepEqual(titles("q=tomatillo"), ["Salsa Verde"]));
  test("ignores capitals", () => assert.deepEqual(titles("q=CARNITAS"), ["Pork Carnitas"]));
  test("with several words, finds recipes that match all of them", () =>
    assert.deepEqual(titles("q=chicken mexican"), ["Chicken Tinga"]));
  test("finds nothing when nothing matches", () => assert.deepEqual(titles("q=zzzz"), []));
});

describe("sorting", () => {
  test("A–Z is the default", () =>
    assert.deepEqual(titles(""), ["Chicken Tinga", "Daiquiri", "Lemon Bars", "Pork Carnitas", "Salsa Verde", "Thai Basil Chicken"]));
  test("Newest puts recipes without a date last, A–Z", () =>
    assert.deepEqual(titles("sort=new"), ["Lemon Bars", "Pork Carnitas", "Chicken Tinga", "Thai Basil Chicken", "Daiquiri", "Salsa Verde"]));
  test("Quickest puts recipes without a time last", () =>
    assert.deepEqual(titles("sort=quick"), ["Daiquiri", "Thai Basil Chicken", "Chicken Tinga", "Lemon Bars", "Pork Carnitas", "Salsa Verde"]));
  test("leaves the list it was given alone", () => {
    const before = RECIPES.map((r) => r.slug);
    L.results(RECIPES, state("sort=quick"));
    assert.deepEqual(RECIPES.map((r) => r.slug), before);
  });
});

describe("sections", () => {
  test("show only that section's recipes", () => assert.deepEqual(titles("cat=cocktails"), ["Daiquiri"]));
  test("All shows every section", () => assert.equal(titles("cat=all").length, 6));
});

describe("filters", () => {
  test("several options in one filter widen the results", () =>
    assert.deepEqual(titles("cat=cooking&cuisine=thai,mexican"), ["Chicken Tinga", "Pork Carnitas", "Salsa Verde", "Thai Basil Chicken"]));
  test("filters together narrow the results", () =>
    assert.deepEqual(titles("cat=cooking&cuisine=mexican&ingredients=chicken"), ["Chicken Tinga"]));
  test("the time filter uses the time worked out from the total", () =>
    assert.deepEqual(titles("cat=cooking&time=under-30"), ["Thai Basil Chicken"]));
  test("shared filters apply in every section, and in All", () =>
    assert.deepEqual(titles("ingredients=chicken"), ["Chicken Tinga", "Thai Basil Chicken"]));
  test("work with search", () => assert.deepEqual(titles("cat=cooking&cuisine=mexican&q=pork"), ["Pork Carnitas"]));
});

describe("reading the URL", () => {
  test("reads the section, search, sort and picks", () =>
    assert.deepEqual(state("cat=cooking&cuisine=mexican,thai&q=chicken&sort=quick"),
      { cat: "cooking", q: "chicken", sort: "quick", sel: { cuisine: ["mexican", "thai"] } }));
  test("with nothing in it, shows everything A–Z", () => assert.deepEqual(state(""), { cat: "all", q: "", sort: "az", sel: {} }));
  test("drops a filter from another section", () => assert.deepEqual(state("cat=baking&cuisine=thai").sel, {}));
  test("drops a section's own filter in All", () => assert.deepEqual(state("cuisine=thai").sel, {}));
  test("drops values the filter doesn't have, and keeps the rest", () =>
    assert.deepEqual(state("cat=cooking&cuisine=thai,klingon&diet=").sel, { cuisine: ["thai"] }));
  test("drops a per-section value from another section", () =>
    assert.deepEqual(state("cat=cooking&flavor=tart,smoky").sel, { flavor: ["smoky"] }));
  test("ignores an unknown section or sort", () => {
    assert.equal(state("cat=snacks").cat, "all");
    assert.equal(state("sort=random").sort, "az");
  });
});

describe("writing the URL", () => {
  test("keeps the section, picks (in the filters' order), search and sort", () =>
    assert.equal(L.toQuery({ cat: "cooking", q: "chicken", sort: "quick", sel: { ingredients: ["chicken"], cuisine: ["mexican", "thai"] } }, DIMS),
      "cat=cooking&cuisine=mexican,thai&ingredients=chicken&q=chicken&sort=quick"));
  test("leaves out what's as it starts: All, no search, A–Z", () => assert.equal(L.toQuery(state(""), DIMS), ""));
  test("reads back as the same state", () => {
    const s = { cat: "cooking", q: "pork & beans", sort: "new", sel: { cuisine: ["thai", "mexican"], time: ["under-60"] } };
    assert.deepEqual(L.readState(new URLSearchParams(L.toQuery(s, DIMS)), DIMS), s);
  });
});

describe("changes", () => {
  test("picking a section keeps the search, sort and shared picks, and drops the old section's own", () =>
    assert.deepEqual(L.pickSection(state("cat=cooking&cuisine=thai&ingredients=chicken&q=a&sort=new"), DIMS, "baking"),
      { cat: "baking", q: "a", sort: "new", sel: { ingredients: ["chicken"] } }));
  test("toggling an option turns it on, after the others", () =>
    assert.deepEqual(L.toggle(state("cat=cooking&cuisine=thai"), "cuisine", "mexican").sel, { cuisine: ["thai", "mexican"] }));
  test("toggling it again turns it off, and an empty filter goes", () =>
    assert.deepEqual(L.toggle(state("cat=cooking&cuisine=thai"), "cuisine", "thai").sel, {}));
  test("Clear all turns every filter off, and keeps the rest", () =>
    assert.deepEqual(L.clearAll(state("cat=cooking&cuisine=thai&ingredients=pork&q=x")), { cat: "cooking", q: "x", sort: "az", sel: {} }));
  test("leave the state they were given alone", () => {
    const s = state("cat=cooking&cuisine=thai");
    L.toggle(s, "cuisine", "mexican");
    L.toggle(s, "cuisine", "thai");
    L.pickSection(s, DIMS, "baking");
    L.clearAll(s);
    assert.deepEqual(s, state("cat=cooking&cuisine=thai"));
  });
});

describe("section counts", () => {
  test("count every section's recipes, and All", () =>
    assert.deepEqual(L.sectionCounts(RECIPES, DIMS, state("")), { all: 6, baking: 1, cooking: 4, cocktails: 1 }));
  test("follow the search, but not the section or the filters", () =>
    assert.deepEqual(L.sectionCounts(RECIPES, DIMS, state("cat=cooking&cuisine=thai&q=chicken")), { all: 2, baking: 0, cooking: 2, cocktails: 0 }));
});

describe("the filters shown", () => {
  const shown = (s) => L.filters(RECIPES, DIMS, state(s));
  const option = (s, dim, key) => shown(s).find((d) => d.key === dim).groups.flatMap((g) => g.options).find((o) => o.key === key);

  test("All has only the shared filters, and only ones some recipe uses", () =>
    assert.deepEqual(shown("").map((d) => d.label), ["Ingredients", "Time"]));
  test("a section has its own filters as well", () =>
    assert.deepEqual(shown("cat=cooking").map((d) => d.label), ["Cuisine", "Ingredients", "Time"]));
  test("each option has its label and how many recipes it would show", () =>
    assert.deepEqual(option("cat=cooking", "cuisine", "mexican"), { key: "mexican", label: "Mexican", count: 3, on: false, disabled: false }));
  test("options keep their groups", () =>
    assert.deepEqual(shown("").find((d) => d.key === "ingredients").groups.map((g) => [g.label, g.options.length]), [["Proteins", 2], ["Produce", 4]]));
  test("a filter's counts ignore its own picks", () => {
    assert.deepEqual(option("cat=cooking&cuisine=mexican", "cuisine", "thai"), { key: "thai", label: "Thai", count: 1, on: false, disabled: false });
    assert.equal(option("cat=cooking&cuisine=mexican", "cuisine", "mexican").on, true);
  });
  test("but follow the other filters and the search", () => {
    assert.equal(option("cat=cooking&ingredients=pork", "cuisine", "mexican").count, 1);
    assert.equal(option("cat=cooking&q=carnitas", "cuisine", "mexican").count, 1);
  });
  test("an option that would show nothing is disabled", () =>
    assert.equal(option("cat=cooking&q=carnitas", "cuisine", "thai").disabled, true));
  test("unless it's picked, so it can be turned off", () =>
    assert.deepEqual(option("cat=cooking&cuisine=thai&q=carnitas", "cuisine", "thai"), { key: "thai", label: "Thai", count: 0, on: true, disabled: false }));
  test("say how many of their options are picked", () =>
    assert.deepEqual(shown("cat=cooking&cuisine=thai,mexican").map((d) => [d.key, d.picked]), [["cuisine", 2], ["ingredients", 0], ["time", 0]]));
});

describe("chips", () => {
  test("one per pick, in the filters' order, with the filter's and the option's labels", () =>
    assert.deepEqual(L.chips(DIMS, state("cat=cooking&ingredients=chicken&cuisine=thai,mexican")), [
      { dim: "cuisine", dimLabel: "Cuisine", value: "thai", label: "Thai" },
      { dim: "cuisine", dimLabel: "Cuisine", value: "mexican", label: "Mexican" },
      { dim: "ingredients", dimLabel: "Ingredients", value: "chicken", label: "Chicken" },
    ]));
  test("none when nothing is picked", () => assert.deepEqual(L.chips(DIMS, state("cat=cooking")), []));
});
