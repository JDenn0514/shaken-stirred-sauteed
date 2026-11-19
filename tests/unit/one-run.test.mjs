// Finding another browser test run on this Mac (tests/helpers/one-run.mjs), so
// a second run stops instead of slowing both down.
import { test } from "node:test";
import assert from "node:assert/strict";
import { otherRuns } from "../helpers/one-run.mjs";

// `ps -Ao pid=,ppid=,command=` as macOS prints it.
const ps = (...rows) => rows.map(([pid, ppid, command]) => `${String(pid).padStart(5)} ${String(ppid).padStart(5)} ${command}`).join("\n");

const MINE = [
  [100, 1, "npm run test:e2e"],
  [101, 100, "sh -c playwright test --project=chrome"],
  [102, 101, "node /Users/me/site/node_modules/.bin/playwright test --project=chrome"],
];

test("a run alone finds no other run, though its own parents name playwright test", () =>
  assert.deepEqual(otherRuns(ps(...MINE), 102), []));

test("another checkout's run is found, with its command", () =>
  assert.deepEqual(
    otherRuns(ps(...MINE, [200, 1, "node /Users/me/other/node_modules/.bin/playwright test cook-mode"]), 102),
    [{ pid: 200, command: "node /Users/me/other/node_modules/.bin/playwright test cook-mode" }],
  ));

test("npx playwright test is found, once, by its node process", () =>
  assert.deepEqual(otherRuns(ps(
    ...MINE,
    [300, 1, "npm exec playwright test --project=webkit"],
    [301, 300, "node /Users/me/other/node_modules/.bin/playwright test --project=webkit"],
  ), 102).map((r) => r.pid), [301]));

test("a shell whose command only mentions playwright test isn't a run, even a copy of this run's own shell", () =>
  assert.deepEqual(otherRuns(ps(
    [90, 1, "/bin/zsh -c eval 'npx playwright test accessibility | grep -E passed'"],
    [91, 90, "/bin/zsh -c eval 'npx playwright test accessibility | grep -E passed'"],
    [92, 91, "npm exec playwright test accessibility"],
    [93, 92, "node /Users/me/site/node_modules/.bin/playwright test accessibility"],
    [94, 90, "/bin/zsh -c eval 'npx playwright test accessibility | grep -E passed'"],
    [95, 1, "/bin/zsh -c eval 'git commit -m \"run playwright test first\"'"],
  ), 93), []));

test("the Playwright browser tool and Playwright's own workers aren't runs", () =>
  assert.deepEqual(otherRuns(ps(
    ...MINE,
    [400, 1, "npm exec @playwright/mcp@latest"],
    [401, 400, "node /Users/me/.npm/_npx/abc/node_modules/.bin/playwright-mcp"],
    [402, 102, "node /Users/me/site/node_modules/playwright/lib/common/process.js"],
    [403, 1, "node /Users/me/site/node_modules/.bin/playwright show-report"],
  ), 102), []));

// The VS Code extension keeps `cli.js test-server` running while the editor is
// open, and runs tests in it: its workers exist only while tests are running.
const WORKER = "/opt/homebrew/bin/node /Users/me/other/node_modules/playwright/lib/worker/workerProcessEntry.js";
const VSCODE = [500, 1, "/opt/homebrew/bin/node /Users/me/other/node_modules/@playwright/test/cli.js test-server -c playwright.config.mjs"];

test("a VS Code run is found by its workers, once, as the test server running them", () =>
  assert.deepEqual(otherRuns(ps(...MINE, VSCODE, [501, 500, WORKER], [502, 500, WORKER]), 102), [{ pid: 500, command: VSCODE[2] }]));

test("VS Code's test server sitting idle isn't a run", () =>
  assert.deepEqual(otherRuns(ps(...MINE, VSCODE), 102), []));

test("node …/cli.js test is found", () =>
  assert.deepEqual(otherRuns(ps(...MINE, [600, 1, "node /Users/me/other/node_modules/@playwright/test/cli.js test --project=chrome"]), 102).map((r) => r.pid), [600]));

test("this run's own workers, under it, aren't another run", () =>
  assert.deepEqual(otherRuns(ps(...MINE, [103, 102, WORKER.replace("other", "site")], [104, 102, WORKER.replace("other", "site")]), 102), []));

test("a worker left behind by a crashed run is reported as itself, not as launchd", () =>
  assert.deepEqual(otherRuns(ps(...MINE, [1, 0, "/sbin/launchd"], [700, 1, WORKER]), 102), [{ pid: 700, command: WORKER }]));

test("a run started with node flags is found, by its runner and its workers", () => {
  const runner = "node --inspect /Users/me/other/node_modules/.bin/playwright test";
  assert.deepEqual(otherRuns(ps(...MINE, [800, 1, runner]), 102).map((r) => r.pid), [800]);
  assert.deepEqual(otherRuns(ps(...MINE, [810, 1, "zsh"], [811, 810, WORKER.replace("node ", "node --inspect ")]), 102).map((r) => r.pid), [810]);
});
