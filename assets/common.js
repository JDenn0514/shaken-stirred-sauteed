// Shared helpers for the home page and recipe page.
window.SSS = (() => {
  const CATEGORIES = {
    baking:    { label: "Baking",    emoji: "🥖" },
    cooking:   { label: "Cooking",   emoji: "🍳" },
    cocktails: { label: "Cocktails", emoji: "🍸" },
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

  // Pages that live in a subfolder (e.g. style-guide previews) set
  // <html data-root="../../"> so data still loads from the site root.
  const ROOT = document.documentElement.dataset.root || "";

  async function getJSON(url) {
    url = ROOT + url;
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${res.status} loading ${url}`);
    return res.json();
  }

  // Offline support once the site is installed / visited.
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // Ingredients, steps and notes may be a flat list of entries, or a list of
  // { "group": "For the sauce", "items": [...] } sections (or a mix).
  function toGroups(list = []) {
    const groups = [];
    for (const entry of list) {
      if (entry && Array.isArray(entry.items)) {
        groups.push({ group: entry.group || "", items: entry.items });
      } else if (entry) {
        if (!groups.length || groups[groups.length - 1].group) groups.push({ group: "", items: [] });
        groups[groups.length - 1].items.push(entry);
      }
    }
    return groups;
  }

  return { CATEGORIES, esc, fmtMinutes, totalMinutes, getJSON, toGroups };
})();
