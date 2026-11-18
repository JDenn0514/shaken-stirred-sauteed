// Stop hook: when the working tree has changes, runs the checks that take under
// a second (lint, broken links, the recipe checker) before Claude ends its turn.
// A failure goes back to Claude to fix; the second time in a row it lets the
// turn end, so a failure Claude can't fix doesn't trap it. The unit, Worker and
// browser tests are slower: they run in npm test and, unit and Worker, before
// every push.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const { stop_hook_active: again } = JSON.parse(readFileSync(0, "utf8"));
const run = (command) => execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

if (again || run("git status --porcelain").trim() === "") process.exit(0);

for (const check of ["npm run --silent lint", "npm run --silent check:links", "node scripts/build-index.mjs"]) {
  try {
    run(check);
  } catch (error) {
    process.stderr.write(`${check} failed. Fix it before finishing, or say why it can't be fixed.\n${error.stdout}${error.stderr}`);
    process.exit(2);
  }
}
