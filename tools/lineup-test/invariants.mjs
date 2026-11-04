#!/usr/bin/env node
// Checks the planner across many lineups, not just the two meals the dry-run
// cooks tested: plans every one, then checks each plan against what any good
// plan must never do. Code only. From the repo root:
//
//   node tools/lineup-test/invariants.mjs            # reviewed recipes
//   node tools/lineup-test/invariants.mjs --code     # as code alone restructures them
//
// Lineups: the eight meals from code-only.mjs, every recipe on its own, and
// 200 random lineups of 2 to 4 recipes (the same 200 every run). Each plan
// (and its made-ahead plan) is checked with the recipe data it was made from,
// so a problem found is the planner breaking its own rules.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { planLineup } from "../../assets/planner.mjs";
import { restructure } from "../restructure/restructure.mjs";

const git = (...a) => execFileSync("git", a, { encoding: "utf8" });
const BEFORE = "e300174";
const slugs = git("ls-tree", "--name-only", `${BEFORE}:recipes`).split("\n")
  .filter((f) => f.endsWith(".json") && !["index.json", "vocabulary.json"].includes(f) && !f.startsWith("_")).map((f) => f.slice(0, -5));
const reviewed = Object.fromEntries(slugs.map((s) => [s, JSON.parse(readFileSync(`recipes/${s}.json`, "utf8"))]));
const strip = (s) => { if (typeof s === "string") return s; const { wait: _w, uses: _u, cue: _c, ...rest } = s; return rest; };
const recipes = process.argv.includes("--code")
  ? Object.fromEntries(slugs.map((s) => {
    const r = JSON.parse(git("show", `${BEFORE}:recipes/${s}.json`));
    r.steps = r.steps.map((e) => (e && Array.isArray(e.items) ? { ...e, items: e.items.map(strip) } : strip(e)));
    return [s, restructure(r, Object.fromEntries(slugs.map((x) => [x, reviewed[x].title])), s).recipe];
  }))
  : reviewed;

// The same lineups every run.
let seed = 20261104;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const LINEUPS = [
  ["pan-seared-ribeye", "lemon-butter-parmesan-asparagus", "microwave-applesauce", "hasselback-potatoes"],
  ["pavlova", "lemon-curd", "blueberry-whipped-cream"],
  ["carne-asada", "chimichurri-sauce", "grilled-corn-salad-with-avocado"],
  ["sheet-pan-chicken-shawarma", "tahini-yogurt-sauce"],
  ["italian-wedding-soup-with-acini-di-pepe", "homemade-acini-di-pepe"],
  ["congee-with-crispy-chili-pork"], ["lu-rou-fan"], ["babkallah", "minty-lime-bars"],
  ...slugs.map((s) => [s]),
];
while (LINEUPS.length < 8 + slugs.length + 200) {
  const n = 2 + Math.floor(rand() * 3), pick = new Set();
  while (pick.size < n) pick.add(slugs[Math.floor(rand() * slugs.length)]);
  LINEUPS.push([...pick]);
}

// Reading a recipe's steps the way the planner does.
const NUM = String.raw`\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+`;
const TIME = new RegExp(`(${NUM})\\s*(?:(?:to|-|–)\\s*(${NUM})\\s*)?(sec(?:ond)?s?|min(?:ute)?s?|hrs?|hours?)\\b(?:\\s*(\\d+)\\s*min)?`, "i");
const minutes = (t) => {
  const m = TIME.exec(t || ""); if (!m) return 0;
  const n = (x) => x.split(/\s+/).reduce((a, p) => a + (p.includes("/") ? p.split("/")[0] / p.split("/")[1] : +p), 0);
  return ((n(m[1]) + (m[2] ? n(m[2]) : n(m[1]))) / 2) * { s: 1 / 60, m: 1, h: 60 }[m[3][0].toLowerCase()] + (m[4] ? +m[4] : 0);
};
const stepsOf = (r) => r.steps.flatMap((g) => (g && Array.isArray(g.items) ? g.items : [g])).map((s) => (typeof s === "string" ? { do: s } : s));
const fahrenheit = (s) => { const m = /^(\d+)\s*([CF])$/i.exec(s || ""); return m ? (m[2].toUpperCase() === "C" ? m[1] * 9 / 5 + 32 : +m[1]) : null; };
const same = (a, b) => { const fa = fahrenheit(a), fb = fahrenheit(b); return fa != null && fb != null ? Math.abs(fa - fb) <= 15 : a === b; };
const sitsOf = (r) => {
  const serve = r.serve || (r.kind === "component" || r.category === "baking" ? "keeps" : r.category === "cocktails" ? "soon" : "hot");
  return serve === "keeps" ? Infinity : r.sits ? minutes(r.sits) : serve === "soon" && r.category === "cocktails" ? 5 : 10;
};

const found = {};
const report = (kind, lineup, detail) => (found[kind] ||= []).push(`${lineup.join(" + ")}: ${detail}`);

function check(plan, lineup, isDay) {
  // Each step with what it does, as the planner read it.
  const steps = plan.steps.filter((s) => !s.skipped).map((s) => {
    const st = s.step === "heat" ? { hands: "1 min" } : stepsOf(recipes[s.slug])[s.step];
    const hands = st.hands ? minutes(st.hands) : null, wait = minutes(st.wait);
    return { ...s, st, wait, handsEnd: hands == null ? null : s.at + hands, end: hands == null ? null : s.at + hands + wait, busyTo: hands == null ? null : s.at + hands + (st.watch ? wait : 0) };
  });
  const timed = steps.filter((s) => s.handsEnd != null);
  // 1. One pair of hands.
  const busy = [...timed].sort((a, b) => a.at - b.at);
  for (let i = 1; i < busy.length; i++) {
    const prev = busy.slice(0, i).reduce((a, b) => (b.busyTo > a.busyTo ? b : a));
    if (busy[i].at < prev.busyTo - 0.01) report("two things at once", lineup, `"${busy[i].text.slice(0, 40)}" at ${busy[i].at} while "${prev.text.slice(0, 40)}" runs to ${prev.busyTo}`);
  }
  // 2. A dish's steps in order: after the one before is done, or its hands
  // are free for a step done during its wait.
  const bySlug = {};
  for (const s of steps) (bySlug[s.slug] ||= []).push(s);
  for (const list of Object.values(bySlug)) list.forEach((s, i) => {
    if (!i || s.st.during) return;
    const before = list.slice(0, i).filter((x) => !x.st.during).at(-1);
    if (before?.end != null && s.at < before.end - 0.01) report("step before its dish is ready", lineup, `"${s.text.slice(0, 40)}" at ${s.at}, the step before ends at ${before.end}`);
  });
  // 3. Linked recipes ready before the step that uses them.
  for (const s of steps) for (const u of s.st.uses || []) {
    const item = String(typeof u === "string" ? u : u.item).toLowerCase();
    const link = stepsOf.length && (recipes[s.slug].ingredients || []).flatMap((g) => (g && Array.isArray(g.items) ? g.items : [g])).find((i) => i && i.recipe && i.item.toLowerCase() === item);
    if (!link || !bySlug[link.recipe]) continue;
    const ready = Math.max(...bySlug[link.recipe].map((x) => x.end ?? x.at));
    if (s.at < ready - 0.01) report("used before it's made", lineup, `"${s.text.slice(0, 40)}" at ${s.at} uses ${link.recipe}, ready at ${ready}`);
  }
  // 4. Equipment: burners, microwave, grill.
  for (const [kind, cap] of [["burner", 4], ["microwave", 1], ["grill", 1]]) {
    const uses = timed.filter((s) => s.st[kind]);
    for (const s of uses) {
      const at = uses.filter((x) => x.at <= s.at + 0.01 && x.end > s.at + 0.01 && x.slug !== s.slug);
      const mine = new Set(at.map((x) => x.slug));
      if (mine.size + 1 > cap) report(`more than ${cap} ${kind}${cap > 1 ? "s" : ""}`, lineup, `at ${s.at}: ${[s.slug, ...mine].join(", ")}`);
    }
  }
  // 5. The oven at one setting: a dish holds it from its first oven step until
  // the end of its last, or until a step takes it out.
  const holds = [];
  for (const [slug, list] of Object.entries(bySlug)) {
    const ov = list.filter((s) => s.st.oven && s.handsEnd != null);
    if (!ov.length) continue;
    const last = ov.at(-1), out = list.find((s) => s.at >= last.at && s.st.oven === false);
    ov.forEach((s, i) => holds.push({ slug, setting: s.st.oven, from: s.at, to: i < ov.length - 1 ? ov[i + 1].at : out ? out.handsEnd : s.end }));
  }
  for (const a of holds) for (const b of holds) {
    if (a.slug >= b.slug || same(a.setting, b.setting)) continue;
    const from = Math.max(a.from, b.from), to = Math.min(a.to, b.to);
    if (to - from > 0.5) report("oven at two settings", lineup, `${a.slug} at ${a.setting} and ${b.slug} at ${b.setting}, ${from} to ${to}`);
  }
  // 6. Food on the heat isn't left: after a burner step with a wait, the dish's
  // next step comes within 2 minutes of it being ready.
  for (const list of Object.values(bySlug)) list.forEach((s, i) => {
    if (!s.st.burner || !s.wait || s.st.watch || s.end == null || s.st.during) return;
    const next = list.slice(i + 1).find((x) => !x.st.during);
    if (next && next.at - s.end > 2) report("left on the heat", lineup, `"${s.text.slice(0, 40)}" ready at ${s.end}, next step at ${next.at}`);
  });
  if (!isDay) return;
  // 7. Hot dishes ready within their sitting time of their course.
  for (const slug of lineup) {
    const r = recipes[slug], limit = sitsOf(r);
    if (limit === Infinity || plan.ready[slug] == null) continue;
    const served = plan.courses[r.category === "baking" ? "Dessert" : "Main"] ?? plan.minutes;
    if (served - plan.ready[slug] > limit + 1) report("hot dish sits too long", lineup, `${slug} ready at ${plan.ready[slug]}, served at ${served}, can sit ${limit}`);
    if (plan.ready[slug] > served + 0.5) report("ready after serving", lineup, `${slug} ready at ${plan.ready[slug]}, served at ${served}`);
  }
  // 8. No long stretch with nothing happening: nothing in hand or running.
  const spans = timed.map((s) => [s.at, Math.max(s.end, s.busyTo)]).sort((a, b) => a[0] - b[0]);
  let reach = spans[0]?.[1] ?? 0;
  for (const [a, b] of spans) { if (a - reach > 20) report("nothing happening for over 20 min", lineup, `${Math.round(reach)} to ${Math.round(a)}`); reach = Math.max(reach, b); }
}

let planned = 0;
for (const lineup of LINEUPS) {
  let plan;
  try { plan = planLineup({ dishes: lineup.map((slug) => ({ slug })) }, recipes); } catch (e) { report("can't plan", lineup, e.message); continue; }
  planned++;
  check(plan, lineup, true);
  if (plan.aheadOfTime) check({ ...plan.aheadOfTime, ready: {}, courses: {} }, lineup, false);
}
console.log(`${process.argv.includes("--code") ? "Code-only" : "Reviewed"} recipes: ${LINEUPS.length} lineups, ${planned} planned.`);
const kinds = Object.entries(found).sort((a, b) => b[1].length - a[1].length);
if (!kinds.length) console.log("Nothing found.");
for (const [kind, list] of kinds) {
  const lineups = new Set(list.map((x) => x.split(": ")[0]));
  console.log(`\n${kind}: ${list.length} times, in ${lineups.size} lineups. For example:`);
  for (const x of list.slice(0, 4)) console.log(`  ${x}`);
}
