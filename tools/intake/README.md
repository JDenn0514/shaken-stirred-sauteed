# Recipe intake: from a photo or a web page to a draft recipe

The pieces the recipe intake form builds on. Nothing here uses a language
model, so it's free to run. The form itself (where text is pasted, how the
things to check are shown) is the intake's own work.

## How a recipe comes in

1. **A web page:** give its address. The Worker gets the page
   (`POST /api/fetch`, signed in only), then
   `draftFromPage(html, { url, category, titles })` (`page.mjs`) reads it.
   Recipe sites describe the recipe for search engines (schema.org `Recipe`
   data, read by `draftFromSchemaOrg`), so the text is exact. A page without
   it is read from its visible text (the article, without menus and footers)
   through `draftFromText`, with a check saying so. `source` is the author and
   the site's name (`og:site_name`, the data's publisher, or the address),
   and the page's address. Some sites (allrecipes) refuse automated requests;
   the intake says so, and to copy the page text instead.
2. **A PDF:** pdf.js (`assets/vendor/pdfjs/`, loaded only when a PDF is
   chosen) reads its text, a page at a time, into `draftFromText`. A scanned
   PDF has no text: the intake says so, and suggests screenshots and Live
   Text rather than OCR (see "Reading photos" below).
3. **A cookbook page or a screenshot:** copy the text with Apple Live Text
   (Photos: press and hold on the text, Select All, Copy) and paste it,
   one page at a time. `draftFromText([page1, page2], { category, titles })`.
4. Every way, the draft gets the lineup planning data from
   `tools/restructure/restructure.mjs`, and a list of things to check.

`category` is `"baking"`, `"cooking"` or `"cocktails"`; without it the draft
asks for one. `titles` maps the site's recipe slugs to titles (from
`recipes/index.json`) so ingredients can link to recipes that make them.

Both return `{ recipe, flags }`. `recipe` is in the site's format (README,
"Recipe fields") plus two fields the form shows but the site doesn't use yet:
`equipment` (from "Special Equipment") and `headnote` (the story before the
method, to trim into `description` or a note). Steps the restructuring split
or joined carry `review: "split"` or `review: "joined"` so the form can show
them; `forSaving(recipe)` takes those marks off before the recipe is saved.
Each flag is `{ kind, text, why }`, plus `parts` for `split` and `joined`:

| kind | What to check |
|---|---|
| `amount` | Every ingredient amount, against the original. Fractions are where reading goes wrong |
| `unreadable` | An amount OCR couldn't read ("% cup sugar"): fix it from the photo |
| `time` | A step that bakes, rises, chills or cools with no time: add one for the timer and the planner |
| `category` | Choose Baking, Cooking or Cocktails |
| `split` | A written step split in two or more, so each has at most one wait and one place on the stove or in the oven. `text` is the original, `parts` the new steps; join them back if it reads better as one |
| `joined` | An alternative ("No blender? Shake…") joined to the step before it. `parts` are the original steps |
| `planning` | A wait the restructuring read from the text |
| `storage` | Something saved for another recipe or day ("saving the 4 yolks for lemon curd") with no word on how to keep it, or a recipe that says it keeps (a "Do ahead" note) whose steps never say how to store it. Add a step, so a make-ahead lineup can end there |
| `total-time` | The stated total is well short of what the steps add up to, with each range at its short end (a source's "41 min" lemon curd that leaves out an hour in the fridge). Totals that say "plus …" aren't checked |
| `cover` | It says to uncover the dish ("Uncover away from your face") but no step says to cover it |
| `no-amount` | A bought ingredient with no amount ("Fresh berries", "Whipped cream"): add one for shopping. Salt, pepper, water, "juice of ½ lemon" and things "for the pan" aren't flagged |
| `title`, `ingredients`, `steps` | Nothing found |

## The review screen (`intake.html`)

Choose the section, then give a recipe website's address ("Get the
recipe"), choose a PDF, or paste the text (one page at a time, with "Add
another page") and "Read the recipe". The website and the PDF are
`assets/intake-import.mjs` (tests: `tests/e2e/intake-import.spec.mjs`, and
`tests/unit/intake-page.test.mjs` for reading a page). The screen follows
`docs/specs/intake-lineup-needs.md`; its logic is `review.mjs` (tests:
`tests/unit/intake-review.test.mjs`), drawn by `assets/intake.mjs` (tests:
`tests/e2e/intake.spec.mjs`), then finished in the editor.

- **Questions**, which must be answered before going on to the editor (or copying):
  - a time for every step the planner can't time (`planLineup(...).unknown`),
    filled in from its `suggest`, or "It doesn't wait";
  - a bake, rise, chill or cool the intake flagged (`time`) inside a step
    that already waits for something else ("Bake until deep golden. Then let
    them cool…"): the planner can't see it, so it's asked too, and answering
    splits the step after that sentence;
  - for a cooking dish (not a component), how it's served (Hot, Soon, Keeps)
    and how long it can sit. Nothing is chosen for you; the reader's guess is
    shown as a hint. Baking, cocktails and components show their serving to
    confirm instead.
- **The original**, beside the preview (on a phone, under "Show the
  original"): the pasted text, the text read from the PDF (with its name), or
  the web page's address to open. It's only shown, never put in the recipe or
  sent anywhere. Drawn by `assets/import-view.mjs`, as the editor draws it.
- **The preview**: the recipe as read, drawn by the recipe page's own code
  (`assets/recipe-view.js`), with the "Prep first" switch. It's only to look
  at here: it's fixed in the editor.
- **Things to check**: every flag (every amount, no amount, unreadable,
  storage, total time, cover, planning notes).
- **Filled in quietly**: hands-on times and equipment, as the reader gives them.
- **Finish**: signed in to an account that can edit the site, "Continue in
  the editor" (once the questions are answered) opens it in the editor as a
  new recipe, `edit.html?new`. "Copy instead", or "Copy recipe" for anyone
  else, gives the recipe file (`recipeToSave`: the review's marks taken off,
  dated today) and its file name: add it to `recipes/`, run
  `node scripts/build-index.mjs` and commit.
- **The review is kept** in this browser (`sss:intake`, through `toKeep` and
  `fromKept`) as it changes: the review with its answers, and the text it was
  read from (pasted text or a PDF's text, never the PDF itself; for a web
  page, its address). Coming back after a reload or an accidental back offers
  it: "Carry on with Milk Rolls?", with "Carry on" or "Start over". Reading
  another recipe replaces it. Copying doesn't clear it, since the recipe isn't
  on the site yet.

### In the editor (`edit.html?new`)

The editor (`assets/edit.mjs`) opens the kept review as a new recipe: the
card, the page and Details as for any recipe, with the original beside the
preview, and on its steps and ingredients the reader's guesses to confirm
(split steps, "Join back"; joined alternatives, "Split back out"; "Needs you
there"; prep: ahead, just before, not prep; "Done while an earlier step
waits"; linked recipes, "Usually already made or bought", "Unlink") and the
things to check. The rest of the things to check are listed above the
preview. Its changes are kept in `sss:intake` too, so the intake and the
editor always share one draft. Its file name is made from its title
(`slugOf`), and a name already on the site is a problem to fix. Save publishes
it as a new file (no `baseSha`), clears the kept review, and from then on it's
`edit.html?r=<name>`, edited like any other recipe. Tests:
`tests/e2e/intake-to-editor.spec.mjs`.

Not yet: the "Couldn't place" list. Questions a change in the editor raises
(a new bake with no time) show as the checker's to-dos, not as questions.

### For the lineup session

Found while building the review screen; `assets/planner.mjs` isn't changed here.

- **`unknown` misses a wait in a step that already waits.** "Bake until deep
  golden. Then let them cool on a rack, at least 15 minutes." has the cooling
  as its `wait`, so the bake isn't reported, and a plan counts no baking time.
  The intake asks about it from its own `time` flag; the lineup page wouldn't.
- **There's no way to record "this step doesn't wait".** When the person
  answers "It doesn't wait" (a false alarm from the wording), the recipe saves
  without a `wait`, so `unknown` will report the same step again on the lineup
  page. A field such as `wait: false` would let the intake save the answer.
- **Some steps with two timed actions aren't split** by the restructuring:
  "Bring … to a boil, then cover and simmer until tender. Let it rest off the
  heat" stays one step, and "Brown the chicken …, 5 minutes a side" keeps one
  5-minute wait rather than a step per side (the README says per-side times
  are split).

## What the text reader does (`parse.mjs`)

- **Repairs safe OCR slips:** `º` read for `°`, `0z` for `oz`, `1(0.25 oz` →
  `1 (0.25 oz`, `11/2` → `1 1/2`, footnote markers (`①`, or a stray letter:
  "braid them. a Then").
- **Joins pages** at "(continues)", and lines that wrapped (a weight on its own
  line, a line ending in a comma, a line starting in lower case).
- **Finds the parts:** the header (season, active and total time, servings),
  the title, "Special Equipment", ingredient groups (headings in capitals:
  DOUGH, FILLING AND ASSEMBLY), the story before the method, named steps
  ("Proof the yeast: …" becomes a step group), numbered or bulleted lines
  (screenshots and apps), "DO AHEAD" and other notes, footnotes, and a
  "Source:" link.
- **Splits ingredient lines** into amount, weight, item and note:
  "1 stick unsalted butter (4 oz / 113g), cut into ½-inch pieces" →
  `{ qty: "1 stick", grams: 113, item: "unsalted butter", note: "cut into ½-inch pieces" }`.
  A can's size stays with its amount ("1 (28 ounce) can").
- **Writes waits the site's way** ("1 1/2 to 2 1/2 hours") so cook-mode timers
  and the planner can read them.

Tests: `tests/unit/intake.test.mjs` (part of `npm test`), with made-up recipes
in the layout of a real cookbook page and of a recipe app.

## Results

**The Babkallah from Jacob's photos** (Live Text, two pages), against the site's
Babkallah: all 15 ingredients found in their 2 groups, 14 with the same amount
(the 15th is the book's "1 envelope (about 2¼ teaspoons)" yeast, also right),
all 15 weights the same; the book's 10 paragraphs in 8 named groups; the waits match the
site's, and the one the site added by hand (cooling, about 1 hr) is flagged as
missing a time. Two steps are split and marked for review: "Proof the yeast"
(warming the milk on the stove, then the 5 to 10 minute wait in a bowl) and
"Bake" (the bake, then cooling), giving 13 steps. Equipment, the story, "Do ahead" and both footnotes land in
their own places. Run it with your own copies of the pages (kept out of the
repo, since they're from a published book):

```sh
node tools/intake/compare.mjs babkallah page1.txt page2.txt --show
```

**A web page** (food.com's Spicy Thai Peanut Sauce): exact ingredients, yield
and times, and an added prep step; only the section needs choosing. Its own
method is one line ("Blend all ingredients"), and no code can add detail a
page doesn't have.

**Reading photos.** Jacob's four photos (two Babkallah pages and two brownie
pages from *Dessert Person*, with shadows, curved pages and two columns)
scored on the 59 numbers that matter (amounts, times, temperatures, pan
sizes) with `tools/intake/ocr/score-photos.mjs`:

| OCR (all free) | Babkallah pages (30) | All four pages (59) | Time per page (4-core cloud machine) |
|---|---|---|---|
| Apple Live Text, whole page | 30 | (brownies not copied) | instant, on the phone |
| Florence-2 large, tiled | 24 | 50 | 2–3 min |
| Florence-2 base, tiled, fast settings | 24 | 48 | about 30 s |
| RapidOCR | 21 | 37 | seconds |
| Tesseract after clean-up | 17 | 29 | seconds |
| Tesseract | 8 | 19 | seconds |

Every engine but Live Text misreads fractions ("½ cup" as "¥ cup", "⅓" as
"%", "2¼" as "2%"), and one read "2 tablespoons" as "9 tablespoons". Live Text
also keeps the columns in reading order when the whole page is copied.

Florence-2 base is the one that could run in a web browser (transformers.js,
untested here). Its tiled output can't go through the text reader yet: the
overlapping tiles give fragments, so it would need line positions
(`<OCR_WITH_REGION>`) to stitch the page back together.

Scripts: `ocr/florence.py`, `ocr/rapidocr.py`, `ocr/score-photos.mjs`. The
photos and OCR text stay out of the repo.

## Known gaps

- The section (Baking, Cooking, Cocktails), tags and key ingredients aren't
  guessed.
- A step with no heading after a named one joins that named group, which is
  right for a step continued across pages, and could be wrong elsewhere.
- Added prep steps join the group of the step they come before ("Proof the
  yeast"); a "Prep" group of their own may read better.
- The planning data's judgement calls (prep or "just before", watched waits,
  how long a dish can sit) need a person: see `tools/restructure/README.md`.
