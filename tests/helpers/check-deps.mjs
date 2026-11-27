// Runs the real scripts/check-deps.mjs against a throwaway folder holding a
// made-up package-lock.json and record, so tests can feed it any lockfile.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(REPO, "scripts", "check-deps.mjs");
const RECORD = "worker/audited-dependencies.json";

// lock: the lockfile's "packages"; record: what was audited (or none).
// Returns { ok, output, record }: record is the file afterwards.
export function checkDeps({ lock, record, args = [] }) {
  const dir = mkdtempSync(join(tmpdir(), "sss-deps-"));
  try {
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: lock }));
    mkdirSync(join(dir, "worker"));
    if (record) writeFileSync(join(dir, RECORD), JSON.stringify(record));
    const run = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: "utf8" });
    return {
      ok: run.status === 0,
      output: run.stdout + run.stderr,
      record: existsSync(join(dir, RECORD)) ? JSON.parse(readFileSync(join(dir, RECORD), "utf8")) : null,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
