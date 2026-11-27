// Security headers for every response (docs/specs/multi-user-security.md, rule 6).
// Cloudflare adds them to the site's files from _headers; the Worker adds them
// to what it answers (index.ts), which _headers doesn't reach.
// tests/unit/security-headers.test.mjs checks _headers matches this list.
export const SECURITY_HEADERS = {
  // No other site may show these pages in a frame (a meta tag can't say this).
  "Content-Security-Policy": "frame-ancestors 'none'",
  // A file is only ever what its Content-Type says.
  "X-Content-Type-Options": "nosniff",
  // Other sites see only the site's address, never a page's. Not no-referrer:
  // that makes browsers send "Origin: null" on saves, which the Worker refuses.
  "Referrer-Policy": "strict-origin-when-cross-origin",
};
