// Runs the real scripts/check-links.mjs against a throwaway folder of made-up
// site files, so tests can feed it any pages without touching the real site.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(REPO, "scripts", "check-links.mjs");

// files: { "<path>": "<contents>", ... }  (an object value is written as JSON)
// Returns { ok, broken, output }: broken is a list of "<file>: <path>" messages.
export function checkLinks(files) {
  const dir = mkdtempSync(join(tmpdir(), "sss-links-"));
  try {
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), typeof body === "string" ? body : JSON.stringify(body));
    }
    const run = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8" });
    return {
      ok: run.status === 0,
      broken: run.stderr.split("\n").filter((l) => l.startsWith("  - ")).map((l) => l.slice(4)),
      output: run.stdout + run.stderr,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
