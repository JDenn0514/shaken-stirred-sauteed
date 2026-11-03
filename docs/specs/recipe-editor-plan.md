# Recipe editor: plan

2026-11-03 · how to build [recipe-editor-design.md](recipe-editor-design.md), using the answers in [recipe-editor-checks.md](recipe-editor-checks.md)

The work is split into **slices**. Each slice is one branch and one pull request. Each leaves the live site working and `npm test` passing, and each starts with failing tests (`mattpocock-skills:tdd`, per `.claude/rules/testing.md`). Slices 1 to 4 need no accounts, so they can start now while Jacob sets up Cloudflare and the GitHub App (slice 0). Slice 5 is the iPhone sign-in trial. It's the riskiest part, so the save, import and delete slices wait for it.

| Slice | What | Needs accounts? |
| --- | --- | --- |
| 0 | Jacob's setup: Cloudflare, GitHub App, keys | Jacob does it |
| 1 | One shared recipe checker for the build script, the editor and the Worker | no |
| 2 | The recipe page's drawing code shared, so the editor can preview with it | no |
| 3 | The editor page: preview, edit in place, Details, checks, local draft (no saving yet) | no |
| 4 | Text to recipe: the rules, website data and PDF text, as tested modules | no |
| 5 | The Worker and sign-in end to end, **tried on an iPhone** | yes |
| 6 | Saving and deleting through the Worker | yes |
| 7 | Import: website, PDF, photo and screenshot | yes (website only) |
| 8 | Optional "Tidy up with AI", after a trial | yes |

## Calls this plan makes on the builder's questions

The design left these to the builder. They're settled here so the slices fit together; say if any should change.

- **The editor is its own page, `edit.html`.** Visitors never load its code or its looser CSP. `edit.html?r=<slug>` edits, `edit.html?new=<category>` starts from scratch, `edit.html?import` imports.
- **The Worker makes the GitHub commit.** The GitHub token never leaves the Worker. The browser only ever holds Better Auth's session token.
- **Only `edit.html` talks to the Worker.** Whether you're signed in is known from the token kept in the browser, so recipe and index pages show "Edit" and "Add recipe" without any network call or CSP change. The sign-in link is a plain link to the Worker. After GitHub, the Worker sends you to `edit.html#ott=…`, which swaps the code for a token and returns you to the page you started from.
- **The index is patched, not rebuilt, on save.** A full rebuild in the Worker would fetch every recipe file: about 40 requests to GitHub, close to the free plan's 50 per request. Instead the shared checker makes the one recipe's index entry, and the Worker replaces, adds or removes that entry in `main`'s `index.json` and re-sorts. A unit test proves that patching gives the same index as a full rebuild. CI's `check:recipes` re-checks it on every push to `main`.
- **Conflicts.** The editor loads a recipe from `main` through the Worker, along with the file's Git version (its blob SHA). At save, the Worker compares that with the file on `main` now. If they differ, the save stops with "This recipe changed since you opened it". Changes to other recipes don't block a save, since only this recipe's index entry is replaced. If `main` moves between reading and committing, the Worker retries once from the new `main`, then gives up with the same message.
- **File format.** Saved recipes are written with a small formatter that keeps short lists on one line, as the hand-written files do (`"course": ["protein"]`). The first edit of an existing recipe may still re-wrap a few lines. That's one-time noise in that commit, nothing more.
- **Worker tests** use Vitest with Cloudflare's Workers test pool, which runs the real Workers runtime and a local D1 database, with GitHub faked. That adds Vitest to the Worker's own `package.json`, not the site's. `npm test` at the root runs them.
- **Vendored files** (Tesseract.js, its English data, pdf.js) go in `assets/vendor/` with their licences, loaded only by `edit.html`.

## Slice 0: Jacob's setup

Jacob does this; Claude never sees the keys. A `mattpocock-skills:wizard` script can walk through it step by step if wanted.

1. A Cloudflare account on the free plan, with no card added. Don't add R2.
2. A D1 database (the name goes in `worker/wrangler.jsonc`, which isn't secret).
3. A GitHub App, installed **only** on `jdenn0514/shaken-stirred-sauteed`:
   - Permissions: **Contents: read & write**, **Email addresses: read-only**. Nothing else.
   - "Expire user authorization tokens" on (the default).
   - Callback URL: `https://<worker>.workers.dev/api/auth/callback/github`.
4. Worker secrets set with `wrangler secret put`, typed by Jacob: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BETTER_AUTH_SECRET` (a long random string).

## Slice 1: one shared recipe checker

Today every check lives inside `scripts/build-index.mjs`. Move them into **`assets/recipe-checks.js`**, written the same way as `assets/recipe-icons.js` so it works in Node, the browser and the Worker:

- `checkRecipe(slug, recipe, vocab)` → `{ errors, warnings }`, with the same messages as today, minus the `recipes/<file>:` prefix, which the build script adds.
- `indexEntry(slug, recipe, vocab)` → that recipe's entry in `index.json`.
- `patchIndex(index, slug, entryOrNull)` → the index with that entry replaced, added or removed, sorted by title.

`build-index.mjs` keeps reading files, adding the file name to messages, the "vocabulary values no recipe uses" warning, and writing the file.

Tests first:
- The existing `tests/unit/build-index.test.mjs` must pass unchanged. It drives the real script, so it guards the move.
- New `tests/unit/recipe-checks.test.mjs`: `checkRecipe` on a good and a bad recipe; `patchIndex` adding, replacing and removing, each compared with a full rebuild of the same recipes through `tests/helpers/build-index.mjs`.
- `npm run check:recipes` still shows no change to `recipes/index.json`.

## Slice 2: the recipe page's drawing code, shared

The editor's preview must be the real recipe page and the real card. Today the page's HTML is built inside `assets/recipe.js` (`render`) and the card inside `assets/home.js` (`card`), each tied to its page.

- Move the HTML-building parts into **`assets/recipe-view.js`**: `recipePageHTML(recipe, vocab)` and `cardHTML(entry)`. Page wiring (progress, cook mode, the URL) stays in `recipe.js` and `home.js`.
- No behaviour changes. The existing browser tests (`recipe-page`, `index-page`, `cook-mode`, `accessibility`) are the safety net. Add the new file to the pages' script tags. The link checker covers it.

## Slice 3: the editor page, without saving

`edit.html`, `assets/edit.js`, `assets/edit.css` (or a section of `style.css`). For now it loads a recipe from the site itself, as `recipe.html` does; slice 6 switches it to `main` through the Worker.

What it does:
- Shows the card, then the full recipe page, both from `recipe-view.js`, in the section's colours, light or dark.
- **Edit in place**: each editable part (title, description, yield, each ingredient, each step with its wait and cue, group names) is a real button that opens a labelled field in place. Ingredients and steps can be added, removed, moved up and down, split and merged. Groups can be added and renamed.
- **Details** below: tags as choices from `recipes/vocabulary.json` (only those for the recipe's section), `source`, `added`, `kind`, `icon`, and each step's `uses` and amounts.
- **Checks** from `recipe-checks.js` run as you edit, with errors shown next to the part they're about. Save stays off until there are none (in this slice Save does nothing else).
- **Fields the editor has no control for are kept as they are**, in their original order.
- **Unsaved draft** kept in the browser per recipe (`sss:draft:<slug>`), offered back on return, and cleared on save.
- **Signed out**, `edit.html` shows only "Sign in to edit", and the site has no links to it. For this slice, tests fake being signed in by putting a token in the browser.

Browser tests first, in a new `tests/e2e/editor.spec.mjs`, on the fixture recipes:
- The preview shows the recipe's title, ingredients and steps as the recipe page does.
- Editing an ingredient changes the preview; adding, removing, moving, splitting and merging steps work by keyboard.
- **Field keeping**: a fixture recipe with `nutrition`, `origin`, `abv` and an unknown field comes out of an edit with those unchanged (the anti-goal).
- A `uses` naming a missing ingredient shows the checker's message and turns Save off.
- Tags offered are only the section's; there's no way to type a new one.
- A reload brings back the unsaved draft.
- Signed out: no "Edit" or "Add recipe" anywhere; `edit.html` asks you to sign in.
- `accessibility.spec.mjs` `PAGES`: the editor with a recipe, with check errors, and with Details open, in light and dark.

## Slice 4: text to recipe

Pure modules with unit tests, no page yet. They're written the same way as `recipe-icons.js`, so the editor and Node's test runner both load them.

- **`assets/import-text.js`**, `draftFromText(text)` → `{ recipe, unplaced }`, following the rules in the design's "From text to a recipe": headings, groups, amount and item split, steps, `wait` from hands-off times, `uses` only when the match is clear, a category guess, and everything else in `unplaced`.
- **`assets/import-schema.js`**, `draftFromPage(html, url)` → a draft from the page's schema.org `Recipe` data (JSON-LD, including `@graph` and lists of recipes), or `null` so the caller falls back to the page's text. The source is filled in from the site name and URL.

Tests first, in `tests/unit/import-text.test.mjs` and `tests/unit/import-schema.test.mjs`:
- Sample texts in `tests/samples/`: a few real `source-pdfs` pages turned into text, plus OCR text with its usual mistakes (½ as "%", "1/2" run into the next word, °F as "OF", broken lines, a two-column mix-up).
- Every draft passes `checkRecipe` once a title and category are set, and nothing in the input is lost: whatever isn't in the recipe is in `unplaced`.
- Saved copies of two or three recipe pages' HTML (with JSON-LD in different shapes), and one with none.

## Slice 5: the Worker and sign-in, tried on an iPhone

`worker/` with its own `package.json`, `wrangler.jsonc`, `src/` and `test/`. It uses Better Auth with the `bearer` and `one-time-token` plugins and its D1 support, plus `nodejs_compat`. Settings come from the checks file: `encryptOAuthTokens`, `disableDefaultScope`, `trustedOrigins: ["https://jdenn0514.github.io"]`, and CORS for that origin only (allowing `Authorization`, exposing `set-auth-token`).

Routes in this slice:
- `GET /signin?return=<page>`: starts GitHub sign-in as a full page, with the callback going to `edit.html`.
- The callback adds `#ott=<code>` to the redirect back to the site. If the code turns out not to be there, as the checks file warns may happen, a Worker route makes the code itself.
- `POST /api/auth/one-time-token/verify`, from Better Auth: returns the session token.
- `GET /me`: who's signed in, and whether they can commit to the repo, so the editor can say "This account can't edit this site" for anyone but Jacob.
- `POST /signout`.

On the site:
- A quiet "Sign in" link in the footer of every page. Once signed in, it reads "Sign out", and "Add recipe" and "Edit" appear.
- `edit.html` handles `#ott=`, removes it from the address bar, keeps the token, and goes back to the page sign-in started from.

Tests first:
- **Worker** (Vitest): signed-out requests get 401 on everything but sign-in; `/signin` refuses a `return` not on the site; the callback's redirect carries a code; CORS headers only for the site's origin.
- **Browser** (fixture extended with a fake Worker at the real Worker address): signing in lands back on the starting page with "Add recipe" showing; a bad or used code shows "Sign-in didn't work, try again"; signing out removes "Edit" and "Add recipe".

**Then the trial**, with Jacob, before slice 6 starts:
- Sign in on his iPhone in Safari, in a normal tab and in a Private tab; reload; come back the next day (after the 8-hour GitHub token has expired).
- Read the Worker's CPU time per request in the Cloudflare dashboard, against the free plan's 10 ms.
- If either fails, stop and decide (the fallback is one Cloudflare address for the site and Worker).

## Slice 6: saving and deleting

Worker routes, all signed in only:
- `GET /recipe/:slug`: the recipe from `main`, with its blob SHA.
- `POST /save`: `{ slug, recipe, baseSha }`, or `{ slug, recipe }` for a new recipe. The Worker:
  1. Gets a fresh GitHub token (Better Auth refreshes it); if GitHub refuses, replies "sign in again".
  2. Reads `main`, and checks the file's current SHA against `baseSha` (or that a new slug is free).
  3. Runs `checkRecipe` against `main`'s vocabulary.
  4. Patches `index.json`.
  5. Commits both files in one commit with the Git Data API: "Add …", "Edit …" or "Delete …".
- `POST /delete`: `{ slug, baseSha }`, the same steps with the file removed and its index entry dropped.

Editor:
- Loads from `GET /recipe/:slug`.
- Save is enabled only with no errors. The slug is made from the title on first save and never changes after.
- After saving: "Published. The site updates in a minute or two", with a link to the recipe. Clears the draft.
- Delete: a dialog asking you to type the recipe's title; the button stays off until it matches.

Tests first:
- **Worker**, with GitHub faked:
  - A save makes exactly one commit holding the recipe and `index.json`.
  - A changed `baseSha` gets 409 and nothing is committed.
  - A change elsewhere on `main` doesn't block the save, and the index keeps the other change.
  - A recipe failing `checkRecipe` is refused, with nothing committed.
  - A new recipe whose slug exists is refused.
  - Delete removes the file and the index entry together.
  - A refresh failure gives "sign in again".
- **Browser**, with the fake Worker:
  - The published message, and its link.
  - A 409 shows "changed since you opened it" and keeps the draft.
  - The delete dialog: wrong name keeps Delete off; the right name deletes.
  - Someone without access sees "can't edit this site" instead of a failed save.
- `PAGES`: the delete confirmation; a recipe page signed in (with "Edit").

## Slice 7: import

- **The import screen** (`edit.html?import`): a URL field, "Take or choose a photo", and "Choose a PDF".
- **Website**: the Worker's `POST /fetch` gets the page, for signed-in users only, `https` only, refusing private addresses and anything over a few MB. Then `draftFromPage`, falling back to the page's text and `draftFromText`.
- **PDF**: pdf.js reads the text. If a page has no text, it's drawn to an image and read by Tesseract.
- **Photo or screenshot**: Tesseract.js, loaded only on this screen, in a Web Worker, with English data from `assets/vendor/`.
- **The original** sits next to the preview (one tap away on a phone). It's held only in memory and never sent anywhere except the AI step in slice 8. The draft keeps the text, not the original. The "Couldn't place" list sits beside the preview, with "Add to notes" and "Discard" for each line.
- **The editor page's CSP**: `connect-src` adds the Worker; `worker-src 'self' blob:` only if Tesseract needs it; `script-src` adds `'wasm-unsafe-eval'`. Every other page's CSP stays exactly as it is.
- **README**: the "no dependencies" line now names the vendored editor files.

Tests first:
- **Browser**: import from a URL with the fake Worker returning a saved page, and a recipe preview appears with its source set. A small sample PDF in `tests/samples/` gives the expected ingredients. A small clear test image gives a draft. That last one is slow, so it runs once, in Chrome.
- **Worker**: `/fetch` refuses signed-out requests, `http:`, private addresses, and oversized pages.
- `PAGES`: the import screen, and the editor with an original and a "Couldn't place" list.

## Slice 8: "Tidy up with AI" (optional)

First a trial: run four or five `source-pdfs` pages through Llama 3.2 11B Vision and one or two other vision models on Workers AI. Note the Neurons each used and how good the drafts are. Jacob decides whether to build it.

If it's built:
- **Worker**: `POST /tidy` sends the original (or the text) with a prompt for the recipe format and the vocabulary's tags. The reply is run through `checkRecipe`. A reply over the day's allowance, or any failure, gets "AI isn't available right now".
- **Editor**:
  - Every amount, time or temperature that differs from the rule-based draft is marked "Check against the original" until looked at.
  - It's skipped by default when a website had structured data.

Tests first:
- **Worker**: a fake AI reply that fails the checker is refused; a failure gives the message.
- **Browser**: changed amounts are marked; dismissing a mark clears it; a failed AI step leaves the rule-based draft untouched.
- `PAGES`: AI changes marked.

## After the last slice

- The README's "Adding a recipe" leads with the editor, keeping the JSON route for the computer.
- Any parked follow-ups go in the spec's "Later" list: step images and multi-user.
