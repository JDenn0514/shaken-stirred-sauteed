// PreToolUse hook (Bash): blocks `git push --no-verify`, which skips the
// pre-push checks (npm run check). The reason goes back to Claude.
import { readFileSync } from "node:fs";

const { tool_input: input = {} } = JSON.parse(readFileSync(0, "utf8"));
const command = input.command ?? "";
if (/\bgit\b[^;&|]*\bpush\b[^;&|]*--no-verify\b/.test(command)) {
  process.stderr.write(
    "Blocked: --no-verify skips the pre-push checks (npm run check). " +
    "Run npm run check, fix what it finds, then push without --no-verify.\n",
  );
  process.exit(2);
}
