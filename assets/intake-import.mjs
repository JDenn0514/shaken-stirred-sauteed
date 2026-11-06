// The recipe intake's other ways in (intake.html), besides pasted text:
// - a recipe website's address: the Worker gets the page (POST /api/fetch,
//   signed in only), then tools/intake/page.mjs reads its recipe data, or its
//   text when it has none;
// - a PDF: pdf.js (assets/vendor/pdfjs, loaded only when a PDF is chosen)
//   reads its text in the browser, then the text reader takes over. A scanned
//   PDF has no text to read; Live Text on a screenshot reads it far better than
//   any OCR this site could run (tools/intake/README.md, "Reading photos").
// Photos stay copy and paste with Live Text.
import { draftFromPage } from "../tools/intake/page.mjs";
import { draftFromText } from "../tools/intake/intake.mjs";

const $ = (id) => document.getElementById(id);

// show(draft): starts the review with { recipe, flags }. titles(): the site's
// recipe slugs and titles, to link ingredients to recipes.
export function startImport({ show, titles }) {
  const form = $("read");
  const say = (problem, status = "") => {
    $("import-problem").hidden = !problem;
    $("import-problem").textContent = problem;
    $("import-status").textContent = status;
  };
  const category = () => {
    const chosen = new FormData(form).get("category");
    if (!chosen) say("Choose Baking, Cooking or Cocktails first.");
    return chosen;
  };
  const found = (draft) => draft.recipe && (draft.recipe.ingredients.length || draft.recipe.steps.length);

  // --- A recipe website ---
  async function getPage() {
    const address = $("page-url").value.trim();
    const cat = category();
    if (!cat) return;
    if (!address) {
      say("Paste the recipe's web address first.");
      return;
    }
    const button = $("get-page");
    button.disabled = true;
    say("", "Getting the page…");
    try {
      let res;
      try {
        res = await fetch("/api/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: address }),
        });
      } catch {
        say("Couldn't reach this site's server. Check you're online and try again.");
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        say("Sign in to get a recipe from a website (“Sign in” is at the bottom of the page). Or copy the recipe's text from the site and paste it below.");
        return;
      }
      if (!res.ok || typeof body.html !== "string") {
        say(body.error || "Couldn't get that page. Copy the recipe's text from the site and paste it below.");
        return;
      }
      const draft = draftFromPage(body.html, { url: body.url || address, category: cat, titles: { ...titles() } });
      if (!found(draft)) {
        say("Couldn't find a recipe on that page. Copy the recipe's text from the site and paste it below.");
        return;
      }
      say("");
      show(draft);
    } finally {
      button.disabled = false;
    }
  }
  $("get-page").addEventListener("click", getPage);
  // Enter in the address gets the page, rather than reading the pasted text.
  $("page-url").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    getPage();
  });

  // --- A PDF ---
  $("pdf").addEventListener("change", async (e) => {
    const input = e.target;
    const file = input.files[0];
    if (!file) return;
    const cat = category();
    if (!cat) {
      input.value = "";
      return;
    }
    say("", `Reading ${file.name}…`);
    let pages;
    try {
      pages = await pdfText(new Uint8Array(await file.arrayBuffer()));
    } catch (error) {
      console.error(error);
      say(error?.name === "PasswordException"
        ? "That PDF is locked with a password. Open it, copy the recipe's text, and paste it below."
        : "Couldn't open that file as a PDF. Open it, copy the recipe's text, and paste it below.");
      return;
    } finally {
      input.value = "";
    }
    if (!pages.some((p) => p.trim())) {
      say("That PDF has no text in it: it's a scan or a photo of the pages. Take a screenshot of each page and copy its text with Live Text (below).");
      return;
    }
    const draft = draftFromText(pages, { category: cat, titles: { ...titles() } });
    if (!found(draft)) {
      say("Couldn't find a recipe in that PDF. Open it, copy the recipe's text, and paste it below.");
      return;
    }
    say("");
    show(draft);
  });
}

// Each page's text, a line at a time, as pdf.js reads it.
async function pdfText(data) {
  const pdfjs = await import("./vendor/pdfjs/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  const loading = pdfjs.getDocument({ data, isEvalSupported: false });
  const pdf = await loading.promise;
  try {
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const { items } = await (await pdf.getPage(n)).getTextContent();
      pages.push(items.map((i) => (i.str ?? "") + (i.hasEOL ? "\n" : "")).join(""));
    }
    return pages;
  } finally {
    loading.destroy();
  }
}
