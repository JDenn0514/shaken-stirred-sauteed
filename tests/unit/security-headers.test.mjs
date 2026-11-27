// The security headers every response carries (docs/specs/multi-user-security.md,
// rule 6). Cloudflare adds them to the site's files from _headers; the Worker
// adds the same ones itself (worker/src/headers.ts), since _headers doesn't
// reach what the Worker answers. This checks the two lists agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SECURITY_HEADERS } from "../../worker/src/headers.ts";

// _headers' rules: a path line, then indented "Name: value" lines.
async function rules() {
  const text = await readFile(new URL("../../_headers", import.meta.url), "utf8");
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) out.push({ path: line.trim(), headers: [] });
    else out.at(-1).headers.push(line.trim());
  }
  return out;
}

test("_headers gives every file the Worker's security headers", async () => {
  const all = (await rules()).find((r) => r.path === "/*");
  assert.ok(all, "_headers needs a /* rule");
  const set = Object.fromEntries(all.headers.map((h) => [h.slice(0, h.indexOf(":")), h.slice(h.indexOf(":") + 1).trim()]));
  assert.deepEqual(set, SECURITY_HEADERS);
});

test("no _headers rule takes a security header away", async () => {
  for (const { path, headers } of await rules()) {
    for (const h of headers) {
      const name = h.replace(/^!\s*/, "").split(":")[0].trim();
      assert.ok(!(h.startsWith("!") && name in SECURITY_HEADERS), `${path} detaches ${name}`);
    }
  }
});

test("the referrer policy keeps the Origin header that saving checks", () => {
  // With no-referrer, a browser sends "Origin: null" on the editor's POSTs and
  // the Worker refuses every save (worker/src/index.ts).
  assert.notEqual(SECURITY_HEADERS["Referrer-Policy"], "no-referrer");
});
