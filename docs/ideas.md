# Ideas for later

Projects that came up while designing something else. None of them is planned yet. When one starts, it gets its own spec in `docs/specs/`.

## Recipe import tool

2026-11-03 · from the cook mode design (`docs/specs/cook-mode-design.md`, where it's a planned separate project) and the meal planner design (`docs/specs/meal-planner-design.md`)

A tool that turns a recipe from a web page or a photo into the site's recipe JSON, ready for Jacob to review.

**What it reads:**

- **Web pages:** most recipe sites embed the recipe as structured data (schema.org `Recipe` in JSON-LD): name, yield, times, ingredients and steps. The recipe card's notes usually aren't in that data and have to be read from the page. That's how the ribeye and whipped cream recipes were added by hand.
- **Photos:** a cookbook page or a handwritten card.
- **What you tell it:** your own recipes, like the blueberry syrup and blueberry whipped cream, worked out in conversation.

**What it writes, beyond copying the recipe:**

- **The source's steps, as written,** reworded in the site's style. Its order is kept, so "as written" means what the source said.
- **Waits:** timing hidden in step text ("beat for 3 to 4 minutes") moves into `wait`, so cook mode gives it a timer. A tip like "let the steak sit out 30 minutes" can become a step of its own with a wait, so cook mode times it and a meal can start it early.
- **Step ingredients:** `uses` links from each step to its ingredients, including a step's own share of a split ingredient.
- **Prep:** `prep` marks on steps that can be done before any cooking, `"just before"` where doing it early would hurt the dish, and added `prepOnly` steps for prep hidden in ingredient lines ("garlic, minced"). That lets the recipe show prep first or as written.
- **Planning data:** hands-on minutes, waits that need you there, oven, broiler, burner, grill or microwave use, the point after which the dish keeps, and how it's served.
- **Sub-recipes:** an ingredient that's a recipe on the site ("garlic paste", "lemon curd") links to it. One the source makes elsewhere ("steak seasoning, see recipe") is flagged, so Jacob can decide whether to add it.
- **Tags** from `recipes/vocabulary.json`. A recipe that belongs in two sections (blueberry syrup in Cocktails and Baking) can only have one `category` today. That's a separate small change.

**Rules it should follow:**

- **Say what it guessed.** Estimated times, cues and tags it filled in are listed for review, never passed off as the source's. When the cook doesn't know a time ("until the sugar dissolved"), it writes an "About" estimate and says so.
- **Credit the source** in `source`, and don't copy a source's text word for word.
- **Run the recipe checker** (`node scripts/build-index.mjs`) before handing it over.
- **Note:** fetching a site needs it allowed in the cloud environment's network settings. The same sites worked from the command line before the web-fetch tool picked up the change.

## Settings page

2026-11-03 · from the meal planner design (`docs/specs/meal-planner-design.md`)

A page that holds your cooking preferences so you don't pick them every time. The first one is **prep first**: the meal planner's "Prep everything first" or "Fastest", which also decides whether a single recipe shows its steps prep first or as written. Until this page exists, the meal page and the recipe page's order toggle remember that choice themselves.

Other settings that could move here:

- **Theme.** It's saved today as `theme`, by `assets/theme.js`.
- **Your pace,** if the planner learns how fast you cook.
- **Cooking setup:** number of burners, ovens and so on.
- **Units:** grams or cups first.

**Saved where:** the theme is kept on the device in `localStorage`, and settings could start there too. **Multiple users** is what would change that. If the site ever plans for more than one person (each with their own pace, preferences and saved meals), settings need to belong to a person, not a device. That means some kind of account or profile, and somewhere to store it beyond the browser. That decision belongs to the multi-user project. A settings page on the device first doesn't block it, as long as the settings are kept in one place that could later be saved per person.
