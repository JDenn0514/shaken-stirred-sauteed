// Runs the real scripts/build-index.mjs against a throwaway recipes/ folder,
// so tests can feed it any recipes without touching the real ones.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(REPO, "scripts", "build-index.mjs");

// recipes: { "<slug>": recipeObject, ... }  (a string value is written as-is, for broken JSON)
// Returns { ok, errors, warnings, output, index } (errors and warnings are lists of messages).
export function buildIndex(recipes) {
  const dir = mkdtempSync(join(tmpdir(), "sss-build-"));
  try {
    mkdirSync(join(dir, "recipes"));
    copyFileSync(join(REPO, "recipes", "vocabulary.json"), join(dir, "recipes", "vocabulary.json"));
    for (const [slug, r] of Object.entries(recipes)) {
      writeFileSync(join(dir, "recipes", `${slug}.json`), typeof r === "string" ? r : JSON.stringify(r));
    }
    const run = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8" });
    const ok = run.status === 0;
    // stderr holds a "N warning(s):" list, then (on failure) a "Found N problem(s):" list.
    const [warnPart, errorPart = ""] = run.stderr.split(/^Found \d+ problem\(s\):$/m);
    const items = (text) => text.split("\n").filter((l) => l.startsWith("  - ")).map((l) => l.slice(4));
    return {
      ok,
      errors: items(errorPart),
      warnings: items(warnPart),
      output: run.stdout + run.stderr,
      index: ok ? JSON.parse(readFileSync(join(dir, "recipes", "index.json"), "utf8")) : null,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A minimal recipe that passes every check; spread overrides onto it.
export const recipe = (overrides = {}) => ({
  title: "Test Recipe",
  category: "cooking",
  ingredients: ["1 cup rice"],
  steps: ["Cook the rice."],
  tags: { ingredients: ["rice"] },
  time: { total: 20 },
  ...overrides,
});
