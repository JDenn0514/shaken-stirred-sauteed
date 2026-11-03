# Recipe editor: design

2026-11-03 · Jacob Dennen, with Claude

## Why

Adding a recipe today means copying `recipes/_template.json`, typing the recipe into JSON by hand, running `node scripts/build-index.mjs`, and committing on a computer. Jacob finds recipes now and then, on recipe websites, in cookbooks and in PDFs, often away from the computer. The editor makes that a job done in the site itself, on a phone or a computer: point it at a web page, a photo or a PDF, check what it read, fix what it got wrong, and save. The recipe is live a minute or two later.

The same editor replaces hand-editing JSON for good: it also starts a recipe from scratch, edits one that's already on the site, and deletes one.

## Goals

- One editor with three ways in: **import**, **new from scratch** and **edit existing**. It can also **delete** a recipe.
- Import from a **recipe website URL**, a **photo of a cookbook page**, a **screenshot** (of a PDF or anything else) and a **PDF file**.
- You review and fix the recipe **on a preview of how it will look on the site**, not on a form.
- **Save publishes it.** No JSON, no terminal, no second step on GitHub.
- **No money.** Everything runs on free tiers with no card on file, and a free limit being reached stops a feature for the day rather than billing anyone.
- **Nobody else connects to anything.** Visitors, and later friends and family, use the editor without accounts or keys of their own for any AI or service.
- Built so the multi-user version (friends and family adding their own recipes) can reuse it, with only the saving part swapped out.

## Non-goals

- **No accounts for anyone but Jacob yet.** Visitors see the site as today. Multi-user (accounts for others, recipes in a database, each person's own recipes) is its own project. This design only has to leave it easy to add.
- **Recipes stay as JSON files in the repo.** The database only holds sign-in data for now.
- **AI is optional, never required.** Import works fully without it, using structured website data, PDF text, OCR and rules. The optional AI step (below) only improves a draft.
- **No step images** (pictures showing how to do something). That's the next project, built on this editor (see "Later").
- **No change of hosting yet.** The site stays on GitHub Pages unless sign-in needs a shared domain (see "Signing in").
- **No drafts.** Save publishes. A recipe you want to finish later is either saved as it is and edited again, or not saved.
- **The editor doesn't work offline.** It needs a connection to save, sign in and fetch web pages. The rest of the site keeps working offline as today.
- No screenshot tests, offline tests or print layout tests (matching `.claude/rules/testing.md`).

## Anti-goals (failures even if it technically works)

- **Editing a recipe silently drops a field the editor doesn't show.** A recipe with `nutrition`, `origin`, `abv` or anything else the editor has no control for must come back out with those fields unchanged.
- **A save overwrites a change it didn't know about.** If the recipe or the index changed on GitHub since the editor loaded it (an edit from the other device, a commit from the computer), saving must stop and say so, not overwrite it.
- **A save that leaves the site broken.** A recipe that would fail `build-index.mjs` must never be committed. The recipe file and `recipes/index.json` change together in one commit, or not at all.
- **A wrong amount slips in unnoticed.** OCR misreads and AI "corrections" both change amounts. Anything the importer guessed or the AI changed must be easy to check against the original before saving.
- **A delete by accident.** One tap must never delete a recipe.
- **An original becomes public.** Photos of cookbook pages are someone else's work. Originals are only ever visible to Jacob.
- **A surprise bill.** No service is set up in a way that can charge money.
- **Visitors see editing controls that don't work for them.** Signed out, the site looks exactly as it does today.

## The pieces

Everything server-side runs on **Cloudflare's free plan**, in one Cloudflare account:

- **A Worker**: one small server program that handles sign-in, fetching recipe web pages, serving originals, and the optional AI step. Signed-out requests get nothing but the sign-in itself.
- **D1** (Cloudflare's SQLite database): holds only what sign-in needs (users, sessions, linked GitHub accounts). Recipe tables wait for the multi-user project.
- **R2** (Cloudflare's file storage): a private bucket for originals.
- **Workers AI** (optional): the vision model for the "Tidy up with AI" step.

Cloudflare was picked over Supabase because Supabase pauses free projects after about a week of no activity, which an editor used now and then would keep hitting. It was picked over Firebase because Firebase's file storage and functions need the pay-as-you-go plan, with a card and no hard spending cap. The cost of Cloudflare is that sign-in and access rules are built by us, not ready-made.

The site itself still talks to GitHub's API directly or through the Worker (builder's call, see "Saving"), and to the Worker for everything else.

Jacob creates the Cloudflare account, the GitHub App, and any keys, and puts the keys where the Worker reads them. Claude doesn't handle keys.

## Signing in

- **Sign in with GitHub**, run by **Better Auth inside the Worker**, with its tables in D1. When friends and family come, Better Auth adds Google or email sign-in for them, and Jacob's account carries over.
- The GitHub side is a **GitHub App installed only on this repo**, not an older OAuth app, which could only ask for access to all of Jacob's public repos. That also settles "only Jacob" without extra code: anyone can sign in, but only Jacob has permission to commit to the repo, so GitHub refuses anyone else's save. The editor should still show a clear message rather than a failed save if someone else signs in.
- The sign-in link sits somewhere quiet (the footer, for instance). Once signed in, the site shows **"Add recipe"** and an **"Edit"** button on each recipe page. Signed out, neither exists.

### To check before planning

- **Better Auth with a GitHub App.** That Better Auth's GitHub provider works with a GitHub App's sign-in, and gives the Worker the user's GitHub token for committing. GitHub App user tokens expire after about 8 hours and come with a refresh token, so the Worker must refresh them rather than ask Jacob to sign in again each day.
- **Cookies across sites.** The site is on `jdenn0514.github.io` and the Worker would be on `*.workers.dev`: two different sites. Safari blocks cookies between different sites, so a normal sign-in cookie won't reach the Worker from the site on an iPhone. The options are: (a) a custom domain with the site and the Worker on the same site (e.g. `example.com` and `api.example.com`), which GitHub Pages supports, at about $10 a year for the domain, which breaks "no money" slightly; (b) Better Auth's bearer-token mode, where the browser keeps the session token and sends it with each request, no cross-site cookie needed; or (c) moving the site to Cloudflare Pages on the same `workers.dev`/`pages.dev` setup if that counts as one site. Find out which works on iPhone Safari before planning. Claude's lean is (b), since it keeps "no money" and needs no hosting change.
- **Current free limits.** Workers, D1, R2 and Workers AI free allowances, checked on Cloudflare's pricing pages at planning time. At a few recipes a week they're far beyond what's needed.

## Importing

The import screen takes a URL, an image (photo or screenshot, from the camera or a file) or a PDF. Each is read into the same draft recipe, which then opens in the editor. Reading and saving are separate parts of the code, so saving can later go to a database without touching import.

### Recipe websites

- Browsers can't fetch another site's page from this one, so **the Worker fetches the page** and returns it. It only does this for a signed-in user, so it can't be used as an open proxy.
- Most recipe sites embed a structured copy of the recipe (schema.org `Recipe` data). When it's there, the title, ingredients, steps, yield, times, description and source are read from it exactly.
- When it isn't, the page's visible text goes through the same rules as OCR text (below).
- `source` is filled in from the site's name and the URL.

### Photos and screenshots

- **Tesseract.js** reads the text on the device: no server, no cost and no key. It's a download of several megabytes, so it loads **only on the import screen**, never on the rest of the site.
- Expected weak spots, which the review step is there for: fractions (½ read as "1/2" or "%"), °F, small print, two-column pages, sidebars and headnotes, and pages photographed at an angle or in poor light. Handwriting is mostly out of reach.

### PDF files

- A PDF that already contains its text (most saved from recipe websites, like the ones in `source-pdfs/`) has that text read directly, with no OCR guessing.
- A scanned PDF, with images and no text, goes through Tesseract page by page.

### From text to a recipe

The rules that turn plain text into a draft:

- Find the headings ("Ingredients", "Method", "Directions", "Instructions" and so on), with sub-headings becoming groups ("For the sauce").
- Lines in the ingredients part become ingredients, split into amount and item where the line starts with an amount.
- Numbered or separate paragraphs in the method part become steps.
- A step whose text contains a hands-off time ("bake 25 to 30 minutes", "chill for 1 hour") gets a `wait`, so it gets a cook mode timer.
- A step's `uses` is filled by matching ingredient names in the step's text. It must follow the same rules as hand-written `uses` (unambiguous when a name appears twice). When a match is unclear, it's left out and the Details section shows the step as having no ingredients linked, rather than guessing.
- The category is a best guess (cocktail words, baking words) and is always shown for you to check.
- Tags, cues and the cocktail fields are left for you.
- Anything the rules couldn't place (a headnote, a stray line) is kept in a "Couldn't place" list in the editor, so nothing read is lost. You move it into the recipe or discard it.

### Optional: "Tidy up with AI"

- A button in the editor sends the original (the photo, or the text read from a page or PDF) to a **vision model on Workers AI**, through the Worker, and gets back a draft in the recipe format, including groups, `uses`, waits and cues, and suggested tags from `recipes/vocabulary.json`.
- It runs on Jacob's Cloudflare account, so nobody else connects to any AI. Rough estimate from Cloudflare's listed prices: well under a cent per recipe, so dozens of imports a day fit in the free daily allowance. Measure it with a real recipe before relying on that.
- **It's never required.** If it fails, or the day's free allowance is used up, the editor says so and you keep the rule-based draft.
- **It must not slip in changes unseen.** Wherever the AI's draft differs from what OCR or the page actually said, especially amounts, the editor marks it for checking against the original. The AI draft is also run through the same checks as everything else.
- Recipe websites with structured data skip it by default, since that data is already exact.
- Cookbook photos sent to it go to Cloudflare to be read. That's accepted.
- Which model to use (Llama 3.2 11B Vision is the cheapest that reads images) is decided by trying a few of the real `source-pdfs` pages.

## The editor

- **The review screen is the recipe as it will appear**: the card from the recipe list, then the full recipe page, in the section's colours and the Field Guide style, light or dark.
- **Tap any part to edit it in place**: the title, an ingredient, a step, the yield. Ingredients and steps can be added, removed, reordered, split and merged. Groups can be added and renamed.
- **"Details"**, below the preview, holds what the page doesn't show: tags (picked from `recipes/vocabulary.json`, so a tag that doesn't exist can't be added), `source`, `added`, `kind`, `icon`, and each step's `uses` and their amounts.
- **The original sits next to the preview while importing**, so you can check the draft against it. On a phone, where there's no room alongside, it's one tap away.
- **New from scratch** opens the same screen with an empty recipe in the category you pick.
- **Edit existing** opens the recipe as it is on the site.
- The recipe's file name (its slug) is made from the title when it's first saved, using lowercase letters, numbers and dashes as the README says. Editing the title later **doesn't rename the file**, so links and saved progress keep working (Claude's call).
- The editor keeps an unsaved draft in the browser, so a reload or an accidental back doesn't lose work.

## Saving

- **Save publishes straight to the live site.** No pull request, no draft.
- Before anything is sent, the editor runs **the same checks as `scripts/build-index.mjs`**: required fields, allowed categories and tags, and `uses` that match exactly one ingredient. Errors show in place on the preview, and Save stays off until they're fixed. The checks must live in one shared module used by both the build script and the editor (the way `assets/recipe-icons.js` is already shared), so the two can never disagree.
- The editor rebuilds `recipes/index.json` the same way the build script does, then commits **the recipe file and the index in one commit** to `main` through GitHub's API, with the signed-in user's GitHub token. Whether the browser makes that call itself or the Worker makes it on the browser's behalf is the builder's call; the Worker keeping the token is safer.
- The commit message names the recipe ("Add Brown Butter Cookies", "Edit Carne Asada").
- The commit is made against the version the editor started from. If `main` has moved and the change touches the same recipe, the save stops with a message instead of overwriting. If only other recipes changed, the editor rebuilds the index from the new version and commits (the builder's call how far to take this).
- After saving, the editor shows that it's published and links to the recipe page. GitHub Pages updates in a minute or two.
- Commits from the editor don't run the pre-push hook. CI still runs on every push to `main`, so anything the editor's checks miss shows up there, and the fix is another edit.

## Deleting

- Edit existing has a **Delete** button. It asks you to **type the recipe's name to confirm**, then commits the removal of the recipe file, with the rebuilt index, in one commit.
- Its original, if any, is deleted from R2 too.
- Git history still has the recipe, so a mistaken delete can be recovered from the repo.

## Originals

- The image or PDF a recipe was imported from is kept in a **private R2 bucket**. Only the Worker can read it, and it only serves an original to the signed-in owner.
- Signed in, a recipe page with an original shows **"View original"**. Visitors never see it.
- The recipe JSON records that an original exists in some form the builder picks (a path, or the slug alone). It must reveal nothing a visitor could use to reach the file.
- When multi-user arrives, each person's originals stay theirs.

### Moving the existing PDFs

- The 38 PDFs committed in `source-pdfs/` move to the same private bucket, attached to their recipes where the match is clear. Claude writes and runs the upload script, after Jacob creates the bucket and puts the key in a local file the script reads (never committed). The script checks every file arrived before anything is removed from the repo.
- Then `source-pdfs/` is removed from the repo in its own commit.
- **They stay in the public git history** until that history is rewritten. Rewriting changes every commit and is hard to undo, so it's a separate decision Jacob hasn't made, and it isn't part of this project.

## Order of work

1. Answer the questions under "To check before planning."
2. Set up Cloudflare: the Worker, D1 with Better Auth's tables, the R2 bucket. Jacob creates the account, GitHub App and keys.
3. Move the existing PDFs to R2.
4. The editor, in the order the planning settles on.
5. The optional AI step last, after a trial on real pages.

## Accessibility

- Everything in the editor works by keyboard and screen reader, not only by tapping. Edit-in-place parts are real buttons or fields with labels, not just tappable text.
- The accessibility scan (`tests/e2e/accessibility.spec.mjs`) gets the new pages and states added to `PAGES`: the import screen, the editor with a recipe, the editor showing check errors, Details open, AI changes marked for checking, the delete confirmation, and a recipe page signed in (with Edit and "View original"), in light and dark mode. Colour problems the scan finds are shown to Jacob before any colour is changed.

## Constraints

- Plain HTML, CSS and JavaScript on the site, no frameworks and no build step (README). The Worker is its own small program in its own folder, deployed with Cloudflare's `wrangler` tool. It may use npm packages (Better Auth), since it's not part of the site.
- **The site needs new runtime dependencies**, which the README currently rules out: Tesseract.js (and its English language data) and a PDF reader such as pdf.js. They're committed into the repo as files (no CDN, no build step) and load only on the editor pages. The README's "the site itself still has no dependencies" line changes to say so.
- The pages' Content-Security-Policy loosens **only on the editor pages**, as far as needed: `connect-src` for the Worker (and `api.github.com` if the browser commits itself), `worker-src` and `'wasm-unsafe-eval'` for Tesseract. Signed-in features on recipe pages ("Edit", "View original") need `connect-src` for the Worker there too, and nothing more. Every other page keeps today's policy. Styles are still set through the DOM, not inline.
- The service worker is network-first and caches same-origin files, so the editor's large files get cached after first use. That's fine. Requests to the Worker and GitHub aren't cached, as today.
- Tests come first (`mattpocock-skills:tdd`, per `.claude/rules/testing.md`). Browser tests use the fixture recipes and the fixture's request blocking, so GitHub, the Worker and Workers AI are faked in tests, never called. Text-to-recipe rules get unit tests on sample text, including real OCR mistakes. The Worker gets its own tests. The shared checks keep their tests through `tests/helpers/build-index.mjs`. `npm test` passes before it's called done.
- Work happens on its own branch, so the live site is untouched until it's merged.

## Later

- **Step images** are the next project: a photo on a step, shown on the recipe page and in cook mode, uploaded from the editor. Unlike originals they're public, so they'd live in the repo next to the recipe, shrunk in the browser before committing so the repo doesn't swell, and they'd work offline like the rest of the site.
- **Multi-user**: the editor is its first feature. Only saving changes, from "commit to the repo" to "save to my account" in D1. Its open questions were parked on 2026-11-01 (shared library or per-account copies, login methods, scope, audience). With friends using the AI step, they'd share the free daily allowance.
- **Hosting**: a custom domain works with GitHub Pages as it is. Moving the site to Cloudflare Pages would keep saving through the repo and put everything in one account.

## Left to the builder

- Whether the editor is its own page or pages (e.g. `edit.html`) or a mode of `recipe.html`, as long as visitors never load its code or its looser CSP.
- Whether the browser or the Worker makes the GitHub commit.
- The PDF reader, and how Tesseract's files are vendored and loaded.
- The exact heading words and amount patterns the text rules recognise, and the order they're tried in.
- How an original is recorded in the recipe JSON (within the rule above).
- How a save handles `main` having moved for other recipes.
- How the AI step's differences are marked in the editor.
- Exact layout of edit-in-place and Details on phone and desktop, within the Field Guide style.

## Calls Claude made (for Jacob to check)

- Editing the title doesn't rename the recipe's file.
- Unclear `uses` matches are left out, not guessed.
- Anything the rules couldn't place is kept in a "Couldn't place" list.
- The category is guessed and always shown for checking.
- An unsaved draft is kept in the browser.
- The sign-in link is in a quiet spot, and Edit and "Add recipe" only show when signed in.
- The Worker only fetches pages, serves originals and runs AI for signed-in users.
- Deleting a recipe also deletes its original.
- The editor loosens the CSP on its own pages only.
- The AI step is skipped by default for websites with structured recipe data.
- Lean towards bearer-token sign-in over a custom domain, pending the iPhone check.
