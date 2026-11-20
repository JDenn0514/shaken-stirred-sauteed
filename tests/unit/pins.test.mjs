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

// A release tag for now: a commit SHA in `ref` needs Claude Code 2.1.324 or
// later, and this Mac had 2.1.201 (2026-11-20). The plugin's source is the
// marketplace's own folder ("./"), so pinning the marketplace pins the plugin.
test("the project's plugin marketplaces are pinned to a version", async () => {
  const settings = JSON.parse(await readFile(new URL(".claude/settings.json", root), "utf8"));
  for (const [name, { source }] of Object.entries(settings.extraKnownMarketplaces ?? {})) {
    assert.ok(source.ref, `.claude/settings.json: give the "${name}" marketplace a ref (a release tag or commit)`);
    assert.notEqual(source.ref, "main", `.claude/settings.json: "${name}" follows a branch; pin it to a release tag or commit`);
  }
});
