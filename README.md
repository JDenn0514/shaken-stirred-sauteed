# Shaken, Stirred & Sautéed

My collection of baking, cooking, and cocktail recipes, as a phone-friendly website.

**Live site:** https://shaken-stirred-sauteed.com/

## Features

- A calm welcome page (`index.html`): a search box, one large entry point per section, and a link to the full index (`recipes.html`)
- Search by name, ingredient, or tag
- Baking, Cooking and Cocktails sections, each with its own filters (cuisine, flavor, base spirit…), plus shared ones (ingredients, time, occasion, season, diet). Pick several options in a filter to widen it; combine filters to narrow down. Sort A–Z, newest, or quickest
- Tap ingredients to check them off and tap steps to mark them done. Your progress is saved on your phone.
- Prep first: a recipe's steps start with its prep (chopping, measuring, getting things ready), under a "Prep" heading, then the cooking. Switch "Prep first" off to see the recipe as written. The choice is saved, applies to cook mode too, and is the same one as the menu's "Prep everything first". Recipes whose order would be the same both ways have no switch.
- "Keep screen on" button so the phone doesn't lock mid-recipe
- Cook mode ("Start baking", "Start cooking", "Start mixing"): the steps one screen at a time, with each step's ingredients and amounts to tick off, a peek at what's up next, and timers for waits. Timers keep running as you move on, even into another recipe, and ring while cook mode is open on screen. It shares its progress with the recipe page.
- Your menu (`menu.html`): cook several recipes together, such as a whole dinner, or one dessert made from a few recipes. Add a recipe with "+ Add to menu" on its page, or search on the menu page. The menu card shows each course, the recipes a dish needs (Make it or Already made), and anything worth making ahead. "Start cooking" walks through every dish's steps in one order, planned so hot dishes are ready together. It re-plans each time you move on. Waits get a screen of their own, a ringing timer says what to do next, and the menu ends with one "Plate up" step. Steps done here count as done on each recipe's own page.
- Add it to your phone's home screen and it opens like an app. Recipes you've already opened also work offline.
- Clean print layout
- Each section has its own colour (baking persimmon, cooking holly green, cocktails cobalt), and every recipe has its own drawing: its glass for cocktails, its dish for food
- A designed dark mode for cooking at night

No frameworks and no build step: it's plain HTML, CSS, and JavaScript, served by Cloudflare (see "Hosting").

## Adding a recipe

The quickest way is the intake, `intake.html` on the site (its "Add recipe" link shows only when you're signed in, but the page works for anyone at its address): paste the recipe's text (from a photo, copy it with Live Text), answer its questions, check the preview, and copy the recipe file it gives you into `recipes/`. Then carry on from step 3. See `tools/intake/README.md`.

By hand:

1. Copy `recipes/_template.json` to `recipes/<recipe-name>.json`. Use lowercase letters, numbers, and dashes only, e.g. `brown-butter-cookies.json`.
2. Fill it in. `category` must be `baking`, `cooking`, or `cocktails`. Times are in minutes.
3. Rebuild the index (needs [Node.js](https://nodejs.org)):

   ```sh
   node scripts/build-index.mjs
   ```

4. Commit and push. The site updates within a minute or two.

GitHub Actions re-runs the index check on every pull request and push to main, and flags any recipe with a mistake.

### Recipe fields

| Field | Required | Notes |
|---|---|---|
| `title` | yes | |
| `category` | yes | `baking`, `cooking`, or `cocktails` |
| `ingredients` | yes | List of ingredients, or `{ "group": "For the sauce", "items": [...] }` sections. An ingredient is a string, or `{ "grams": 150, "qty": "3/4 cup", "ml": 60, "item": "Sugar", "note": "softened" }` (only `item` is required). Add `"recipe": "garlic-paste"` when another recipe makes it, and `"optional": true` when the dish works without it |
| `steps` | yes | Same list format. A step is a string, or `{ "do": "...", "wait": "10 min", "cue": "Golden at the edges", "uses": [...] }`. A `wait` that starts with a time ("12 to 15 min", "About 1 hr in the fridge") gets a timer in cook mode, set to the shortest time. See "Step ingredients" below for `uses`, and "Planning a lineup" for the fields the lineup planner reads |
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
| `serve`, `sits` | | For the lineup: `"hot"`, `"soon"` or `"keeps"`, and how long a hot or soon dish can wait once done, e.g. `"sits": "10 min"`. See "Planning a lineup" below |

Category-specific display fields:

| Category | Fields |
|---|---|
| Any | `origin` (e.g. `Milan, Italy`), `nutrition` |
| Baking | `pan`, `heat` with `heatLabel` (`Oven` or `Heat`) |
| Cocktails | `glass`, `ice`, `garnish`, `method`, `keeps`, `abv`, `standardDrinks` |

### Step ingredients

A step's `uses` lists the ingredients it needs, so cook mode can show them with their amounts. Name each by its `item` (or, for a plain-string ingredient, its whole text):

```json
"uses": ["Flour", { "group": "Filling", "item": "Sugar" }, { "item": "Lemon juice", "amount": "half" }]
```

- Add `"group"` when two ingredients share a name (sugar in the crust and in the filling).
- Add `"amount"` when the step uses only part of an ingredient: `"100 g"`, `"half"`, `"the rest"`. Cook mode shows that instead of the full amount, and ticks each use separately.
- Leave `uses` out of steps that don't use any ingredients.

The build fails if a step names an ingredient the recipe doesn't have, or one that matches more than one ingredient.

### Planning a lineup

The lineup cooks several recipes in one order (`docs/specs/meal-planner-design.md`). It plans from these optional fields, and every one has a fallback, so a recipe without them still gets a rough plan. Nothing is guessed from a step's wording.

On a step:

| Field | Means | Without it |
|---|---|---|
| `hands` | How long your hands are busy, e.g. `"10 min"`, `"30 sec"`, `"3 to 4 min"` | The recipe's active or prep time, spread over the steps without one; otherwise 2 min |
| `watch` | `true` when the step's `wait` needs you there (searing, whisking a curd). Needs a `wait` | The wait runs on its own |
| `oven` | The setting the step needs while it runs: `"200C"`, `"400F"`, `"broil"` or `"off"`. `false` says a step that mentions the oven doesn't use it ("set somewhere warm, away from the oven"), or takes the dish out ("Take the potatoes out of the oven"): after the dish's last oven step, the planner keeps the oven for it until that step is done | No oven |
| `preheat` | The step heats the oven to this setting (`"200C"`, `"400F"`, `"broil"`), in the background | The planner adds a heating step when a dish needs the oven |
| `burner`, `grill`, `microwave` | `true` when the step uses one. `false` says a step that mentions one doesn't ("press the dough into the pan") | Not used |
| `prep` | Knife work, measuring, getting ready. `true` can be done ahead, before any cooking; `"just before"` is done close to when it's needed (cut apples that brown, salting a steak) | Not prep |
| `prepOnly` | `true` on an added prep step that brings out prep hidden in an ingredient line ("Mince the garlic"). It shows only when steps are in prep-first order | Shown in both orders |
| `during` | `true` on a step that runs while an earlier step waits, such as frying the pork while the congee simmers. Several in a row run one after another during that wait, and the next step waits for both. The earlier step needs a `wait` without `watch` | Steps run one after another |
| `holds` | `true` on the step after which the dish keeps as long as you like (the pavlova's cooled meringue). One per recipe | A hot dish is tied to serving from its first step |

On the recipe, `serve` is `"hot"`, `"soon"` or `"keeps"`, and `sits` is how long a hot or soon dish can wait once done. Without them, components and baking keep, cocktails are soon (5 min), and cooking dishes are hot (10 min).

On an ingredient, `recipe` is the file name of the recipe that makes it. A required ingredient with a recipe is **nested**: it joins the lineup with its dish. An `optional` one is **connected**: it's a dish of its own you add yourself. Either way, the planner has it ready before the first step whose `uses` names it. A nested recipe starts on "Make it" in the lineup; add `"alreadyMade": true` when you'd usually buy it or have it on hand (homemade pasta in a soup), so it starts on "Already made" instead.

```json
"ingredients": [{ "qty": "1 tsp", "item": "garlic paste", "recipe": "garlic-paste" }],
"steps": [
  { "do": "Heat the oven to 200°C / 400°F.", "hands": "1 min", "preheat": "200C" },
  { "do": "Stir in the garlic paste.", "hands": "2 min", "prep": true, "uses": ["garlic paste"] },
  { "do": "Bake 40 minutes.", "hands": "3 min", "wait": "40 min", "oven": "200C" }
]
```

The build fails on a `hands` or `sits` it can't read as a time, an oven setting it doesn't know, `watch` without a `wait`, more than one `holds`, a `recipe` that doesn't exist (or a list of them, which the planner can't follow yet), and links that loop. It warns when a step mentions the oven, broiler, a pan, the grill or the microwave but has no equipment field, when an ingredient says "optional" but isn't marked `optional`, and when no step uses a linked ingredient.

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

`source-pdfs/` holds the original phone-sized recipe cards each recipe was converted from. They stay in the repo but aren't published on the site.

## Look and feel

The site uses the **Field Guide** style (Vivid botanical colours, warm night): `assets/style.css`, with fonts in `assets/fonts/`, recipe drawings in `assets/icons/` and botanical plates in `assets/*.svg`. The full style guide is at `style-guides/field-guide-vivid-warm/` (open its `index.html`).

Two alternative styles are kept in case you change your mind: `style-guides/field-guide-spice/` (Spice cabinet colours) and `style-guides/order-up-hybrid/` (Order Up). Each has its own style guide and a `preview/` that runs the real site in that style. See `style-guides/README.md` for how to switch.

## Hosting

The site is on Cloudflare's free plan, at shaken-stirred-sauteed.com. Cloudflare publishes `main` a minute or two after every push.

- `wrangler.jsonc` sets it up: one Worker that serves the site's files as they are, at the same addresses as before (`recipe.html?r=…`). Only `/api/` runs code (`worker/src/`), for the recipe editor's sign-in and saving (`docs/specs/recipe-editor-design.md`).
- The Worker is its own small program in `worker/`, with its own `package.json` (Better Auth for signing in). It's an npm workspace, so `npm install` at the top installs it too, and Cloudflare installs and bundles it when it deploys.
- **Signing in** is with GitHub, through a GitHub App installed only on this repo: the "Sign in" link in every page's footer. Anyone can sign in, but only an account that can push to this repo can edit the site. Its users, sessions and GitHub tokens (encrypted) are in a D1 database, `shaken-stirred-sauteed-auth`. Its secrets (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BETTER_AUTH_SECRET`) are set in Cloudflare's dashboard, never in the repo. It only works on shaken-stirred-sauteed.com: branch previews can't sign in, since GitHub only sends you back to the real address.
- **The database's tables** are made by the files in `worker/migrations/`. A new one is applied once, from a computer signed in to Cloudflare (`npx wrangler login`), before the change that needs it is merged:

  ```sh
  npx wrangler d1 migrations apply shaken-stirred-sauteed-auth --remote
  ```

  It asks "continue?" first; answer yes, or nothing is applied. Then check that it says "No migrations to apply!":

  ```sh
  npx wrangler d1 migrations list shaken-stirred-sauteed-auth --remote
  ```

  If a migration is missing, every `/api/` request fails with "Sign-in isn't working right now", and the Worker's logs say "Database schema mismatch".

  When Better Auth is updated or its settings change, `node worker/scripts/auth-schema.mjs` prints the SQL for the next migration (the Worker's tests fail until it's added).
- `.assetsignore` lists what isn't published: tests, notes, settings, `source-pdfs/` and the like. Anything new that isn't part of the site goes there.
- The old address, jdenn0514.github.io/shaken-stirred-sauteed/, shows a "moved" page (`moved/`) that sends visitors to the same page here. It's published by the "Old address: moved page" GitHub workflow, run by hand.

## Running locally

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Tests

The tests need [Node.js](https://nodejs.org) and Google Chrome. They're for development only: the site itself still has no dependencies. (The Worker in `worker/` has its own, installed by the same `npm install`.)

```sh
npm install                      # once
npx playwright install webkit    # once, and again when Playwright updates
npm test
```

- `npm run check` runs the quick checks in a few seconds: lint (Oxlint), broken links (`scripts/check-links.mjs`: every page, stylesheet font, app icon, recipe photo and recipe drawing the site points at must exist), the recipes, the tests in `tests/unit/` and the Worker's tests. After `npm install` it also runs before every `git push`, and stops the push if something fails.
- `tests/unit/` checks the recipe checker (`scripts/build-index.mjs`, whose checks live in `assets/recipe-checks.js` so the editor can share them): what it rejects, what it warns about, and what it writes into the index, and that patching one recipe's entry into the index gives the same index as a full rebuild. It also checks the link checker, the lineup planner (`assets/planner.mjs`) what the menu's cook mode makes of a plan (`assets/menu-plan.mjs`), and the editor's changes to a recipe (`assets/edit-model.mjs`).
- `worker/test/` tests the Worker (`npm run test:worker`) with Vitest in Cloudflare's real Workers runtime, with a local D1 database and a fake GitHub: signing in and out, the cookies it sets, where sign-in may send you back to, who's signed in and whether they can edit, renewing GitHub's 8-hour token, and that the migrations make every table Better Auth needs.
- `tests/e2e/` opens the site in Chrome and again in WebKit, the engine behind Safari and every browser on an iPhone. It uses a small set of test recipes, not the real ones, and covers:
  - the index page: search, sections, filters, sorting and links
  - the recipe page: what it shows, checking things off, the current step, and handling bad recipe files. It also opens every real recipe to make sure each one loads without errors
  - cook mode: moving through the steps, each step's ingredients, timers (on a clock the test controls), and a walk through every real recipe
  - prep first or as written: the order of a recipe's steps on its page and in cook mode, that progress follows the step either way, and that the switch works from the keyboard
  - your menu: adding dishes, the menu card and its choices, the questions it asks, the links from other pages, and cooking a menu (waits, timers and what follows them, plating up, the part made ahead)
  - the recipe editor (`edit.html`, not linked from the site yet): the preview of the card and page, editing in place by keyboard, Details and the lineup fields, the checker's problems and to-dos, the unsaved draft, that fields the editor has no control for come out unchanged, and that it asks you to sign in
  - light and dark mode
  - signing in and out from the footer, with the Worker faked
  - an automated accessibility scan of every page in both modes

GitHub Actions runs all of them on every pull request and every push to main (`.github/workflows/ci.yml`). The quick checks and the browser tests run side by side, and the browser tests are split across several machines, so a run takes about as long as one slice of the browser tests. Dependabot opens a pull request when the test tools or the GitHub Actions have a new version.
