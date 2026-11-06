// A recipe website's page (its HTML, fetched by the Worker's /api/fetch) to a
// draft recipe:
//
//   draftFromPage(html, { url, category, titles })
//
// From the page's schema.org recipe data when it has some (exact), otherwise
// from its visible text, read like pasted text. Either way `source` is the
// author and the site's name, and the page's address. Works in a browser and
// in Node (no DOM needed), so it's tested in tests/unit/intake-page.test.mjs.
import { draftFromSchemaOrg, draftFromText, findSchemaOrgRecipe } from "./intake.mjs";

export function draftFromPage(html, opts = {}) {
  const data = findSchemaOrgRecipe(html);
  const site = siteName(html, data, opts.url);
  if (data) {
    const draft = draftFromSchemaOrg(data, opts);
    const author = [].concat(data.author || [])[0];
    draft.recipe.source = { name: names(typeof author === "string" ? author : author?.name, site), url: opts.url || data.url || "" };
    return draft;
  }
  const draft = draftFromText([pageText(html)], opts);
  draft.recipe.source = { name: site, url: opts.url || "" };
  draft.flags.push({ kind: "page-text", text: "", why: "this page has no recipe data, so it was read from the page's text: check everything against the page" });
  return draft;
}

const names = (...parts) => [...new Set(parts.map((p) => decode(p || "").trim()).filter(Boolean))].join(", ");

// The site's own name (og:site_name), its recipe data's publisher, or else
// its address without "www.".
function siteName(html, data, url) {
  const og = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => attrs(tag)).find((a) => a.property === "og:site_name" && a.content);
  const publisher = [].concat(data?.publisher || [])[0];
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* no address */ }
  return names(og?.content || (typeof publisher === "string" ? publisher : publisher?.name) || host);
}

function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(([, k, a, b, c]) => [k.toLowerCase(), a ?? b ?? c]));
}

// The text a visitor reads: the article (or main part) of the page, one line
// per paragraph, heading or list item. Menus, scripts, styles, forms and the
// like are left out.
export function pageText(html) {
  let doc = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of ["head", "script", "style", "noscript", "template", "svg", "iframe"]) doc = drop(doc, tag);
  const h1 = text(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(doc)?.[1] || "");
  let part = /<article\b[^>]*>([\s\S]*)<\/article>/i.exec(doc)?.[1]
    ?? /<main\b[^>]*>([\s\S]*)<\/main>/i.exec(doc)?.[1]
    ?? /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(doc)?.[1]
    ?? doc;
  for (const tag of ["nav", "aside", "footer", "form", "button", "select", "figure"]) part = drop(part, tag);
  const body = text(part);
  return h1 && !body.startsWith(h1) ? `${h1}\n${body}` : body;
}

const drop = (html, tag) => html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi"), "\n");

const BLOCK = /<\/?(?:p|div|li|ul|ol|h[1-6]|br|tr|td|th|table|section|header|dt|dd|dl|blockquote|figcaption|hr)\b[^>]*>/gi;
function text(html) {
  return decode(html.replace(BLOCK, "\n").replace(/<[^>]*>/g, ""))
    .split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean).join("\n");
}

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", deg: "°", copy: "©", reg: "®", trade: "™",
  frac12: "½", frac14: "¼", frac34: "¾", frac13: "⅓", frac23: "⅔", frac18: "⅛", times: "×", hellip: "…",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", eacute: "é", egrave: "è", ntilde: "ñ",
};
function decode(s) {
  return s.replace(/&(#x[\da-f]+|#\d+|[a-z]\w*);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
