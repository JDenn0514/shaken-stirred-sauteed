#!/usr/bin/env node
// Runs the code-only restructuring (restructure.mjs) on the recipes as they
// were before any lineup data was added, and scores it field by field against
// the data Jacob reviewed. Run from the repo root:
//
//   node tools/restructure/score.mjs            # recipes as written, with their waits and step ingredients
//   node tools/restructure/score.mjs --plain    # plain text only, as a new recipe arrives at the intake
//   node tools/restructure/score.mjs --out DIR  # also write the restructured recipes to DIR
//
// Both sets of recipes come from git, so the scores don't drift as the real
// recipes change: BEFORE is the last commit without lineup data, KEY the
// reviewed data.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { restructure } from "./restructure.mjs";

const BEFORE = "e300174", KEY = "4cb7a3c";
const args = process.argv.slice(2);
const plain = args.includes("--plain");
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;

const git = (...a) => execFileSync("git", a, { encoding: "utf8" });
const slugs = git("ls-tree", "--name-only", `${BEFORE}:recipes`).split("\n")
  .filter((f) => f.endsWith(".json") && !["index.json", "vocabulary.json"].includes(f) && !f.startsWith("_")).map((f) => f.slice(0, -5));
const read = (rev, slug) => JSON.parse(git("show", `${rev}:recipes/${slug}.json`));

// Plain text: no waits, cues or step ingredients, which a new recipe won't have.
const strip = (s) => { if (typeof s === "string") return s; const { wait: _w, uses: _u, cue: _c, ...rest } = s; return rest; };
const before = Object.fromEntries(slugs.map((s) => {
  const r = read(BEFORE, s);
  if (plain) r.steps = r.steps.map((e) => (e && Array.isArray(e.items) ? { ...e, items: e.items.map(strip) } : strip(e)));
  return [s, r];
}));
const titles = Object.fromEntries(slugs.map((s) => [s, before[s].title]));
const code = {}, notes = {};
for (const s of slugs) ({ recipe: code[s], notes: notes[s] } = restructure(before[s], titles, s));
if (outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const s of slugs) writeFileSync(join(outDir, `${s}.json`), JSON.stringify(code[s], null, 2) + "\n");
  writeFileSync(join(outDir, "_notes.txt"), slugs.filter((s) => notes[s].length).map((s) => `${s}:\n  ${notes[s].join("\n  ")}`).join("\n") + "\n");
}

// Scoring. Each original step is matched to the reviewed steps made from it
// (by shared words) and to the code's steps made from it (x_from).
const fl = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e])).map((s) => (typeof s === "string" ? { do: s } : s));
const words = (t) => new Set(String(t).toLowerCase().match(/[a-z]{3,}/g) || []);
const sim = (a, b) => { const A = words(a), B = words(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(1, Math.min(A.size, B.size)); };
const TIME = /(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(?:(?:to|-|–)\s*(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*)?(sec(?:ond)?s?|min(?:ute)?s?|hrs?|hours?)\b(?:\s*(\d+)\s*min)?/i;
const mins = (x) => { const m = TIME.exec(x || ""); if (!m) return 0; const n = (v) => v.split(/\s+/).reduce((t, p) => t + (p.includes("/") ? p.split("/")[0] / p.split("/")[1] : +p), 0); return ((n(m[1]) + (m[2] ? n(m[2]) : n(m[1]))) / 2) * { s: 1 / 60, m: 1, h: 60 }[m[3][0].toLowerCase()] + (m[4] ? +m[4] : 0); };
const norm = (o) => ({ "200C": "400F", "175C": "350F", "205C": "400F", "220C": "425F", "150C": "300F" })[o] || o;
const tally = {}, miss = {};
const add = (k, ok, where) => { tally[k] ||= [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; else (miss[k] ||= []).push(where); };
const handsErr = [];
let keyHands = 0, codeHands = 0;
for (const slug of slugs) {
  const orig = read(BEFORE, slug), key = read(KEY, slug), out = code[slug];
  const os = fl(orig.steps), cs = fl(out.steps), ks = fl(key.steps);
  const keyFrom = ks.map((k) => (k.prepOnly ? -1 : os.reduce((b, o, i) => (sim(k.do, o.do) > sim(k.do, os[b].do) ? i : b), 0)));
  const ownHeat = (k, i) => !(k.preheat && sim(k.do, os[i].do) < 0.5);
  os.forEach((o, i) => {
    const K = ks.filter((k, j) => keyFrom[j] === i && ownHeat(k, i)), C = cs.filter((c) => (c.x_from === i || c.x_merged?.includes(i)) && !c.added);
    const w = `${slug} #${i + 1}`;
    const any = (L, k) => L.some((s) => s[k]);
    const set = (L, k) => [...new Set(L.map((s) => norm(s[k])).filter(Boolean))].sort().join(",");
    add("split the same way (one step or several)", (K.length > 1) === (C.filter((c) => c.x_from === i).length > 1), `${w}: reviewed ${K.length}, code ${C.length}`);
    add("wait (has one or not)", any(K, "wait") === any(C, "wait"), `${w}: reviewed ${K.map((s) => s.wait).join("|") || "-"} / code ${C.map((s) => s.wait).join("|") || "-"}`);
    add("oven setting", set(K, "oven") === set(C, "oven"), `${w}: reviewed ${set(K, "oven") || "-"} / code ${set(C, "oven") || "-"}`);
    add("heats the oven", set(K, "preheat") === set(C, "preheat"), `${w}: reviewed ${set(K, "preheat") || "-"} / code ${set(C, "preheat") || "-"}`);
    for (const k of ["burner", "grill", "microwave", "watch", "during"]) add(k, any(K, k) === any(C, k), `${w}: reviewed ${any(K, k)} / code ${any(C, k)}`);
    const kp = K.map((s) => s.prep).find(Boolean) || "", cp = C.map((s) => s.prep).find(Boolean) || "";
    add("prep mark (none, ahead, just before)", String(kp) === String(cp), `${w}: reviewed ${kp || "-"} / code ${cp || "-"}`);
    const kh = K.reduce((a, s) => a + mins(s.hands), 0), ch = C.reduce((a, s) => a + mins(s.hands), 0);
    handsErr.push(Math.abs(kh - ch)); keyHands += kh; codeHands += ch;
  });
  const ings = (r) => (r.ingredients || []).flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e])).filter((i) => typeof i === "object");
  const keyHeat = ks.filter((k, j) => k.preheat && keyFrom[j] >= 0 && !ownHeat(k, keyFrom[j])).length, codeHeat = cs.filter((c) => c.added && c.preheat).length;
  add("heating steps added", keyHeat === codeHeat, `${slug}: reviewed ${keyHeat} / code ${codeHeat}`);
  add("serve", key.serve === out.serve, `${slug}: reviewed ${key.serve} / code ${out.serve}`);
  add("sits", (key.sits || "") === (out.sits || ""), `${slug}: reviewed ${key.sits || "-"} / code ${out.sits || "-"}`);
  const links = (r) => ings(r).filter((i) => i.recipe).map((i) => `${i.item}→${i.recipe}${i.optional ? " (optional)" : ""}`).sort().join("; ");
  add("recipe links", links(key) === links(out), `${slug}: reviewed [${links(key)}] / code [${links(out)}]`);
  const opt = (r) => ings(r).filter((i) => i.optional).map((i) => i.item).sort().join("; ");
  add("optional marks", opt(key) === opt(out), `${slug}: reviewed [${opt(key)}] / code [${opt(out)}]`);
  const prepped = (L) => new Set(L.filter((s) => s.prepOnly).flatMap((s) => (s.uses || []).map((u) => (typeof u === "string" ? u : u.item).toLowerCase())));
  const kp = prepped(ks), cp = prepped(cs);
  for (const x of kp) add("added prep: reviewed prep the code also finds", cp.has(x), `${slug}: ${x}`);
  for (const x of cp) add("added prep: code's prep that the reviewed data has too", kp.has(x), `${slug}: ${x}`);
}
const pct = ([a, b]) => `${a}/${b}`.padEnd(9) + `${String(Math.round((100 * a) / b)).padStart(3)}%`;
console.log(plain ? "From plain text (no waits, cues or step ingredients):" : "From the recipes as written:");
for (const [k, v] of Object.entries(tally)) console.log(`  ${pct(v)}  ${k}`);
handsErr.sort((a, b) => a - b);
console.log(`  hands-on per step: median off by ${handsErr[Math.floor(handsErr.length / 2)].toFixed(1)} min, 90th percentile ${handsErr[Math.floor(handsErr.length * 0.9)].toFixed(1)} min; total ${codeHands.toFixed(0)} min against ${keyHands.toFixed(0)} reviewed`);
if (args.includes("--misses")) for (const [k, v] of Object.entries(miss)) console.log(`\n${k}:\n  ${v.join("\n  ")}`);
