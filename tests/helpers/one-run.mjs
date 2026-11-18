// Stops a browser test run when another one is already running on this Mac
// (another session's or checkout's included): two runs at once slow each other
// down badly. Playwright's globalSetup (playwright.config.mjs) runs this once,
// before any test. CI runs one per machine, so it's skipped there.
import { execFileSync } from "node:child_process";

const RUN = /(^|[\s/])playwright(\.js)? test(\s|$)/;

// The `playwright test` processes in `ps -Ao pid=,ppid=,command=` output,
// other than this run itself and the npm and shell processes that started it.
export function otherRuns(psOutput, pid) {
  const rows = psOutput.split("\n").map((line) => line.match(/^\s*(\d+)\s+(\d+)\s(.*)$/)).filter(Boolean)
    .map(([, p, pp, command]) => ({ pid: Number(p), ppid: Number(pp), command: command.trim() }));
  const parent = new Map(rows.map((r) => [r.pid, r.ppid]));
  const mine = new Set();
  for (let p = pid; p && !mine.has(p); p = parent.get(p)) mine.add(p);
  return rows.filter((r) => !mine.has(r.pid) && RUN.test(r.command)).map((r) => ({ pid: r.pid, command: r.command }));
}

export default function oneRunAtATime() {
  if (process.env.CI) return;
  const others = otherRuns(execFileSync("ps", ["-Ao", "pid=,ppid=,command="], { encoding: "utf8" }), process.pid);
  if (others.length === 0) return;
  throw new Error(
    "Another browser test run is already going on this Mac, and two at once slow each other down badly. " +
    "Wait for it to finish, then run again. It may be another session's: leave it running.\n" +
    others.map((o) => `  ${o.pid}  ${o.command}`).join("\n"),
  );
}
