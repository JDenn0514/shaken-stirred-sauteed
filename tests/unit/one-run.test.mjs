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
