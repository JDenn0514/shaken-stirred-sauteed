#!/usr/bin/env node
// Runs the intake on text files (one per page, in order) and compares the
// draft with a recipe already on the site. The text files stay out of the repo
// when they're copied from a published book. From the repo root:
//
//   node tools/intake/compare.mjs babkallah page1.txt page2.txt [--category baking] [--show]
import { readFileSync } from "node:fs";
import { draftFromText } from "./intake.mjs";

const args = process.argv.slice(2);
const show = args.includes("--show");
const category = args.includes("--category") ? args[args.indexOf("--category") + 1] : undefined;
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--category");
const [slug, ...pages] = files;
const site = JSON.parse(readFileSync(`recipes/${slug}.json`, "utf8"));
const index = JSON.parse(readFileSync("recipes/index.json", "utf8"));
const titles = Object.fromEntries(index.map((r) => [r.slug, r.title]));
const { recipe, flags } = draftFromText(pages.map((p) => readFileSync(p, "utf8")), { category: category || site.category, titles });

const flat = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items.map((i) => ({ ...(typeof i === "string" ? { item: i } : i), group: e.group })) : [typeof e === "string" ? { item: e } : e]));
const words = (t) => new Set(String(t).toLowerCase().match(/[a-z]{3,}/g) || []);
const sim = (a, b) => { const A = words(a), B = words(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(1, Math.max(A.size, B.size)); };
const num = (q) => String(q || "").toLowerCase().replace(/½/g, "1/2").replace(/⅓/g, "1/3").replace(/¼/g, "1/4").replace(/¾/g, "3/4").replace(/(\d)(\d\/\d)/, "$1 $2").replace(/\btbsp\b/g, "tablespoon").replace(/\btsp\b/g, "teaspoon").replace(/\bounces?\b/g, "oz").replace(/s\b/g, "").replace(/\s+/g, " ").trim();

const mine = flat(recipe.ingredients), theirs = flat(site.ingredients);
let matched = 0, sameQty = 0, sameGrams = 0;
const rows = [];
const used = new Set();
for (const t of theirs) {
  // The closest unused ingredient by name, then by amount (two butters).
  const best = mine.filter((m) => !used.has(m)).reduce((b, m) => {
    const d = sim(m.item, t.item) - sim(b?.item, t.item);
    return d > 0 || (d === 0 && b && num(m.qty) === num(t.qty)) ? m : b;
  }, null);
  if (best && sim(best.item, t.item) >= 0.5) used.add(best);
  const ok = best && sim(best.item, t.item) >= 0.5;
  if (ok) { matched++; if (num(best.qty) === num(t.qty)) sameQty++; if (!t.grams || best.grams === t.grams) sameGrams++; }
  rows.push(`  ${ok ? (num(best.qty) === num(t.qty) ? "same  " : "AMOUNT") : "MISSED"}  site: ${[t.qty, t.item].filter(Boolean).join(" ")}${t.grams ? ` (${t.grams} g)` : ""}  |  intake: ${ok ? [best.qty, best.item].filter(Boolean).join(" ") + (best.grams ? ` (${best.grams} g)` : "") : "-"}`);
}
const waits = (r) => flat(r.steps).filter((s) => s.wait).map((s) => s.wait);
console.log(`${recipe.title}: ${mine.length} ingredients in ${recipe.ingredients.filter((g) => g.group).length} groups, ${flat(recipe.steps).length} steps, ${flags.length} things to check`);
console.log(`Against the site's ${site.title}: ${matched}/${theirs.length} ingredients found, ${sameQty} with the same amount, ${sameGrams} with the same weight`);
console.log(`Waits: intake [${waits(recipe).join(" | ")}]\n       site   [${waits(site).join(" | ")}]`);
if (show) {
  console.log("\nIngredients:\n" + rows.join("\n"));
  console.log("\nSteps:");
  for (const e of recipe.steps) for (const s of e.items || [e]) {
    const f = ["hands", "wait", "watch", "oven", "preheat", "burner", "prep", "prepOnly", "during"].filter((k) => s[k] !== undefined).map((k) => `${k}=${s[k]}`).join(" ");
    console.log(`  ${e.group ? `[${e.group}] ` : ""}${s.do}\n      {${f}}`);
  }
  console.log("\nAlso found:", JSON.stringify({ title: recipe.title, yield: recipe.yield, times: recipe.times, equipment: recipe.equipment, headnote: recipe.headnote?.slice(0, 60) + "…", notes: recipe.notes?.map((n) => n.group) }));
  console.log("\nTo check:\n" + flags.map((f) => `  [${f.kind}] ${f.text}`).join("\n"));
}
