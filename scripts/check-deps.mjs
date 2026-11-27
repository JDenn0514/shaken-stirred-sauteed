// The Worker ships with its dependencies, and they hold everyone's sessions, so
// when they change, supply-chain-risk-auditor (Trail of Bits) looks at them
// before they reach main (docs/specs/multi-user-security.md). This compares
// what the Worker would ship now, from package-lock.json, with what was last
// audited (worker/audited-dependencies.json), and fails until they match.
//
//   node scripts/check-deps.mjs            check (part of npm run check)
//   node scripts/check-deps.mjs --record   after an audit: record what's shipped now
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const RECORD = "worker/audited-dependencies.json";
const { packages } = JSON.parse(readFileSync("package-lock.json", "utf8"));

// Where npm installed `name` for the package at `from`: its own node_modules,
// then each folder above it, as Node looks it up.
function resolve(from, name) {
  for (let at = from; ; ) {
    const path = `${at ? `${at}/` : ""}node_modules/${name}`;
    if (packages[path]) return path;
    if (!at) return null;
    const up = at.lastIndexOf("/node_modules/");
    at = up === -1 ? "" : at.slice(0, up); // "worker" or a top-level package: the root next
  }
}

// Every package reached from the Worker's dependencies (not its dev tools),
// with its required peers and the optional dependencies npm installed.
function shipped() {
  const seen = new Map();
  const visit = (from, names) => {
    for (const name of names) {
      let path = resolve(from, name);
      // Not installed: an optional dependency npm skipped. (A required peer
      // that's missing would fail at build time, not here.)
      if (!path) continue;
      // A workspace package: its entry is at its own folder.
      if (packages[path].link) path = packages[path].resolved;
      if (seen.has(path) || !packages[path]) continue;
      const p = packages[path];
      seen.set(path, `${name}@${p.version}`);
      const peers = Object.keys(p.peerDependencies ?? {}).filter((n) => !p.peerDependenciesMeta?.[n]?.optional);
      visit(path, [...Object.keys(p.dependencies ?? {}), ...Object.keys(p.optionalDependencies ?? {}), ...peers]);
    }
  };
  visit("worker", Object.keys(packages.worker?.dependencies ?? {}));
  return [...new Set(seen.values())].sort();
}

const now = shipped();
if (process.argv.includes("--record")) {
  writeFileSync(RECORD, JSON.stringify({ audited: new Date().toISOString().slice(0, 10), packages: now }, null, 2) + "\n");
  console.log(`Recorded the Worker's ${now.length} dependencies as audited (${RECORD}).`);
  process.exit(0);
}

const HOW = `Run supply-chain-risk-auditor on this repo (its report goes in ~/security-audit-skill/shaken-stirred-sauteed/, never here), deal with what it finds, then run: node scripts/check-deps.mjs --record
and commit worker/audited-dependencies.json (for a Dependabot PR, on its branch).`;
if (!existsSync(RECORD)) {
  console.error(`No record of the Worker's audited dependencies (${RECORD}).\n${HOW}`);
  process.exit(1);
}
const was = JSON.parse(readFileSync(RECORD, "utf8")).packages ?? [];
const added = now.filter((p) => !was.includes(p));
const gone = was.filter((p) => !now.includes(p));
if (added.length || gone.length) {
  console.error([
    "The Worker's dependencies changed since they were last audited:",
    ...gone.map((p) => `  - ${p}`),
    ...added.map((p) => `  + ${p}`),
    HOW,
  ].join("\n"));
  process.exit(1);
}
console.log(`The Worker's ${now.length} dependencies are the ones audited.`);
