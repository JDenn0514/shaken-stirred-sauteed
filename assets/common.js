// Shared helpers for the home page and recipe page.
window.SSS = (() => {
  const CATEGORIES = {
    baking:    { label: "Baking",    emoji: "🥖" },
    cooking:   { label: "Cooking",   emoji: "🍳" },
    cocktails: { label: "Cocktails", emoji: "🍸" },
  };

  // Display names for the classification keys printed on the recipe cards
  // (see the card generator's AROMAS / ROLES / FLAVORS / FAMILIES tables).
  const LABELS = {
    aroma: {
      soy_ginger_ferment: "Soy, ginger & ferment",
      fish_sauce_lime_lemongrass: "Fish sauce, lime & lemongrass",
      toasted_spice_ghee: "Toasted spice & ghee",
      sumac_tahini_lemon: "Sumac, tahini & preserved lemon",
      berbere_peanut_chile: "Berbere, peanut & smoked chile",
      chile_lime_corn: "Chile, lime & corn",
      olive_tomato_herb: "Olive oil, tomato & herb",
      butter_cream_wine: "Butter, cream & wine",
      smoke_sugar_vinegar: "Smoke, sugar & vinegar",
      sugar_butter_flour: "Sugar, butter & flour",
      salt_fat_fire: "Salt, fat & fire",
      fruit_sugar: "Fruit & sugar",
    },
    role: {
      protein_main: "Protein main",
      vegetable_main: "Vegetable main",
      grain_noodle: "Grain & noodle",
      salad_raw_side: "Salad & raw side",
      sauce_condiment: "Sauce & condiment",
      bread_baked: "Bread & baked",
      sweet: "Sweet",
    },
    bakeFlavor: { sweet: "Sweet", savory: "Savory", both: "Sweet & savory" },
    drinkFlavor: {
      bright_tart: "Bright & tart",
      rich_boozy: "Rich & boozy",
      dry_aromatic: "Dry & aromatic",
      bitter: "Bitter",
      fresh_herbal: "Fresh & herbal",
      fruity_tropical: "Fruity & tropical",
      light_bubbly: "Light & bubbly",
      smoke_spice: "Smoke & spice",
      creamy_dessert: "Creamy & dessert",
      simple_sweet: "Simple & sweet",
    },
    family: {
      sour: "Sour",
      stirred: "Stirred",
      highball_sparkling: "Highball & sparkling",
      tiki_punch: "Tiki & punch",
      flip_cream: "Flip & cream",
      component: "Component",
    },
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  // 75 -> "1 hr 15 min"
  function fmtMinutes(m) {
    if (!m && m !== 0) return "";
    m = Math.round(Number(m));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} hr ${r} min` : `${h} hr`;
  }

  function totalMinutes(time) {
    if (!time) return null;
    if (time.total != null) return time.total;
    const parts = [time.prep, time.cook, time.chill, time.rest].filter((x) => x != null);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  }

  async function getJSON(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${res.status} loading ${url}`);
    return res.json();
  }

  // Offline support once the site is installed / visited.
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  return { CATEGORIES, LABELS, esc, fmtMinutes, totalMinutes, getJSON };
})();
