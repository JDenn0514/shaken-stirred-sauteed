// The recipes page's list (recipes.html): search, sections, filters, sorting,
// and keeping them in the URL, as plain data. assets/home.mjs draws what these
// return and turns clicks into the changes at the bottom.

// A state is { cat, q, sort, sel }: the section ("all" or a section key), the
// search, the sort ("az", "new" or "quick"), and the picks in each filter, as
// { dimension key: [value keys, in the order picked] }.

// Which filters a section has: its own and the shared ones; All has only the shared ones.
const dimsFor = (dims, cat) => dims.filter((d) => (cat === "all" ? d.shared : d.sections.includes(cat)));
// A filter's options in a section, as [{ label, values }] groups.
const groupsFor = (d, cat) => {
  if (d.valuesBySection) return cat === "all" ? [] : [{ label: "", values: d.valuesBySection[cat] || [] }];
  return d.groups || [{ label: "", values: d.values || [] }];
};
const valuesFor = (d, cat) => groupsFor(d, cat).flatMap((g) => g.values);

// Keeps only the picks the section has a filter and an option for.
function prune(sel, dims, cat) {
  const out = {};
  for (const d of dimsFor(dims, cat)) {
    const ok = new Set(valuesFor(d, cat).map((v) => v.key));
    const kept = (sel[d.key] || []).filter((v) => ok.has(v));
    if (kept.length) out[d.key] = kept;
  }
  return out;
}

// The state a URL like ?cat=cooking&cuisine=thai,mexican&q=&sort=new asks for.
export function readState(params, dims) {
  const sections = new Set(dims.flatMap((d) => d.sections));
  const cat = sections.has(params.get("cat")) ? params.get("cat") : "all";
  const sort = params.get("sort") in SORTS ? params.get("sort") : "az";
  const sel = Object.fromEntries(dims.map((d) => [d.key, (params.get(d.key) || "").split(",").filter(Boolean)]));
  return { cat, q: (params.get("q") || "").trim(), sort, sel: prune(sel, dims, cat) };
}

// Every word of the search is somewhere in the recipe's search text.
const matchesText = (r, q) => q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => r.search.includes(w));

const byTitle = (a, b) => a.title.localeCompare(b.title);
const SORTS = {
  az: byTitle,
  // Recipes without a date or a time go last.
  new: (a, b) => (b.added || "").localeCompare(a.added || "") || byTitle(a, b),
  quick: (a, b) => (a.totalMinutes ?? Infinity) - (b.totalMinutes ?? Infinity) || byTitle(a, b),
};

// The recipes to show, in order.
const inSection = (r, cat) => cat === "all" || r.category === cat;
// Any of a filter's picks, and every filter. `skip` leaves one filter out (for its own counts).
const matchesFilters = (r, sel, skip) => Object.entries(sel).every(([key, vals]) =>
  key === skip || !vals.length || (r.facets?.[key] || []).some((v) => vals.includes(v)));
const matches = (r, state, skip) => inSection(r, state.cat) && matchesText(r, state.q) && matchesFilters(r, state.sel, skip);

// The recipes to show, in order.
export function results(recipes, state) {
  return recipes.filter((r) => matches(r, state)).sort(SORTS[state.sort]);
}

// How many recipes the search finds in each section, and in All. The tabs
// show these, so they ignore the section and the filters.
export function sectionCounts(recipes, dims, state) {
  const found = recipes.filter((r) => matchesText(r, state.q));
  const counts = { all: found.length };
  for (const c of new Set(dims.flatMap((d) => d.sections))) counts[c] = found.filter((r) => r.category === c).length;
  return counts;
}

// The section's filters that some recipe in it uses, each with its options in
// groups. An option's count is how many recipes it would show, leaving its own
// filter's picks out; one that would show nothing is disabled unless it's on.
export function filters(recipes, dims, state) {
  const section = recipes.filter((r) => inSection(r, state.cat));
  return dimsFor(dims, state.cat).filter((d) => section.some((r) => (r.facets?.[d.key] || []).length)).map((d) => {
    const n = new Map();
    for (const r of recipes) if (matches(r, state, d.key)) for (const v of r.facets?.[d.key] || []) n.set(v, (n.get(v) || 0) + 1);
    const picked = state.sel[d.key] || [];
    return {
      key: d.key, label: d.label, picked: picked.length,
      groups: groupsFor(d, state.cat).map((g) => ({
        label: g.label || "",
        options: g.values.map((v) => {
          const count = n.get(v.key) || 0, on = picked.includes(v.key);
          return { key: v.key, label: v.label, count, on, disabled: !count && !on };
        }),
      })),
    };
  });
}

// One chip per pick, in the filters' order, to turn it off.
export function chips(dims, state) {
  return dims.flatMap((d) => (state.sel[d.key] || []).map((value) => ({
    dim: d.key, dimLabel: d.label, value, label: valuesFor(d, state.cat).find((v) => v.key === value)?.label || value,
  })));
}

// The URL's query for a state, without the "?": "" when it's as the page starts.
export function toQuery(state, dims) {
  const p = new URLSearchParams();
  if (state.cat !== "all") p.set("cat", state.cat);
  for (const d of dims) if (state.sel[d.key]?.length) p.set(d.key, state.sel[d.key].join(","));
  if (state.q) p.set("q", state.q);
  if (state.sort !== "az") p.set("sort", state.sort);
  return p.toString().replace(/%2C/g, ",");
}

// Changes. Each returns a new state.

// Another section: its picks in filters it doesn't have are dropped.
export const pickSection = (state, dims, cat) => ({ ...state, cat, sel: prune(state.sel, dims, cat) });

// One option on or off. A filter with nothing picked goes.
export function toggle(state, dim, value) {
  const was = state.sel[dim] || [];
  const now = was.includes(value) ? was.filter((v) => v !== value) : [...was, value];
  const { [dim]: _, ...rest } = state.sel;
  return { ...state, sel: now.length ? { ...rest, [dim]: now } : rest };
}

export const clearAll = (state) => ({ ...state, sel: {} });
