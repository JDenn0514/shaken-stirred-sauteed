// Fake outside websites for /api/fetch's tests (runs in Node, outside the
// Worker, like fake-github.js). recipes.example is a recipe site; every
// address it's asked for is noted, so a test can check that a private address
// was never reached. GET https://fake-sites.test/reached lists them.
const reached = [];

const LEMON_BARS = `<!doctype html><html><head><title>Lemon Bars</title>
<meta property="og:site_name" content="Example Kitchen">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Recipe","name":"Lemon Bars",
"recipeIngredient":["1 cup flour","2 lemons"],"recipeInstructions":["Mix.","Bake 25 minutes."]}</script>
</head><body><h1>Lemon Bars</h1></body></html>`;

const MB = 1024 * 1024;
const page = (html, init = {}) => new Response(html, { ...init, headers: { "Content-Type": "text/html; charset=utf-8", ...init.headers } });
const redirect = (to, status = 302) => new Response(null, { status, headers: { Location: to } });

export async function fakeSites(request) {
  const url = new URL(request.url);
  if (url.origin === "https://fake-sites.test") return Response.json(reached);
  reached.push(url.href);
  if (url.hostname !== "recipes.example") return new Response("A private address was reached", { status: 599 });

  switch (url.pathname) {
    case "/lemon-bars": return page(LEMON_BARS);
    case "/user-agent": return page(request.headers.get("User-Agent") || "");
    case "/moved": return redirect("/lemon-bars", 301);
    case "/to-local": return redirect("https://127.0.0.1/admin");
    case "/to-private": return redirect("https://10.0.0.1/");
    case "/to-http": return redirect("http://recipes.example/lemon-bars");
    case "/loop": return redirect("/loop");
    case "/huge": return page("x".repeat(6 * MB));
    case "/huge-unannounced": {
      // No Content-Length: the size is only known by reading it.
      const chunk = new TextEncoder().encode("x".repeat(MB));
      let sent = 0;
      return page(new ReadableStream({
        pull(c) { if (sent++ < 6) c.enqueue(chunk); else c.close(); },
      }));
    }
    case "/slow":
      await new Promise((r) => setTimeout(r, 2000));
      return page(LEMON_BARS);
    case "/refused": return new Response("Access denied", { status: 403 });
    // Serious Eats answered an automated request with 402 ("payment required"),
    // though it has no paywall.
    case "/payment-required": return new Response("Payment required", { status: 402 });
    case "/missing": return new Response("Not found", { status: 404 });
    case "/photo.jpg": return new Response("not really a jpeg", { headers: { "Content-Type": "image/jpeg" } });
    default: return new Response("Not found", { status: 404 });
  }
}
