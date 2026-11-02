// Preview-only: gives every recipe its own icon without touching the site's JS.
//
// Adds data-icon="<key>" plus an empty <span class="card-icon"> to each home
// card, and data-icon plus <span class="recipe-icon"> (before the h1) on the
// recipe page. Each theme draws the icons itself in icons/<key>.svg and shows
// them with CSS masks, so the same keys work in every direction.
//
// On adoption this logic moves into scripts/build-index.mjs (writing an `icon`
// field into recipes/index.json) and home.js / recipe.js render the span.
(() => {
  const ROOT = document.documentElement.dataset.root || "";

  // Every icon a theme must draw.
  const KEYS = [
    // baking
    "loaf", "donut", "tart", "bars", "cake", "ramekin", "jar",
    // cooking
    "soup", "salad", "sauce", "rice-bowl", "grill", "sheet-pan", "sandwich",
    "chicken", "potato", "greens", "corn", "pasta", "garlic", "apple", "mug",
    // cocktails (glassware)
    "highball", "coupe", "nick-nora", "rocks", "martini", "tiki-mug", "bottle",
  ];

  // Per-recipe choices. A recipe's own "icon" field would override these.
  const BY_SLUG = {
    "babkallah": "loaf",
    "dense-apple-cider-donuts": "donut",
    "fluffy-apple-cider-donuts": "donut",
    "lemon-blueberry-tart": "tart",
    "minty-lime-bars": "bars",
    "pavlova": "cake",
    "dark-chocolate-cremeux": "ramekin",
    "lemon-curd": "jar",
    "best-lentil-soup": "soup",
    "italian-wedding-soup-with-acini-di-pepe": "soup",
    "chicken-shawarma-salad": "salad",
    "easy-asian-cucumber-salad": "salad",
    "israeli-salad": "salad",
    "grilled-corn-salad-with-avocado": "corn",
    "chimichurri-sauce": "sauce",
    "green-tahini-sauce": "sauce",
    "spicy-thai-peanut-sauce": "sauce",
    "tahini-yogurt-sauce": "sauce",
    "garlic-paste": "garlic",
    "congee-with-crispy-chili-pork": "rice-bowl",
    "lu-rou-fan": "rice-bowl",
    "risotto-milanese": "rice-bowl",
    "carne-asada": "grill",
    "sheet-pan-chicken-shawarma": "sheet-pan",
    "sheet-pan-chicken-shawarma-havarti-sandwich": "sandwich",
    "hot-honey-chicken": "chicken",
    "hasselback-potatoes": "potato",
    "lemon-butter-parmesan-asparagus": "greens",
    "pan-fried-broccolini-lemon-dressed": "greens",
    "homemade-acini-di-pepe": "pasta",
    "microwave-applesauce": "apple",
    "homemade-apple-cider": "mug",
    "painkiller": "highball",
    "zombie": "tiki-mug",
    "corpse-reviver-no-2": "coupe",
    "grenadine": "bottle",
  };

  // Fallback rules for recipes added later.
  const GLASS = [[/nick|nora/i, "nick-nora"], [/tiki/i, "tiki-mug"], [/highball|collins/i, "highball"],
    [/coupe/i, "coupe"], [/martini/i, "martini"], [/rocks|old.?fashioned/i, "rocks"]];
  const BAKING_TYPE = { "cakes": "cake", "cookies-bars": "bars", "pies-tarts": "tart", "breads": "loaf",
    "pastry": "loaf", "breakfast-bakes": "donut", "fillings-creams": "jar" };
  const COURSE = { "soup": "soup", "salad": "salad", "sauce": "sauce", "base": "pasta", "drink": "mug",
    "protein": "chicken", "side": "greens", "full-meal": "rice-bowl", "sweet": "apple", "breakfast": "loaf" };

  function iconFor(r) {
    if (!r) return null;
    if (r.icon && KEYS.includes(r.icon)) return r.icon;
    if (BY_SLUG[r.slug]) return BY_SLUG[r.slug];
    const f = r.facets || r.tags || {};
    if (r.category === "cocktails") {
      if (r.glass) for (const [re, k] of GLASS) if (re.test(r.glass)) return k;
      return r.kind === "component" ? "bottle" : "rocks";
    }
    if (r.category === "baking") for (const t of f.type || []) if (BAKING_TYPE[t]) return BAKING_TYPE[t];
    if (r.category === "cooking") for (const c of f.course || []) if (COURSE[c]) return COURSE[c];
    return { baking: "loaf", cooking: "soup", cocktails: "rocks" }[r.category] || null;
  }

  const getJSON = (u) => fetch(ROOT + u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const slugOf = (href) => { try { return new URL(href, location.href).searchParams.get("r"); } catch { return null; } };

  function addSpan(parent, cls, before) {
    if (!parent || parent.querySelector(":scope > ." + cls)) return;
    const s = document.createElement("span");
    s.className = cls;
    s.setAttribute("aria-hidden", "true");
    parent.insertBefore(s, before || parent.firstChild);
  }

  const grid = document.getElementById("grid");
  if (grid) {
    getJSON("recipes/index.json").then((list) => {
      const bySlug = Object.fromEntries((list || []).map((r) => [r.slug, r]));
      const paint = () => grid.querySelectorAll("a.card:not([data-icon])").forEach((a) => {
        const key = iconFor(bySlug[slugOf(a.getAttribute("href"))]);
        if (!key) return;
        a.dataset.icon = key;
        addSpan(a.querySelector(".card-body") || a, "card-icon");
      });
      paint();
      new MutationObserver(paint).observe(grid, { childList: true, subtree: true });
    });
  }

  const recipe = document.getElementById("recipe");
  if (recipe) {
    const slug = new URLSearchParams(location.search).get("r") || "";
    getJSON(`recipes/${slug}.json`).then((r) => {
      const key = iconFor(r && Object.assign({ slug }, r));
      if (!key) return;
      const paint = () => {
        const h1 = recipe.querySelector("h1");
        if (!h1) return;
        recipe.dataset.icon = key;
        addSpan(h1.parentNode, "recipe-icon", h1);
      };
      paint();
      new MutationObserver(paint).observe(recipe, { childList: true, subtree: true });
    });
  }
})();
