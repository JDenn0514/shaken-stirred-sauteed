// Stops a browser test run when another one is already running on this Mac
// (another session's or checkout's included): two runs at once slow each other
// down badly. Playwright's globalSetup (playwright.config.mjs) runs this once,
// before any test. CI runs one per machine, so it's skipped there.
import { execFileSync } from "node:child_process";

// A run shows up two ways:
// - its runner, `node …/playwright test …` or `node …/playwright/cli.js test …`.
//   Shells and npm whose command only mentions it don't count: a shell running
//   a pipe forks copies of itself with the same command, and those aren't this
//   run's parents.
// - its workers, which exist only while tests are running. That's how a run
//   from the VS Code extension shows: it keeps `cli.js test-server` open while
//   the editor is, idle most of the time, and runs tests in it.
// `(\s+-\S+)*`: node's own flags (`node --inspect …`), which workers inherit.
const RUNNER = /^\S*node(\s+-\S+)*\s+(\S*\/playwright(\.js)?|\S*\/@?playwright(\/test)?\/cli\.js)\s+test(\s|$)/;
const WORKER = /^\S*node(\s+-\S+)*\s+\S*\/playwright\/lib\/(worker\/workerProcessEntry|common\/process)\.js(\s|$)/;

// The other runs in `ps -Ao pid=,ppid=,command=` output, one entry each: a
// runner, or the process whose workers are running. This run, its parents and
// its own workers don't count.
export function otherRuns(psOutput, pid) {
  const rows = psOutput.split("\n").map((line) => line.match(/^\s*(\d+)\s+(\d+)\s(.*)$/)).filter(Boolean)
    .map(([, p, pp, command]) => ({ pid: Number(p), ppid: Number(pp), command: command.trim() }));
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const mine = new Set();
  for (let p = pid; p && !mine.has(p); p = byPid.get(p)?.ppid) mine.add(p);
  const runs = new Map();
  for (const r of rows) {
    if (mine.has(r.pid) || r.ppid === pid) continue;
    // A worker whose run crashed is left under launchd (pid 1): name the worker.
    const run = RUNNER.test(r.command) ? r : WORKER.test(r.command) ? (r.ppid > 1 && byPid.get(r.ppid)) || r : null;
    if (run) runs.set(run.pid, { pid: run.pid, command: run.command });
  }
  return [...runs.values()];
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
