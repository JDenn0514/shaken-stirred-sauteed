// Code from elsewhere that runs here is pinned, so a moved tag can't change
// what runs (docs/specs/multi-user-security.md). Dependabot still updates the
// Actions: it moves the commit and the version in the comment together.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../../", import.meta.url);

test("every GitHub Action is pinned to a commit, with its version beside it", async () => {
  const dir = new URL(".github/workflows/", root);
  for (const name of await readdir(dir)) {
    const text = await readFile(new URL(name, dir), "utf8");
    for (const [line] of text.matchAll(/uses:.*/g)) {
      if (/uses:\s*\.\//.test(line)) continue; // an Action in this repo
      assert.match(line, /uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/,
        `${name}: pin "${line}" to a commit, as uses: owner/action@<40-character SHA> # v1.2.3`);
    }
  }
});

// A commit in `ref` needs Claude Code 2.1.324 or later (the desktop app and
// `claude update` have it). Each plugin turned on has its source inside its
// marketplace ("./" or "./plugins/<name>"), so pinning the marketplace pins
// it. When moving a pin, check that's still so: a plugin from its own repo
// would need its own `sha`.
test("the project's plugin marketplaces are pinned to a commit", async () => {
  const settings = JSON.parse(await readFile(new URL(".claude/settings.json", root), "utf8"));
  for (const [name, { source }] of Object.entries(settings.extraKnownMarketplaces ?? {})) {
    assert.match(source.ref ?? "", /^[0-9a-f]{40}$/,
      `.claude/settings.json: pin the "${name}" marketplace to a commit: "ref": "<40-character SHA>" (a release's commit)`);
  }
});

// A plugin the project turns on comes from a marketplace defined (and pinned)
// above, so nothing it runs follows a moving branch.
test("every plugin the project turns on comes from one of its pinned marketplaces", async () => {
  const settings = JSON.parse(await readFile(new URL(".claude/settings.json", root), "utf8"));
  const pinned = new Set(Object.keys(settings.extraKnownMarketplaces ?? {}));
  for (const [plugin, on] of Object.entries(settings.enabledPlugins ?? {})) {
    if (!on) continue;
    const market = plugin.split("@")[1];
    assert.ok(pinned.has(market),
      `.claude/settings.json: "${plugin}" comes from "${market}", which isn't in extraKnownMarketplaces with a pinned ref. Add it there, pinned to a commit.`);
  }
});
