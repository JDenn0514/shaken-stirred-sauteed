#!/usr/bin/env node
// How the lineup does with recipe data the intake can produce without a
// person, and which planning fields matter most. Code only, no agents. From
// the repo root:
//
//   node tools/lineup-test/code-only.mjs
//
// Three versions of each recipe:
//   reviewed    the recipes as they are now (the reference)
//   code-only   the original text (commit e300174, before any lineup data),
//               stripped of waits, cues and step ingredients, through
//               tools/restructure with no person involved
//   + answers   code-only, with the one thing the intake asks for answered:
//               a time for a step that bakes, rises, chills or cools without
//               one (taken from the reviewed recipe)
//
// Then each field is degraded on its own in the reviewed recipes, and the
// plan made from them is followed with the reviewed data, to see what each
// field costs a cook.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { planLineup } from "../../assets/planner.mjs";
import { restructure } from "../restructure/restructure.mjs";

const BEFORE = "e300174";
const MEALS = {
  "Steak dinner": ["pan-seared-ribeye", "lemon-butter-parmesan-asparagus", "microwave-applesauce", "hasselback-potatoes"],
  "Pavlova": ["pavlova", "lemon-curd", "blueberry-whipped-cream"],
  "Carne asada": ["carne-asada", "chimichurri-sauce", "grilled-corn-salad-with-avocado"],
  "Sheet-pan shawarma": ["sheet-pan-chicken-shawarma", "tahini-yogurt-sauce"],
  "Wedding soup": ["italian-wedding-soup-with-acini-di-pepe", "homemade-acini-di-pepe"],
  "Congee": ["congee-with-crispy-chili-pork"],
  "Lu rou fan": ["lu-rou-fan"],
  "Baking day": ["babkallah", "minty-lime-bars"],
};

const git = (...a) => execFileSync("git", a, { encoding: "utf8" });
const slugs = git("ls-tree", "--name-only", `${BEFORE}:recipes`).split("\n")
  .filter((f) => f.endsWith(".json") && !["index.json", "vocabulary.json"].includes(f) && !f.startsWith("_")).map((f) => f.slice(0, -5));
const flat = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e])).map((s) => (typeof s === "string" ? { do: s } : s));
const mapSteps = (r, fn) => ({ ...r, steps: r.steps.map((e) => (e && Array.isArray(e.items) ? { ...e, items: e.items.map(fn) } : fn(e))) });

const reviewed = Object.fromEntries(slugs.map((s) => [s, JSON.parse(readFileSync(`recipes/${s}.json`, "utf8"))]));
const titles = Object.fromEntries(slugs.map((s) => [s, reviewed[s].title]));
const strip = (s) => { if (typeof s === "string") return s; const { wait: _w, uses: _u, cue: _c, ...rest } = s; return rest; };
const code = Object.fromEntries(slugs.map((s) => {
  const r = mapSteps(JSON.parse(git("show", `${BEFORE}:recipes/${s}.json`)), strip);
  return [s, restructure(r, titles, s).recipe];
}));

// Which original step each reviewed step came from, by shared words (as
// tools/restructure/score.mjs matches them).
const words = (t) => new Set(String(t).toLowerCase().match(/[a-z]{3,}/g) || []);
const sim = (a, b) => { const A = words(a), B = words(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(1, Math.min(A.size, B.size)); };
// The intake's "time" flag (tools/intake/parse.mjs): bakes, rises, chills or
// cools, with no time.
const NEEDS_TIME = /\b(bake|baking|roast|rise|chill|refrigerate|cool|rest|proof|simmer)\w*\b/i;
const answered = Object.fromEntries(slugs.map((s) => {
  const orig = flat(JSON.parse(git("show", `${BEFORE}:recipes/${s}.json`)).steps), rev = flat(reviewed[s].steps);
  const from = rev.map((k) => (k.prepOnly ? -1 : orig.reduce((b, o, i) => (sim(k.do, o.do) > sim(k.do, orig[b].do) ? i : b), 0)));
  return [s, mapSteps(code[s], (st) => {
    if (typeof st !== "object" || st.wait || st.added || !NEEDS_TIME.test(st.do)) return st;
    const k = rev.find((x, j) => from[j] === st.x_from && x.wait && sim(x.do, st.do) >= 0.3);
    return k ? { ...st, wait: k.wait } : st;
  })];
}));

const plan = (meal, recipes) => {
  try { return planLineup({ dishes: meal.map((slug) => ({ slug })), ahead: Object.fromEntries(meal.map((s) => [s, false])) }, recipes); }
  catch (e) { return { error: e.message }; }
};
const hm = (m) => (m == null ? "–" : m >= 60 ? `${Math.floor(m / 60)} hr ${String(Math.round(m % 60)).padStart(2, "0")}` : `${Math.round(m)} min`);

// Following a plan with the reviewed data: one cook, each step at its planned
// time, or later if your hands or its dish aren't ready yet. Linked recipes count as ready
// (a simplification). Returns the time it really takes, how long hot dishes sit
// past their limit, and how long food is left on the heat or in the oven.
const NUM = String.raw`\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+`;
const TIME = new RegExp(`(${NUM})\\s*(?:(?:to|-|–)\\s*(${NUM})\\s*)?(sec(?:ond)?s?|min(?:ute)?s?|hrs?|hours?)\\b`, "i");
const minutes = (t) => {
  const m = TIME.exec(t || ""); if (!m) return 0;
  const n = (x) => x.split(/\s+/).reduce((a, p) => a + (p.includes("/") ? p.split("/")[0] / p.split("/")[1] : +p), 0);
  return ((n(m[1]) + (m[2] ? n(m[2]) : n(m[1]))) / 2) * { s: 1 / 60, m: 1, h: 60 }[m[3][0].toLowerCase()];
};
function follow(p, truth) {
  let hands = 0, end = 0;
  const done = {}, bg = {}, last = {}, sitsOver = {};
  let leftOnHeat = 0;
  for (const s of p.steps.filter((x) => !x.skipped)) {
    const st = s.step === "heat" ? { hands: "1 min" } : flat(truth[s.slug].steps)[s.step];
    const h = st.hands ? minutes(st.hands) : 2, w = minutes(st.wait);
    const prev = last[s.slug];
    const ready = st.during && prev ? prev.handsEnd : Math.max(done[s.slug] || 0, bg[s.slug] || 0);
    // Never before the plan says (it holds hot dishes back on purpose).
    const at = Math.max(s.at, hands, ready);
    if (prev && (prev.st.burner || (prev.st.oven && prev.st.oven !== "off" && st.oven === false)) && !st.during) leftOnHeat += Math.max(0, at - prev.end - 2);
    hands = at + h + (st.watch ? w : 0);
    const stepEnd = at + h + w;
    if (st.during) bg[s.slug] = Math.max(bg[s.slug] || 0, stepEnd); else done[s.slug] = stepEnd;
    last[s.slug] = { st, end: stepEnd, handsEnd: at + h };
    end = Math.max(end, stepEnd, hands);
  }
  for (const slug of Object.keys(done)) {
    const r = truth[slug], serve = r.serve || "hot";
    if (serve === "keeps") continue;
    const limit = r.sits ? minutes(r.sits) : 10;
    sitsOver[slug] = Math.max(0, end - Math.max(done[slug], bg[slug] || 0) - limit);
  }
  return { minutes: end, sitsOver: Object.values(sitsOver).reduce((a, b) => a + b, 0), leftOnHeat };
}

// Degrading one field at a time in the reviewed recipes.
const textHasTime = (s) => TIME.test(s.do || "");
const ABLATIONS = {
  "waits not in the text": (s) => (textHasTime(s) ? s : (({ wait: _w, ...r }) => r)(s)),
  "prep marks": ({ prep: _p, ...r }) => r,
  "hands-on times": ({ hands: _h, ...r }) => r,
  "watch marks": ({ watch: _w, ...r }) => r,
  "during marks": ({ during: _d, ...r }) => r,
  "equipment (oven, burner, microwave)": ({ oven: _o, preheat: _p, burner: _b, microwave: _m, grill: _g, ...r }) => r,
};
const degrade = (fn, recipe) => mapSteps(recipe, (s) => (typeof s === "object" ? fn(s) : s));
const degradeSits = (r) => { const { serve: _s, sits: _t, ...rest } = r; return rest; };

const out = [];
const P = (...l) => out.push(...l);
P("# Lineups from code-only recipe data", "", "From `tools/lineup-test/code-only.mjs`. Planned times, all on the day (nothing made ahead).", "",
  "| Meal | Reviewed | Code-only | + answers |", "|---|---|---|---|");
const versions = { reviewed, code, answered };
for (const [name, meal] of Object.entries(MEALS)) {
  const t = Object.fromEntries(Object.entries(versions).map(([k, v]) => [k, plan(meal, v)]));
  P(`| ${name} | ${hm(t.reviewed.minutes)} | ${t.code.error ? "fails" : hm(t.code.minutes)} | ${t.answered.error ? "fails" : hm(t.answered.minutes)} |`);
}
P("", "Single recipes, planned on their own (40):", "");
const singles = slugs.map((s) => ({ s, ...Object.fromEntries(Object.entries(versions).map(([k, v]) => [k, plan([s], v).minutes])) }));
for (const k of ["code", "answered"]) {
  const ok = singles.filter((x) => x.reviewed && x[k] != null);
  const show = (l) => l.map((x) => `${x.s} ${hm(x[k])} vs ${hm(x.reviewed)}`).join("; ") || "none";
  const short = ok.filter((x) => x[k] < 0.75 * x.reviewed).sort((a, b) => a[k] / a.reviewed - b[k] / b.reviewed);
  const long = ok.filter((x) => x[k] > 1.33 * x.reviewed);
  P(`- ${k === "code" ? "Code-only" : "+ answers"}: ${ok.length - short.length - long.length} of ${ok.length} within about a quarter of the reviewed time. Far shorter: ${show(short)}. Far longer: ${show(long)}.`);
}

P("", "## What each field costs", "", "Each field taken out of the reviewed recipes on its own. The plan made without it is then followed with the real (reviewed) data, summed over seven meals (not the wedding soup, see the results): how much longer the meal really takes than the reference plan followed the same way, how long hot dishes sit past their limit, and how long food is left on the heat or in the oven waiting for its next step. The reference itself, followed this way, is shown first.", "",
  "| Taken out | Meals that fail to plan | Planned time (sum) | Really takes | Hot dishes sit too long | Left on the heat |", "|---|---|---|---|---|---|");
const row = (label, recipes) => {
  let fails = 0, planned = 0, real = 0, sits = 0, heat = 0;
  for (const [name, meal] of Object.entries(MEALS)) {
    if (name === "Wedding soup") continue; // a planner bug swamps it: see the results
    const p = plan(meal, recipes);
    if (p.error) { fails++; continue; }
    const f = follow(p, reviewed);
    planned += p.minutes; real += f.minutes; sits += f.sitsOver; heat += f.leftOnHeat;
  }
  P(`| ${label} | ${fails} | ${hm(planned)} | ${hm(real)} | ${Math.round(sits)} min | ${Math.round(heat)} min |`);
};
row("nothing (reference)", reviewed);
for (const [label, fn] of Object.entries(ABLATIONS)) row(label, Object.fromEntries(slugs.map((s) => [s, degrade(fn, reviewed[s])])));
row("serve and sitting times", Object.fromEntries(slugs.map((s) => [s, degradeSits(reviewed[s])])));
console.log(out.join("\n"));
