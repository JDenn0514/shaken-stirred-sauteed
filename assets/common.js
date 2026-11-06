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

  // Links only for the signed-in owner ("Add recipe") are hidden in the page
  // and shown here when the readable "signed-in" hint cookie is set. The hint
  // holds no secret; the editor checks the real sign-in before doing anything.
  const signedIn = document.cookie.split(/;\s*/).some((c) => c.startsWith("signed-in="));
  if (signedIn) document.querySelectorAll("[data-signed-in][hidden]").forEach((el) => { el.hidden = false; });

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

  // The order a recipe's steps are shown in, on its page and in cook mode
  // (docs/specs/meal-planner-design.md, "Prep first or as written"):
  // - prep first: the prep that can be done ahead (`prep: true`, and the added
  //   `prepOnly` steps) as a "Prep" stage, then the rest as written, under the
  //   recipe's own group names or "Cooking" ("Baking", "Mixing"). Prep marked
  //   "just before" stays where it's written.
  // - as written: the recipe's own steps, without the added `prepOnly` ones.
  // Returns { steps: [{ i, group }], differs }: i is the step's place in the
  // file, which is what progress is saved by, and `differs` is false when both
  // orders are the same, so a recipe page needs no switch. Then it's as written.
  const STAGE = { baking: "Baking", cocktails: "Mixing" };
  function stepOrder(r, prepFirst) {
    const all = toGroups(r.steps).flatMap((g) => g.items.map((s) => ({ group: g.group, s: typeof s === "string" ? {} : s })))
      .map((x, i) => ({ ...x, i }));
    const written = all.filter((x) => !x.s.prepOnly);
    const early = (x) => x.s.prep === true || x.s.prepOnly;
    const first = [...all.filter(early), ...all.filter((x) => !early(x))];
    const differs = first.map((x) => x.i).join() !== written.map((x) => x.i).join();
    const steps = prepFirst && differs
      ? first.map((x) => ({ i: x.i, group: early(x) ? "Prep" : x.group || STAGE[r.category] || "Cooking" }))
      : written.map((x) => ({ i: x.i, group: x.group }));
    return { steps, differs };
  }

  return { CATEGORIES, esc, fmtMinutes, totalMinutes, getJSON, toGroups, stepOrder, signedIn };
})();
