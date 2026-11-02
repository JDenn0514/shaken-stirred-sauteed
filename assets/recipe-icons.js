// Picks the drawing shown on each recipe's card and page.
// A recipe can name one with an "icon" field; otherwise it comes from the
// cocktail's glass, the baking type or the cooking course. The drawings live in
// assets/icons/<key>.svg. Used by the site (window.SSSIcons) and by
// scripts/build-index.mjs, which checks the field and writes "icon" into index.json.
(function (root) {
  const KEYS = [
    // baking
    "loaf", "donut", "tart", "bars", "cake", "ramekin", "jar",
    // cooking
    "soup", "salad", "sauce", "rice-bowl", "grill", "sheet-pan", "sandwich",
    "chicken", "potato", "greens", "corn", "pasta", "garlic", "apple", "mug",
    // cocktails (glassware)
    "highball", "coupe", "nick-nora", "rocks", "martini", "tiki-mug", "bottle",
  ];

  const GLASS = [[/nick|nora/i, "nick-nora"], [/tiki/i, "tiki-mug"], [/highball|collins/i, "highball"],
    [/coupe/i, "coupe"], [/martini/i, "martini"], [/rocks|old.?fashioned/i, "rocks"]];
  const BAKING_TYPE = { "cakes": "cake", "cookies-bars": "bars", "pies-tarts": "tart", "breads": "loaf",
    "pastry": "loaf", "breakfast-bakes": "donut", "fillings-creams": "jar" };
  // Checked in this order, so a "salad" that is also a "full-meal" gets the salad bowl.
  const COURSE = [["soup", "soup"], ["salad", "salad"], ["sauce", "sauce"], ["base", "pasta"], ["drink", "mug"],
    ["breakfast", "loaf"], ["protein", "chicken"], ["full-meal", "rice-bowl"], ["side", "greens"], ["sweet", "apple"]];
  const FALLBACK = { baking: "loaf", cooking: "soup", cocktails: "rocks" };

  // r: a recipe (its JSON), or an index entry (which has "facets" instead of "tags").
  function iconFor(r) {
    if (!r) return null;
    if (r.icon && KEYS.includes(r.icon)) return r.icon;
    const t = r.tags || r.facets || {};
    if (r.category === "cocktails") {
      if (r.glass) for (const [re, k] of GLASS) if (re.test(r.glass)) return k;
      if (r.kind === "component") return "bottle";
    }
    if (r.category === "baking") for (const v of t.type || []) if (BAKING_TYPE[v]) return BAKING_TYPE[v];
    if (r.category === "cooking") for (const [c, k] of COURSE) if ((t.course || []).includes(c)) return k;
    return FALLBACK[r.category] || null;
  }

  const api = { KEYS, iconFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SSSIcons = api;
})(this);
