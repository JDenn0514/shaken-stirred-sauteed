# Shaken, Stirred & Sautéed

My collection of baking, cooking, and cocktail recipes, as a phone-friendly website.

**Live site:** https://jdenn0514.github.io/shaken-stirred-sauteed/

## Features

- A calm welcome page (`index.html`): a search box, one large entry point per section, and a link to the full index (`recipes.html`)
- Search by name, ingredient, or tag
- Baking, Cooking and Cocktails sections, each with its own filters (cuisine, flavor, base spirit…), plus shared ones (ingredients, time, occasion, season, diet). Pick several options in a filter to widen it; combine filters to narrow down. Sort A–Z, newest, or quickest
- Tap ingredients to check them off and tap steps to mark them done. Your progress is saved on your phone.
- "Keep screen on" button so the phone doesn't lock mid-recipe
- Add it to your phone's home screen and it opens like an app. Recipes you've already opened also work offline.
- Clean print layout
- Each section has its own colour (baking persimmon, cooking holly green, cocktails cobalt), and every recipe has its own drawing: its glass for cocktails, its dish for food
- A designed dark mode for cooking at night

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
| `tags` | | Filter tags, e.g. `{ "cuisine": ["thai"], "ingredients": ["chicken", "lime"] }`. See "Tags" below |
| `added` | | Date added (`YYYY-MM-DD`), used by "Newest" sort |
| `yield` | | e.g. `"Makes 24 cookies"`, `"Serves 6"` |
| `times` | | Times as written, e.g. `[["Active", "15 min"], ["Marinate", "4 to 8 hours"]]` |
| `time` | | `{ "prep": 15, "cook": 30, "chill": 60 }` in minutes; `total` is optional and is otherwise added up. Used by "Quickest" sort, and shown when there's no `times` |
| `beforeYouStart` | | List of prep to do before step 1 |
| `notes` | | List of tips, or `{ "group": "Substitutions", "items": [...] }` sections |
| `image` | | Path like `images/brown-butter-cookies.jpg` |
| `icon` | | The drawing on the card and recipe page. Usually leave it out: it's picked from the cocktail's `glass`, the baking `type` or the cooking `course`. Set it when that guess is wrong, e.g. `"icon": "donut"`. Allowed values are listed in `assets/recipe-icons.js` |
| `source` | | `{ "name": "Grandma", "url": "" }` |

Category-specific display fields:

| Category | Fields |
|---|---|
| Any | `origin` (e.g. `Milan, Italy`), `nutrition` |
| Baking | `pan`, `heat` with `heatLabel` (`Oven` or `Heat`) |
| Cocktails | `glass`, `ice`, `garnish`, `method`, `keeps`, `abv`, `standardDrinks` |

### Tags

Every filter and its allowed values live in `recipes/vocabulary.json`. To tag a recipe, list values by filter key:

```json
"tags": {
  "course": ["full-meal"],
  "cuisine": ["chinese-taiwanese"],
  "flavor": ["umami", "sweet-savory"],
  "ingredients": ["pork", "soy-sauce", "rice"],
  "occasion": ["meal-prep"],
  "season": ["fall", "winter"],
  "diet": ["dairy-free"]
}
```

| Section | Filters |
|---|---|
| All sections | `ingredients` (1–4 key ingredients), `occasion`, `season`, `diet` |
| Cooking | `course`, `cuisine`, `flavor`, `method` |
| Baking | `type`, `flavor`, `usesUp` |
| Cocktails | `spirit`, `style`, `flavor` |

Time, cocktail strength and dish/component are worked out automatically from `time`, `standardDrinks` and `kind`, so don't tag them.

The build fails if a recipe uses a value that isn't in the vocabulary, or a filter from another section. It warns about recipes with no total time or no key ingredients, and about vocabulary values no recipe uses yet. To add a new value (a new cuisine, say), add it to `recipes/vocabulary.json` first.

### Source PDFs

`source-pdfs/` holds the original phone-sized recipe cards each recipe was converted from.

## Look and feel

The site uses the **Field Guide** style (Vivid botanical colours, warm night): `assets/style.css`, with fonts in `assets/fonts/`, recipe drawings in `assets/icons/` and botanical plates in `assets/*.svg`. The full style guide is at `style-guides/field-guide-vivid-warm/` (open its `index.html`).

Two alternative styles are kept in case you change your mind: `style-guides/field-guide-spice/` (Spice cabinet colours) and `style-guides/order-up-hybrid/` (Order Up). Each has its own style guide and a `preview/` that runs the real site in that style. See `style-guides/README.md` for how to switch.

## Running locally

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Tests

The tests need [Node.js](https://nodejs.org) and Google Chrome. They're for development only: the site itself still has no dependencies.

```sh
npm install   # once
npm test
```

- `tests/unit/` checks the recipe checker (`scripts/build-index.mjs`): what it rejects, what it warns about, and what it writes into the index.
- `tests/e2e/` opens the site in Chrome and checks the index page: search, sections, filters, sorting and links. It uses a small set of test recipes, not the real ones.

The GitHub Action runs them on every push. Dependabot opens a pull request when the test tools have a new version.
