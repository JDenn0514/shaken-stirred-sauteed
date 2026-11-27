// The dependency check (scripts/check-deps.mjs): the Worker's code ships with
// its dependencies, so when they change, supply-chain-risk-auditor runs on them
// before they reach main (docs/specs/multi-user-security.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDeps } from "../helpers/check-deps.mjs";

// A Worker that needs better-auth (which needs jose) and zod, beside dev tools.
const LOCK = {
  "": { name: "site", devDependencies: { playwright: "^1" } },
  worker: { dependencies: { "better-auth": "^1.7.0", zod: "^4" }, devDependencies: { vitest: "^5" } },
  "node_modules/better-auth": { version: "1.7.23", dependencies: { jose: "^6" }, peerDependencies: { react: "*" }, peerDependenciesMeta: { react: { optional: true } } },
  "node_modules/jose": { version: "6.1.0" },
  "node_modules/zod": { version: "4.6.7" },
  "node_modules/playwright": { version: "1.60.0", dev: true },
  "node_modules/vitest": { version: "5.1.1", dev: true },
  "node_modules/esbuild": { version: "0.28.2" },
};
const SHIPPED = ["better-auth@1.7.23", "jose@6.1.0", "zod@4.6.7"];
const audited = (packages) => ({ audited: "2026-11-27", packages });

test("passes when the Worker's dependencies are the ones audited", () => {
  const run = checkDeps({ lock: LOCK, record: audited(SHIPPED) });
  assert.ok(run.ok, run.output);
});

test("follows the Worker's dependencies, not the dev tools or what isn't reached", () => {
  const run = checkDeps({ lock: LOCK, record: audited([]) });
  assert.ok(!run.ok);
  for (const p of SHIPPED) assert.match(run.output, new RegExp(`\\+ ${p}`));
  for (const p of ["playwright", "vitest", "esbuild", "react"]) assert.doesNotMatch(run.output, new RegExp(p));
});

test("a changed version fails, naming both, and says how to audit and record", () => {
  const lock = { ...LOCK, "node_modules/jose": { version: "6.2.0" } };
  const run = checkDeps({ lock, record: audited(SHIPPED) });
  assert.ok(!run.ok);
  assert.match(run.output, /- jose@6\.1\.0/);
  assert.match(run.output, /\+ jose@6\.2\.0/);
  assert.match(run.output, /supply-chain-risk-auditor/);
  assert.match(run.output, /~\/security-audit-skill\//);
  assert.match(run.output, /node scripts\/check-deps\.mjs --record/);
});

test("a dependency nested under its parent is the one used", () => {
  const lock = { ...LOCK, "node_modules/better-auth/node_modules/jose": { version: "5.0.0" } };
  const run = checkDeps({ lock, record: audited(["better-auth@1.7.23", "jose@5.0.0", "zod@4.6.7"]) });
  assert.ok(run.ok, run.output);
});

test("--record writes what's shipped now, with today's date", () => {
  const run = checkDeps({ lock: LOCK, args: ["--record"] });
  assert.ok(run.ok, run.output);
  assert.deepEqual(run.record.packages, SHIPPED);
  assert.match(run.record.audited, /^\d{4}-\d{2}-\d{2}$/);
});

test("with no record, it fails and says how to make one", () => {
  const run = checkDeps({ lock: LOCK });
  assert.ok(!run.ok);
  assert.match(run.output, /--record/);
});

test("follows required peers, optional dependencies and scoped names, and leaves out optional peers", () => {
  const lock = {
    worker: { dependencies: { "@scope/auth": "^1" } },
    "node_modules/@scope/auth": {
      version: "1.0.0",
      dependencies: { "@scope/core": "^1" },
      optionalDependencies: { "native-speedup": "^2" },
      peerDependencies: { kysely: "*", react: "*" },
      peerDependenciesMeta: { react: { optional: true } },
    },
    "node_modules/@scope/core": { version: "1.2.0" },
    "node_modules/native-speedup": { version: "2.0.0", optional: true },
    "node_modules/kysely": { version: "0.29.9" },
    "node_modules/react": { version: "19.0.0" },
  };
  const run = checkDeps({ lock, args: ["--record"] });
  assert.ok(run.ok, run.output);
  assert.deepEqual(run.record.packages, ["@scope/auth@1.0.0", "@scope/core@1.2.0", "kysely@0.29.9", "native-speedup@2.0.0"]);
});

test("a workspace package it uses is followed to its own folder", () => {
  const lock = {
    worker: { dependencies: { shared: "*" } },
    "node_modules/shared": { resolved: "shared", link: true },
    shared: { name: "shared", version: "0.1.0", dependencies: { jose: "^6" } },
    "node_modules/jose": { version: "6.1.0" },
  };
  const run = checkDeps({ lock, args: ["--record"] });
  assert.ok(run.ok, run.output);
  assert.deepEqual(run.record.packages, ["jose@6.1.0", "shared@0.1.0"]);
});
