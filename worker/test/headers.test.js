// What the Worker answers carries the site's security headers too: _headers
// only reaches the files Cloudflare serves without it.
import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS } from "../src/headers.js";
import { browser } from "./browser.js";

describe("security headers", () => {
  for (const path of ["/", "/style-guides/field-guide-spice/", "/api/me", "/api/nothing-here", "/not-a-file"]) {
    it(`are on ${path}`, async () => {
      const res = await browser().fetch(path);
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(res.headers.get(name), name).toBe(value);
    });
  }
});
