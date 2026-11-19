// PreToolUse hook (Bash): blocks `git push --no-verify`, which skips the
// pre-push checks (npm run check). The reason goes back to Claude.
import { readFileSync } from "node:fs";

const { tool_input: input = {} } = JSON.parse(readFileSync(0, "utf8"));
const command = input.command ?? "";
// Only a git command itself: at the start or after ; & |, so a commit message
// or PR body that mentions the flag isn't blocked.
if (/(^|[;&|]\s*)git[ \t]+(\S+[ \t]+)*?push\b[^;&|\n]*--no-verify\b/.test(command.trimStart())) {
  process.stderr.write(
    "Blocked: --no-verify skips the pre-push checks (npm run check). " +
    "Run npm run check, fix what it finds, then push without --no-verify.\n",
  );
  process.exit(2);
}
