# Recipe intake: from a photo or a web page to a draft recipe

The pieces the recipe intake form builds on. Nothing here uses a language
model, so it's free to run. The form itself (where text is pasted, how the
things to check are shown) is the intake's own work.

## How a recipe comes in

1. **A web page:** paste the link. Recipe sites describe the recipe for search
   engines (schema.org `Recipe` data), so the text is exact.
   `draftFromSchemaOrg(htmlOrData, { category, url, titles })`.
   Some sites (allrecipes) refuse automated requests; then copy the page text.
2. **A cookbook page or a screenshot:** copy the text with Apple Live Text
   (Photos: press and hold on the text, Select All, Copy) and paste it,
   one page at a time. `draftFromText([page1, page2], { category, titles })`.
3. Either way the draft gets the lineup planning data from
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
| `title`, `ingredients`, `steps` | Nothing found |

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
