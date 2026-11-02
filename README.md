# Shaken, Stirred & Sautéed

My collection of baking, cooking, and cocktail recipes, as a phone-friendly website.

**Live site:** https://jdenn0514.github.io/shaken-stirred-sauteed/

## Features

- Search by name, ingredient, or tag
- Filter by category (Baking / Cooking / Cocktails) and by tag; sort A–Z, newest, or quickest
- Tap ingredients to check them off and tap steps to mark them done. Your progress is saved on your phone.
- "Keep screen on" button so the phone doesn't lock mid-recipe
- Add it to your phone's home screen and it opens like an app. Recipes you've already opened also work offline.
- Clean print layout

No frameworks and no build step: it's plain HTML, CSS, and JavaScript served by GitHub Pages.

## Adding a recipe

1. Copy `recipes/_template.json` to `recipes/<recipe-name>.json`. Use lowercase letters, numbers, and dashes only, e.g. `brown-butter-cookies.json`.
2. Fill it in. `category` must be `baking`, `cooking`, or `cocktails`. Times are in minutes.
3. Rebuild the index (needs [Node.js](https://nodejs.org)):

   ```sh
   node scripts/build-index.mjs
   ```

4. Commit and push. The site updates within a minute or two.

A GitHub Action re-runs the index check on every push and flags any recipe with a mistake.

### Recipe fields

| Field | Required | Notes |
|---|---|---|
| `title` | yes | |
| `category` | yes | `baking`, `cooking`, or `cocktails` |
| `ingredients` | yes | List of ingredients, or `{ "group": "For the sauce", "items": [...] }` sections. An ingredient is a string, or `{ "grams": 150, "qty": "3/4 cup", "ml": 60, "item": "Sugar", "note": "softened" }` (only `item` is required) |
| `steps` | yes | Same list format. A step is a string, or `{ "do": "...", "wait": "10 min", "cue": "Golden at the edges" }` |
| `kind` | | `dish` (the default) or `component`, for things made to go into other recipes: sauces, curds, syrups, homemade pasta |
| `description` | | Short blurb shown on the card |
| `tags` | | Filter tags, e.g. `{ "occasion": ["weeknight"], "ingredients": ["chicken", "lime"] }`. Only the filters and values listed in `recipes/vocabulary.json` for the recipe's category are allowed, and the build fails on anything else |
| `added` | | Date added (`YYYY-MM-DD`), used by "Newest" sort |
| `yield` | | e.g. `"Makes 24 cookies"`, `"Serves 6"` |
| `times` | | Times as written, e.g. `[["Active", "15 min"], ["Marinate", "4 to 8 hours"]]` |
| `time` | | `{ "prep": 15, "cook": 30, "chill": 60 }` in minutes; `total` is optional and is otherwise added up. Used by "Quickest" sort, and shown when there's no `times` |
| `beforeYouStart` | | List of prep to do before step 1 |
| `notes` | | List of tips, or `{ "group": "Substitutions", "items": [...] }` sections |
| `image` | | Path like `images/brown-butter-cookies.jpg` |
| `source` | | `{ "name": "Grandma", "url": "" }` |

Labels from the recipe cards, shown under the title:

| Category | Fields |
|---|---|
| Cooking | `aroma` (e.g. `chile_lime_corn`), `role` (e.g. `protein_main`), `technique`, `region`, `nutrition` |
| Baking | `bakeCategory` (e.g. `Pies & Tarts`), `flavor` (`sweet`, `savory`, or `both`), `pan`, `heat` with `heatLabel` (`Oven` or `Heat`) |
| Cocktails | `flavor` (e.g. `bright_tart`), `family` (e.g. `sour`), `base`, `origin`, `glass`, `ice`, `garnish`, `method`, `keeps`, `abv`, `standardDrinks` |

The aroma, role, flavor and family keys are listed with their display names in `assets/common.js`.

### Source PDFs

`source-pdfs/` holds the original phone-sized recipe cards each recipe was converted from.

## Running locally

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```
