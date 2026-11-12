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
- **No money, apart from the domain.** Everything runs on free tiers, and a free limit being reached stops a feature for the day rather than billing anyone. The one cost is the site's own domain, about $5 to $15 a year (Jacob's decision, 2026-11-05).
- **Nobody else connects to anything.** Visitors, and later friends and family, use the editor without accounts or keys of their own for any AI or service.
- Built so the multi-user version (friends and family adding their own recipes) can reuse it, with only the saving part swapped out.

## Non-goals

- **No accounts for anyone but Jacob yet.** Visitors see the site as today. Multi-user (accounts for others, recipes in a database, each person's own recipes) is its own project. This design only has to leave it easy to add.
- **Recipes stay as JSON files in the repo.** The database only holds sign-in data for now.
- **AI is optional, never required.** Import works fully without it, using structured website data, PDF text, OCR and rules. The optional AI step (below) only improves a draft.
- **No step images** (pictures showing how to do something). That's the next project, built on this editor (see "Later").
- **No server-built pages.** The site moves to Cloudflare (see "Moving to Cloudflare") but stays plain files: the same HTML, CSS, JavaScript and recipe JSON, served as they are. Only the editor's parts run code on the server.
- **No drafts.** Save publishes. A recipe you want to finish later is either saved as it is and edited again, or not saved.
- **The editor doesn't work offline.** It needs a connection to save, sign in and fetch web pages. The rest of the site keeps working offline as today.
- No screenshot tests, offline tests or print layout tests (matching `.claude/rules/testing.md`).

## Anti-goals (failures even if it technically works)

- **Editing a recipe silently drops a field the editor doesn't show.** A recipe with `nutrition`, `origin`, `abv`, lineup planning data or anything else the editor has no control for must come back out with those fields unchanged.
- **A delete or save that breaks another recipe.** Recipes link to each other for the lineup (an ingredient's `recipe`). Deleting a recipe that another links to, or a link to a recipe that doesn't exist, must be stopped before anything is committed.
- **A save overwrites a change it didn't know about.** If the recipe or the index changed on GitHub since the editor loaded it (an edit from the other device, a commit from the computer), saving must stop and say so, not overwrite it.
- **A save that leaves the site broken.** A recipe that would fail `build-index.mjs` must never be committed. The recipe file and `recipes/index.json` change together in one commit, or not at all.
- **A wrong amount slips in unnoticed.** OCR misreads and AI "corrections" both change amounts. Anything the importer guessed or the AI changed must be easy to check against the original before saving.
- **A delete by accident.** One tap must never delete a recipe.
- **An original becomes public.** Photos of cookbook pages are someone else's work. The photo, screenshot or PDF a recipe is imported from is never committed or stored anywhere (see "Originals").
- **A surprise bill.** No service is set up in a way that can charge money. The domain's yearly renewal is the one known charge.
- **Visitors see editing controls that don't work for them.** Signed out, the site has no Edit buttons, no "Add recipe" and nothing that saves. (Jacob's call on 2026-11-06, replacing the 2026-11-05 one that kept "Add recipe" for everyone: it shows only with the `signed-in` hint cookie. The intake still works at its address, `intake.html`, for anyone who has it.)

## The pieces

The whole site, and everything server-side, runs on **Cloudflare's free plan**, in one Cloudflare account, on the site's own domain:

- **A Worker** serves the site's files (Cloudflare's "static assets": free and unlimited) and, under `/api/`, the editor's server side: sign-in, fetching recipe web pages, saving to GitHub, and the optional AI step. Signed-out requests to `/api/` get nothing but the sign-in itself. Only `/api/` requests run the Worker's code and count against the free plan's 100,000 requests a day.
- **D1** (Cloudflare's SQLite database): holds only what sign-in needs (users, sessions, linked GitHub accounts). Recipe tables wait for the multi-user project.
- **Workers AI** (optional): the vision model for the "Tidy up with AI" step.

No file storage (R2 or KV) is needed, since originals aren't kept. That also avoids R2, which Cloudflare adds through a checkout and bills past its free amount. On the free plan, Workers, D1 and Workers AI return errors at their limits rather than charging. Current allowances and sources are in `docs/specs/recipe-editor-checks.md`.

Cloudflare was picked over Supabase because Supabase pauses free projects after about a week of no activity, which an editor used now and then would keep hitting. It was picked over Firebase because Firebase's file storage and functions need the pay-as-you-go plan, with a card and no hard spending cap. The cost of Cloudflare is that sign-in and access rules are built by us, not ready-made.

The site talks only to its own address. The Worker talks to GitHub's API, so the GitHub token never reaches the browser.

Jacob creates the Cloudflare account, the GitHub App, and any keys, buys the domain, and puts the keys where the Worker reads them. Claude doesn't handle keys.

## Moving to Cloudflare

Decided 2026-11-05 (Jacob). Serving the site and the Worker from one address makes sign-in an ordinary same-site cookie, with no cross-site handoff (see "Signing in"). The research behind it is option (c) in `docs/specs/recipe-editor-checks.md`.

- **One Worker serves both** the site's files and `/api/`. A Pages site with a separate Worker would still be two sites to Safari, so that's ruled out.
- **The site's own domain** (Jacob is buying one), pointed at the Worker. The `workers.dev` address can stay as a backup.
- **Deploys on every push to `main`**, by Cloudflare's Workers Builds connected to the repo, so no key leaves Cloudflare. A save from the editor is live a minute or two later, as with GitHub Pages today.
- **Only the site's files are published.** An `.assetsignore` keeps out tests, `node_modules`, the Worker's own source and anything else not meant to be served.
- **The old address** (`jdenn0514.github.io/shaken-stirred-sauteed/`) gets a small "This site has moved" page on every path, sending visitors to the same page on the new domain. GitHub Pages can't send real redirects, so it's a page, and GitHub Pages serves only that page from then on.
- **Saved things don't move with it.** Progress, timers, the lineup and the theme are kept by the browser per address, so they start empty on the new domain, and the home-screen app is added again. Accepted.
- The README's "Live site" link, and anything else naming the old address, changes to the new domain.
- If Cloudflare ever stops suiting, the same files still work on GitHub Pages; only the editor would stop.

## Signing in

- **Sign in with GitHub**, run by **Better Auth inside the Worker**, with its tables in D1. When friends and family come, Better Auth adds Google or email sign-in for them, and Jacob's account carries over.
- The GitHub side is a **GitHub App installed only on this repo**, not an older OAuth app, which could only ask for access to all of Jacob's public repos. That also settles "only Jacob" without extra code: anyone can sign in, but only Jacob has permission to commit to the repo, so GitHub refuses anyone else's save. The editor should still show a clear message rather than a failed save if someone else signs in.
- The sign-in link sits somewhere quiet (the footer, for instance). Once signed in, the site shows an **"Edit"** button on each recipe page; signed out, it doesn't. **"Add recipe"** (site bar and welcome page, leading to the intake, `intake.html`) also shows only when signed in.

### Better Auth and the GitHub token

Checked in `docs/specs/recipe-editor-checks.md` (question 1):

- Better Auth's GitHub provider works with a GitHub App's sign-in. It stores the access token, refresh token and expiry in D1, and its `getAccessToken` renews the 8-hour token itself.
- **Token encryption is on** (`encryptOAuthTokens`), since the token can commit to the repo.
- `disableDefaultScope: true`: GitHub Apps ignore scopes, so none are asked for.
- The GitHub App has **Contents: read & write** and **Email addresses: read-only** (sign-in fails without the email permission).
- The Worker runs with Cloudflare's `nodejs_compat` flag and uses Better Auth's built-in D1 support.
- A refresh token works once. If GitHub refuses a token or a refresh, the editor says "sign in again" rather than failing the save silently.

### Sign-in: an ordinary cookie

The site and the Worker share one address, so Better Auth's normal session cookie works, Safari included. No bearer token, one-time code or cross-site headers are needed (this replaces the cross-site plan of 2026-11-03).

1. "Sign in" is a link to `/api/auth/…`, which sends Jacob to GitHub and back, then to the page he started from.
2. The session is an **HttpOnly, Secure, SameSite=Lax cookie**: page scripts can't read it, which is safer than a token kept in the browser.
3. To show "Edit" and "Add recipe" without asking the server on every page, the Worker also sets a small readable `signed-in` hint cookie. It holds no secret; the editor checks the real session with `/api/me` before doing anything, and a stale hint just leads to "Sign in again".
4. Signing out ends the session in D1 and clears both cookies.

Still to try once the accounts exist: signing in on an iPhone in Safari (normal and Private tab), then saving an edit and reloading, and that Better Auth stays within the free plan's 10 ms of CPU per request.

## Importing

The import screen takes a URL, an image (photo or screenshot, from the camera or a file) or a PDF. Each is read into the same draft recipe, which then opens in the editor. Reading and saving are separate parts of the code, so saving can later go to a database without touching import.

### Recipe websites

- Browsers can't fetch another site's page from this one, so **the Worker fetches the page** and returns it. It only does this for a signed-in user, so it can't be used as an open proxy.
- Most recipe sites embed a structured copy of the recipe (schema.org `Recipe` data). When it's there, the title, ingredients, steps, yield, times, description and source are read from it exactly.
- When it isn't, the page's visible text goes through the same rules as OCR text (below).
- `source` is filled in from the site's name and the URL.

### Photos and screenshots

(2026-11-06, Jacob's decision, after trying the engines on his cookbook photos: photos and screenshots stay Live Text copy and paste, and a scanned PDF is pointed there too. The Tesseract plan below isn't being built. See `tools/intake/README.md`, "Reading photos", and the plan's slice 7.)

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
- **Lineup data is left for you too** (see "Lineup data"): the steps' hands-on times, equipment, prep marks and `holds`, the recipe's `serve` and `sits`, and links to other recipes. The lineup spec says nothing is guessed from a step's wording, so the rules don't try. The checker's warnings ("step 3 mentions the oven but has no equipment field") show in the editor as a to-do list, and the editor makes each one a quick choice.
- Anything the rules couldn't place (a headnote, a stray line) is kept in a "Couldn't place" list in the editor, so nothing read is lost. You move it into the recipe or discard it.

### Optional: "Tidy up with AI"

- A button in the editor sends the original (the photo, or the text read from a page or PDF) to a **vision model on Workers AI**, through the Worker, and gets back a draft in the recipe format, including groups, `uses`, waits and cues, and suggested tags from `recipes/vocabulary.json`. It may also suggest lineup data and added prep steps; like amounts, every suggestion is marked for checking.
- It runs on Jacob's Cloudflare account, so nobody else connects to any AI. Rough estimate from Cloudflare's listed prices: well under a cent per recipe, so dozens of imports a day fit in the free daily allowance. Measure it with a real recipe before relying on that.
- **It's never required.** If it fails, or the day's free allowance is used up, the editor says so and you keep the rule-based draft.
- **It must not slip in changes unseen.** Wherever the AI's draft differs from what OCR or the page actually said, especially amounts, the editor marks it for checking against the original. The AI draft is also run through the same checks as everything else.
- Recipe websites with structured data skip it by default, since that data is already exact.
- Cookbook photos sent to it go to Cloudflare to be read. That's accepted.
- Which model to use (Llama 3.2 11B Vision is the cheapest that reads images) is decided by trying a few of the real `source-pdfs` pages.

## The editor

- **The review screen is the recipe as it will appear**: the card from the recipe list, then the full recipe page, in the section's colours and the Field Guide style, light or dark.
- **Tap any part to edit it in place**: the title, an ingredient, a step, the facts box (the yield, the times as printed, and the minutes the time filter and the lineup use). Ingredients and steps can be added, removed, reordered, split and merged. Groups can be added and renamed.
- **"Details"**, below the preview, holds what the page doesn't show: tags (picked from `recipes/vocabulary.json`, so a tag that doesn't exist can't be added), `source`, `added`, `kind` and `icon`. Each step's `uses` and their amounts are on the step itself, with its lineup settings (below).
- **The original sits next to the preview while importing**, so you can check the draft against it. On a phone, where there's no room alongside, it's one tap away.
- **New from scratch** opens the same screen with an empty recipe in the category you pick.
- **Edit existing** opens the recipe as it is on the site.
- The recipe's file name (its slug) is made from the title when it's first saved, using lowercase letters, numbers and dashes as the README says. Editing the title later **doesn't rename the file**, so links and saved progress keep working (Claude's call).
- The editor keeps an unsaved draft in the browser, so a reload or an accidental back doesn't lose work.

## Lineup data

The lineup (meal planner, `docs/specs/meal-planner-design.md`, being built on the `lineup-recipe-data` branch) adds optional fields that the editor has to handle. Their meaning and checks are in that spec and the README's "Planning a lineup"; this section is only about editing them.

- **On each step, folded under "For the lineup" when the step is open:** `uses` and their amounts, `hands` (a time), `watch` (only offered when the step has a `wait`), the oven (a setting the step needs, or a `preheat`), burner, grill and microwave, `prep` (ahead or "just before"), and `holds` (one per recipe, so ticking it on one step clears it from another). The fold says what's set, and opens by itself when the step has a lineup problem or to-do. A step that mentions equipment but doesn't use it can say so (`false`), which clears the checker's warning. On a new recipe, the intake's own guesses ("Needs you there", "Done while an earlier step waits") stand in for these while they're still to confirm, so nothing shows twice. (Moved from Details in the editor redesign, build step 16.)
- **In Details, for the recipe:** `serve` (hot, soon or keeps) and `sits`, with the fallback shown when they're blank ("Cooking dishes are hot, 10 min unless you say").
- **On each ingredient:** "Made by another recipe", a picker of the site's recipes (never typed, so a link can't point nowhere), then `optional` and `alreadyMade` (only offered for a required, linked ingredient).
- **Added prep steps** (`prep` and `prepOnly`): the editor has "Add a prep step", for prep hidden in ingredient lines ("Mince the garlic"). They show in the preview only in prep-first order, so the preview has a switch between "as written" and "prep first", like the lineup's.
- **The checker's warnings** (equipment mentioned but not set, "optional" in the text but not marked, a linked ingredient no step uses) appear as a short to-do list with the step they're about. They don't block Save, as they don't block the build.
- These fields don't need to be filled in before saving. Every one has a fallback, so a recipe saved without them still gets a rough plan.

## Saving

- **Save publishes straight to the live site.** No pull request, no draft.
- Before anything is sent, the editor runs **the same checks as `scripts/build-index.mjs`**: required fields, allowed categories and tags, `uses` that match exactly one ingredient, the lineup's planning fields, and links to recipes that exist and don't loop. Errors show in place on the preview, and Save stays off until they're fixed. The checks must live in one shared module used by both the build script and the editor (the way `assets/recipe-icons.js` is already shared), so the two can never disagree.
- The editor rebuilds `recipes/index.json` the same way the build script does, then commits **the recipe file and the index in one commit** to `main` through GitHub's API, with the signed-in user's GitHub token. Whether the browser makes that call itself or the Worker makes it on the browser's behalf is the builder's call; the Worker keeping the token is safer.
- The commit message names the recipe ("Add Brown Butter Cookies", "Edit Carne Asada").
- The commit is made against the version the editor started from. If `main` has moved and the change touches the same recipe, the save stops with a message instead of overwriting. If only other recipes changed, the editor rebuilds the index from the new version and commits (the builder's call how far to take this).
- After saving, the editor shows that it's published and links to the recipe page. Cloudflare deploys the commit in a minute or two.
- Commits from the editor don't run the pre-push hook. CI still runs on every push to `main`, so anything the editor's checks miss shows up there, and the fix is another edit.

## Deleting

- Edit existing has a **Delete** button. It asks you to **type the recipe's name to confirm**, then commits the removal of the recipe file, with the rebuilt index, in one commit.
- **A recipe another recipe links to can't be deleted.** The Delete button says which recipes use it ("Hasselback Potatoes uses this for its garlic paste") and stays off until those links are removed.
- Git history still has the recipe, so a mistaken delete can be recovered from the repo.

## Originals

- **Originals aren't kept** (Jacob's call, 2026-11-03). The photo, screenshot or PDF a recipe is imported from lives only in the browser while importing: shown beside the preview, read by OCR, and sent to the AI step if that's used. It's gone once the recipe is saved or the import abandoned, and nothing about it goes in the recipe JSON.
- The unsaved draft kept in the browser holds the text read, not the original, so after a reload the original has to be chosen again to compare against it.
- `source-pdfs/` stays in the repo as it is today. Whether to remove it (and from git history) is a separate decision, not part of this project.

## Order of work

The detailed order is in [recipe-editor-plan.md](recipe-editor-plan.md). Sign-in doesn't depend on the lineup, so it can go first. The editor's code waits until the lineup's recipe data and checker are merged into `main`, since both change `scripts/build-index.mjs`, every recipe file and the recipe pages.

1. Set up Cloudflare: the account, the domain, D1, the GitHub App and keys (Jacob), and automatic deploys from the repo.
2. Move the site to Cloudflare (see "Moving to Cloudflare"), with the old address pointing to the new one.
3. Sign-in end to end, tried on an iPhone (see "Signing in").
4. The editor, in the order the planning settles on.
5. The optional AI step last, after a trial on real pages.

## Accessibility

- Everything in the editor works by keyboard and screen reader, not only by tapping. Edit-in-place parts are real buttons or fields with labels, not just tappable text.
- The accessibility scan (`tests/e2e/accessibility.spec.mjs`) gets the new pages and states added to `PAGES`: the import screen, the editor with a recipe, the editor showing check errors, Details open (with the lineup fields), the to-do list of warnings, the prep-first preview, AI changes marked for checking, the delete confirmation, and a recipe page signed in (with Edit), in light and dark mode. Colour problems the scan finds are shown to Jacob before any colour is changed.

## Constraints

- Plain HTML, CSS and JavaScript on the site, no frameworks and no build step (README). The Worker is its own small program in its own folder, built and deployed by Cloudflare from the repo. It may use npm packages (Better Auth), since it's not part of the site.
- **The site needs new runtime dependencies**, which the README currently rules out: Tesseract.js (and its English language data) and a PDF reader such as pdf.js. They're committed into the repo as files (no CDN, no build step) and load only on the editor pages. The README's "the site itself still has no dependencies" line changes to say so.
- The Content-Security-Policy needs nothing new to reach the Worker, since `connect-src 'self'` already covers `/api/`. It loosens **only on the editor pages**, and only for what reading files needs (`worker-src` and `'wasm-unsafe-eval'` for Tesseract, if it's used). Every other page keeps today's policy. Styles are still set through the DOM, not inline. Cloudflare could send the policy as a real header later; not part of this project.
- The service worker is network-first and caches same-origin files, so the editor's large files get cached after first use. That's fine. It must **never cache `/api/`** (sign-in, saving), which is now same-origin; that rule is added with the move.
- Tests come first (`mattpocock-skills:tdd`, per `.claude/rules/testing.md`). Browser tests use the fixture recipes and the fixture's request blocking, so GitHub, the Worker and Workers AI are faked in tests, never called. Text-to-recipe rules get unit tests on sample text, including real OCR mistakes. The Worker gets its own tests. The shared checks keep their tests through `tests/helpers/build-index.mjs`. `npm test` passes before it's called done.
- Work happens on its own branch, so the live site is untouched until it's merged.

## Later

- **Step images** are the next project: a photo on a step, shown on the recipe page and in cook mode, uploaded from the editor. They're public, so they'd live in the repo next to the recipe, shrunk in the browser before committing so the repo doesn't swell, and they'd work offline like the rest of the site.
- **Multi-user**: the editor is its first feature. Only saving changes, from "commit to the repo" to "save to my account" in D1. Its open questions were parked on 2026-11-01 (shared library or per-account copies, login methods, scope, audience). With friends using the AI step, they'd share the free daily allowance.

## Left to the builder

- Whether the editor is its own page or pages (e.g. `edit.html`) or a mode of `recipe.html`, as long as visitors never load its code or its looser CSP.
- The PDF reader, and how Tesseract's files are vendored and loaded.
- The exact heading words and amount patterns the text rules recognise, and the order they're tried in.
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
- The Worker only fetches pages and runs AI for signed-in users.
- An unsaved draft keeps the text read, not the original.
- The editor loosens the CSP on its own pages only.
- The AI step is skipped by default for websites with structured recipe data.
- `source-pdfs/` is left alone now that originals aren't kept.
- The importer leaves lineup data blank rather than guessing it, and the checker's warnings become the editor's to-do list.
- A recipe another recipe links to can't be deleted until the links are removed.
- Linked recipes are picked from a list, never typed.
- One Worker serves the site and `/api/`, deployed by Cloudflare on every push to `main`.
- A readable "signed-in" hint cookie shows Edit and "Add recipe" without a server request on every page.
- The old GitHub Pages address becomes a "moved" page rather than a second copy of the site.
