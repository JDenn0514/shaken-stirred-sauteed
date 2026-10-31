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
| `ingredients` | yes | List of strings, or `{ "group": "For the sauce", "items": [...] }` sections |
| `steps` | yes | Same format as ingredients |
| `description` | | Short blurb shown on the card |
| `tags` | | e.g. `["weeknight", "gin", "holiday"]` |
| `added` | | Date added (`YYYY-MM-DD`), used by "Newest" sort |
| `yield` | | e.g. `"24 cookies"`, `"1 drink"` |
| `time` | | `{ "prep": 15, "cook": 30, "chill": 60 }` in minutes; `total` is optional and is otherwise added up |
| `glass`, `method`, `garnish` | | Handy for cocktails, e.g. `"coupe"`, `"shaken"`, `"lemon twist"` |
| `notes` | | List of tips or tweaks |
| `image` | | Path like `images/brown-butter-cookies.jpg` |
| `source` | | `{ "name": "Grandma", "url": "" }` |

## Running locally

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```
