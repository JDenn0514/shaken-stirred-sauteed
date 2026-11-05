// The Worker's code. Cloudflare serves the site's files directly; this only
// runs for /api/ (see wrangler.jsonc) and for addresses that aren't a file.
// The editor's sign-in and saving will live under /api/; for now it has nothing.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    // A folder ("/", "/style-guides/x/"): its index.html, as GitHub Pages did.
    if (url.pathname.endsWith("/")) {
      url.pathname += "index.html";
      return env.ASSETS.fetch(new Request(url, request));
    }
    return new Response("Not found", { status: 404 });
  },
};
