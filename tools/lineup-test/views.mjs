#!/usr/bin/env node
// Writes out what the lineup would show for a meal, three ways, from the real
// planner (assets/planner.mjs) and the real recipes, for testing which reads
// best (see README.md):
//
//   detailed      every step of every recipe in one order, as lineup cook mode
//   phases        the meal in phases; within each, cook from the recipe cards
//   phases+steps  the same phases, with each phase's steps one tap away
//
// Also writes each recipe's card (as written). From the repo root:
//   node tools/lineup-test/views.mjs OUT_DIR
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planLineup } from "../../assets/planner.mjs";

const recipes = Object.fromEntries(readdirSync("recipes").filter((f) => f.endsWith(".json") && !["index.json", "vocabulary.json"].includes(f) && !f.startsWith("_"))
  .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join("recipes", f), "utf8"))]));
const flat = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items.map((i) => (typeof i === "string" ? { do: i, group: e.group } : { ...i, group: e.group })) : [typeof e === "string" ? { do: e } : e]));
const NUM = String.raw`\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+`;
const TIME = new RegExp(`(${NUM})\\s*(?:(?:to|-|–)\\s*(${NUM})\\s*)?(sec(?:ond)?s?|min(?:ute)?s?|hrs?|hours?)\\b`, "i");
const minutes = (t) => {
  const m = TIME.exec(t || "");
  if (!m) return 0;
  const n = (x) => x.split(/\s+/).reduce((a, p) => a + (p.includes("/") ? p.split("/")[0] / p.split("/")[1] : +p), 0);
  return ((n(m[1]) + (m[2] ? n(m[2]) : n(m[1]))) / 2) * { s: 1 / 60, m: 1, h: 60 }[m[3][0].toLowerCase()];
};
const about = (m) => {
  const r = m >= 20 ? Math.round(m / 5) * 5 : Math.max(1, Math.round(m));
  return `about ${r >= 60 ? `${Math.floor(r / 60)} hr${r % 60 ? ` ${r % 60} min` : ""}` : `${r} min`}`;
};
const name = (slug) => recipes[slug].title;

// A recipe's card as written: added prep-only steps aren't on it.
function card(slug) {
  const r = recipes[slug];
  const lines = [`# ${r.title}`, ""];
  if (r.yield) lines.push(r.yield);
  if (r.times?.length) lines.push(r.times.map(([k, v]) => `${k}: ${v}`).join(" · "));
  if (r.beforeYouStart?.length) lines.push("", "## Before you start", ...r.beforeYouStart.map((b) => `- ${b}`));
  lines.push("", "## Ingredients");
  for (const e of r.ingredients) {
    if (e && Array.isArray(e.items)) { lines.push(`### ${e.group}`); for (const i of e.items) lines.push(`- ${typeof i === "string" ? i : [i.qty, i.item, i.note && `(${i.note})`].filter(Boolean).join(" ")}`); }
    else lines.push(`- ${typeof e === "string" ? e : [e.qty, e.item, e.note && `(${e.note})`].filter(Boolean).join(" ")}`);
  }
  lines.push("", "## Steps");
  let n = 0, group = null;
  for (const s of flat(r.steps)) {
    if (s.prepOnly) continue;
    if (s.group && s.group !== group) { lines.push(`### ${s.group}`); group = s.group; }
    lines.push(`${++n}. ${s.do}${s.wait ? ` [timer: ${s.wait}]` : ""}${s.cue ? ` (done when: ${s.cue})` : ""}`);
  }
  if (r.notes?.length) lines.push("", "## Notes", ...flat(r.notes).map((x) => `- ${x.do ?? x}`));
  return lines.join("\n") + "\n";
}

// The plan's steps with what each needs: the recipe step, its card number,
// and when your hands are free again.
function detail(steps) {
  return steps.filter((s) => !s.skipped).map((s) => {
    const all = flat(recipes[s.slug].steps);
    const step = s.step === "heat" ? { do: s.text, hands: "1 min" } : all[s.step];
    const cardNo = s.step === "heat" || step.prepOnly ? null : all.slice(0, s.step + 1).filter((x) => !x.prepOnly).length;
    const hands = step.hands ? minutes(step.hands) : 2, wait = minutes(step.wait);
    return { ...s, step, cardNo, wait, free: s.at + hands + (step.watch ? wait : 0), prep: step.prep === true || !!step.prepOnly, longWait: wait >= 15 && !step.watch };
  });
}
const label = (d) => `${name(d.slug)}${d.cardNo ? `, card step ${d.cardNo}` : d.added ? " (added for this meal)" : " (prep)"}`;

function detailed(title, plan, steps) {
  const out = [`# ${title}: step by step`, "", `One step at a time, across all the recipes, in this order. A step with a timer starts it when you move on. "Nothing needs you" means wait (a timer runs on the screen). About ${about(plan.minutes).replace(/^about /, "")} in all.`, ""];
  steps.forEach((d, i) => {
    out.push(`${i + 1}. [${label(d)}] ${d.step.do}${d.wait ? ` — timer: ${d.step.wait}${d.step.watch ? " (stay with it)" : ""}` : ""}`);
    const next = steps[i + 1];
    if (next && next.at - Math.max(...steps.slice(0, i + 1).map((x) => x.free)) >= 2) out.push(`   — Nothing needs you for ${about(next.at - Math.max(...steps.slice(0, i + 1).map((x) => x.free)))}. Up next: ${name(next.slug)}.`);
  });
  return out.join("\n") + "\n";
}

// Phases: the prep, then a new phase wherever a long wait starts (something
// goes in the oven, rises, chills), so you'd naturally look up.
const DOING = [[/\bout of the fridge\b/i, "sitting out"], [/\bice bath\b/i, "in the ice bath"], [/\b(rise|doubled|expanded)\b/i, "rising"], [/\b(refrigerat|chill|fridge)/i, "in the fridge"], [/\bcool/i, "cooling"], [/\bsimmer/i, "simmering"], [/\bmicrowave/i, "in the microwave"], [/\b(sit|stand|rest)\b/i, "resting"]];
const doing = (d) => (d.step.oven && d.step.oven !== "off" ? "in the oven" : d.step.oven === "off" ? "cooling in the oven" : (DOING.find(([re]) => re.test(d.step.do)) || [null, "waiting"])[1]);
function phases(steps, finalName) {
  const list = [];
  let cur = null;
  steps.forEach((d, i) => {
    const prepPhase = i === 0 || (cur?.prep && (d.prep || d.step.preheat || d.added));
    if (prepPhase && (i === 0 || cur?.prep)) { if (!cur) { cur = { name: "Prep", prep: true, steps: [] }; list.push(cur); } cur.steps.push(d); return; }
    if (d.longWait || cur?.prep) {
      cur = { name: d.longWait ? `${name(d.slug)} ${doing(d)} (${about(d.wait).replace(/^about /, "")})` : "Start cooking", steps: [] };
      list.push(cur);
    }
    cur.steps.push(d);
  });
  if (finalName && list.length > 2 && !list.at(-1).prep) list.at(-1).name += ` — then ${finalName}`;
  return list;
}
const range = (ns) => { const s = [...new Set(ns)].sort((a, b) => a - b); return s.length === 1 ? `step ${s[0]}` : s.every((n, i) => !i || n === s[i - 1] + 1) ? `steps ${s[0]}–${s.at(-1)}` : `steps ${s.join(", ")}`; };
function phasesView(title, plan, steps, withSteps, finalName) {
  const ps = phases(steps, finalName);
  const out = [`# ${title}: in phases`, "", withSteps
    ? `The meal in ${ps.length} phases. Each phase lists what to get done; tap a phase to see its steps in order. About ${about(plan.minutes).replace(/^about /, "")} in all.`
    : `The meal in ${ps.length} phases. Each phase lists what to get done from each recipe card; within a phase, do them in whatever order suits you, finishing the phase before starting the next. About ${about(plan.minutes).replace(/^about /, "")} in all.`, ""];
  ps.forEach((p, n) => {
    out.push(`## Phase ${n + 1}: ${p.name}`);
    const dishes = [...new Set(p.steps.map((d) => d.slug))];
    for (const slug of dishes) {
      const mine = p.steps.filter((d) => d.slug === slug);
      const nums = mine.filter((d) => d.cardNo).map((d) => d.cardNo), extra = mine.filter((d) => !d.cardNo).map((d) => d.step.do);
      out.push(`- ${name(slug)}: ${[nums.length ? `card ${range(nums)}` : "", ...extra.map((e) => `also: ${e}`)].filter(Boolean).join("; ")}`);
    }
    if (withSteps) {
      out.push("", "  (tap to show the steps in order)");
      p.steps.forEach((d) => out.push(`  - [${label(d)}] ${d.step.do}${d.wait ? ` — timer: ${d.step.wait}` : ""}`));
    }
    out.push("");
  });
  return out.join("\n");
}

const LINEUPS = {
  "steak-dinner": { title: "Steak dinner", dishes: ["pan-seared-ribeye", "lemon-butter-parmesan-asparagus", "microwave-applesauce", "hasselback-potatoes"].map((slug) => ({ slug })), finalName: "serve" },
  "pavlova": { title: "Pavlova with lemon curd and blueberry whipped cream", dishes: ["pavlova", "lemon-curd", "blueberry-whipped-cream"].map((slug) => ({ slug })), finalName: "put it together and serve" },
};

const out = process.argv[2] || "lineup-views";
mkdirSync(out, { recursive: true });
for (const [key, l] of Object.entries(LINEUPS)) {
  const plan = planLineup({ dishes: l.dishes }, recipes);
  const runs = [];
  if (plan.aheadOfTime) runs.push([`${l.title}, made ahead (the day before)`, plan.aheadOfTime]);
  runs.push([plan.aheadOfTime ? `${l.title}, on the day` : l.title, plan]);
  const slugs = new Set(runs.flatMap(([, p]) => p.steps.map((s) => s.slug)));
  writeFileSync(join(out, `${key}.cards.md`), [...slugs].map(card).join("\n---\n\n"));
  const note = plan.makeAhead?.length ? `Made ahead: ${plan.makeAhead.map((m) => name(m.slug)).join(", ")} (the lineup page offered it, since it saves ${about(plan.makeAhead[0].saves)} on the day).\n\n` : "";
  for (const [variant, make] of [["detailed", (t, p, s) => detailed(t, p, s)], ["phases", (t, p, s, f) => phasesView(t, p, s, false, f)], ["phases-steps", (t, p, s, f) => phasesView(t, p, s, true, f)]]) {
    writeFileSync(join(out, `${key}.${variant}.md`), note + runs.map(([t, p], i) => make(t, p, detail(p.steps), i === runs.length - 1 ? l.finalName : null)).join("\n\n"));
  }
  console.log(`${key}: ${about(plan.minutes)}${plan.aheadOfTime ? ` on the day, ${about(plan.aheadOfTime.minutes)} ahead` : ""}; ${slugs.size} recipes`);
}
