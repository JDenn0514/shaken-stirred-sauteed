# Ideas for later

Projects that came up while designing something else. None of them is planned yet. When one starts, it gets its own spec in `docs/specs/`.

## Recipe import tool

2026-11-03 · from the cook mode design (`docs/specs/cook-mode-design.md`, where it's a planned separate project) and the lineup design (`docs/specs/meal-planner-design.md`)

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
- **Linked recipes:** an ingredient that's a recipe on the site ("garlic paste", "lemon curd") links to it, and an optional ingredient is marked `optional`. Required links are nested recipes, which come with the dish; optional ones are connected recipes, added on their own (see the lineup spec). One the source makes elsewhere ("steak seasoning, see recipe") is flagged, so Jacob can decide whether to add it.
- **Tags** from `recipes/vocabulary.json`. A recipe that belongs in two sections (blueberry syrup in Cocktails and Baking) can only have one `category` today; see "A recipe in more than one section" below.

**Rules it should follow:**

- **Say what it guessed.** Estimated times, cues and tags it filled in are listed for review, never passed off as the source's. When the cook doesn't know a time ("until the sugar dissolved"), it writes an "About" estimate and says so.
- **Credit the source** in `source`, and don't copy a source's text word for word.
- **Run the recipe checker** (`node scripts/build-index.mjs`) before handing it over.
- **Note:** fetching a site needs it allowed in the cloud environment's network settings. The same sites worked from the command line before the web-fetch tool picked up the change.

## A recipe in more than one section

2026-11-10 · from Jacob, answering the editor review (`docs/specs/editor-redesign.md`, decision 6)

Blueberry syrup goes in pancakes (Cooking), on cakes (Baking) and in drinks (Cocktails), but a recipe has one `category` today, so it shows in one section only.

**Things to work out:**

- **Home and guest sections:** one section stays the recipe's own (its colours, drawing and page), and it's listed in the others too. Or it has no single home.
- **Tags:** each section has its own tags in `recipes/vocabulary.json`, so a recipe in two sections may need tags from both.
- **What changes:** the recipe format (`category` as a list, or a new field such as `alsoIn`), the checker, `recipes/index.json`, the section pages and filters, and the editor's section control (decision 6 in the editor review, built so it can grow from one section to several).
- **Components:** most recipes that belong in several sections are components (syrups, sauces, curds). Linking from other recipes may already cover some of the need.

## Step controls you can find in the editor

2026-11-09 · from adding the 50-clove garlic soup through the intake

The editor (`edit.html`, and `edit.html?new` from the intake) can already add, remove, move, split and join steps, but you can't tell. The controls only show once you tap a step's text, and nothing says the text can be tapped: it looks like a dotted underline, not a button. Adding the garlic soup, its step 2 ("Cook garlic 5 minutes in butter. Onion 2 minutes, potato 1 minute then add stock…") needed splitting, and it looked like there was no way to add a step between two others or delete one.

**What it could change:**

- **Show that a step can be edited:** an "Edit" button on each step, or a hint at the top of the steps, not only the dotted underline.
- **Add a step in the middle:** "Add step" only adds at the end today (`add` in `assets/edit-model.mjs`), and then you move it up one place at a time. An "Add a step after this" button would be quicker.
- **Remove without opening the step**, perhaps, if it's easy to undo.
- **Where the wait goes when splitting:** "Split here" gives the step's wait, cue and equipment to the second part (`SECOND` in `assets/edit-model.mjs`). That's right for "Stir in the flour, then bake 20 minutes", but wrong when the time is in the first part, as with the soup's "Cook garlic 5 minutes". The wait could go to whichever part has that time in its text, the way the intake works out which sentence a step's wait belongs to, or the editor could ask.
- **A step with several timed parts** ("Onion 2 minutes, potato 1 minute") could be offered as a split from the start, the way the intake already asks about a second wait in a step and splits the step there.

## Scaling a recipe

2026-11-10 · from Jacob

A size choice at the top of the recipe page: **1x** (the default), **2x**, **3x** and **Custom**. Picking one changes the amount of every ingredient to match.

**Things to work out:**

- **Which amounts can scale:** `grams`, `ml` and `qty` scale. A `qty` is text ("3/4 cup", "1 1/2 tsp"), so it has to be read as a number and written back as a kitchen fraction ("1 1/2 cups", not "1.5 cups"). A plain-string ingredient ("Salt to taste") can't be read, so it stays as written, perhaps with a mark saying so.
- **Custom:** a number like 1.5 or 0.5, or "how many servings" when the recipe's `yield` has a number in it ("Serves 6", "Makes 24 cookies").
- **What else changes:** the `yield` line, and a step's share of an ingredient in cook mode (`uses` with `"amount": "100 g"`). Shares like "half" or "the rest" stay as they are.
- **What doesn't scale on its own:** times, pan size, eggs (2.5 eggs), and spices or salt, which often shouldn't go up as fast as the rest. The page could say so when the size isn't 1x, rather than guess.
- **Where it goes:** whether cook mode and the lineup pick up the size from the recipe page, or have their own. A lineup cooking a double batch is the case that needs it.
- **Remembered or not:** whether the size resets to 1x each time the recipe opens.

## Metric and imperial amounts

2026-11-11 · from Jacob, while choosing the recipe format rules

Every ingredient carries both a metric and an imperial amount, and you choose which one the site shows. Today a recipe gives one measure, or both in two places: the metric number in `grams` or `ml`, and the US one as text in `qty` (`{ "grams": 300, "qty": "10.5 oz", "item": "Yellow noodles" }`, shown as "300 g · 10.5 oz").

**A format Jacob suggested:** both amounts nested in `qty`, each a number with its unit:

```json
{ "qty": { "g": 300, "oz": 10.5 }, "item": "Yellow noodles" }
```

**Things to work out:**

- **Amounts that aren't a unit pair:** "to taste", "2 cloves", "1 large", "1 can (28 oz)". Either `qty` stays text for those, or it becomes an object with fields such as `count` or `text`.
- **Converting the recipes:** amounts already in `grams`/`ml` move over mechanically. The others need converting, and cups to grams depends on the ingredient (a cup of flour and a cup of sugar weigh different amounts), so those need a table per ingredient or a person to check them.
- **What reads `qty` today:** the recipe page, cook mode, the editor, search, the recipe checker and the random recipes the recipe laws test with. Each would change.
- **The choice itself:** a switch on the recipe page, or the "Units" setting on the settings page (below).
- **Scaling** (above) wants the same thing, amounts as numbers, so the two could share a format.

## Your own notes on a recipe

2026-11-10 · from Jacob

A button on the recipe page, such as "Add a note", that lets you write your own notes on a recipe: what you changed, what to do differently next time, who liked it. They show on the recipe each time you open it, beside the recipe's own `notes` but marked as yours, and can be edited or deleted.

**Things to work out:**

- **Where they're saved:** on the device in `localStorage` is the easy start, but a note written on a phone won't show on a laptop, and clearing the browser loses it. That's the same question as the settings page's "Multiple users" below: notes belong to a person, so they need to be kept in one place that could later be saved per person.
- **Kept with the recipe, or not:** a note that's good for everyone could be copied into the recipe's `notes` with the editor instead.
- **Where they show:** in their own section on the recipe page, and maybe in cook mode, since that's when you'd want to remember "use less salt".
- **Notes on a step,** not only the whole recipe, could come later.

## Settings page

2026-11-03 · from the lineup design (`docs/specs/meal-planner-design.md`)

A page that holds your cooking preferences so you don't pick them every time. The first one is **prep first**: the lineup's "Prep everything first" or "Fastest", which also decides whether a single recipe shows its steps prep first or as written. Until this page exists, the lineup page and the recipe page's order toggle remember that choice themselves.

Other settings that could move here:

- **Theme.** It's saved today as `theme`, by `assets/theme.js`.
- **Your pace,** if the planner learns how fast you cook.
- **Cooking setup:** number of burners, ovens and so on.
- **Units:** grams or cups first.

**Saved where:** the theme is kept on the device in `localStorage`, and settings could start there too. **Multiple users** is what would change that. If the site ever plans for more than one person (each with their own pace, preferences and saved meals), settings need to belong to a person, not a device. That means some kind of account or profile, and somewhere to store it beyond the browser. That decision belongs to the multi-user project. A settings page on the device first doesn't block it, as long as the settings are kept in one place that could later be saved per person.

## Multi-user

2026-11-01 · from the recipe editor design (`docs/specs/recipe-editor-design.md`, where it's under "Later")

Accounts for friends and family, so each person can add their own recipes and keep their own things on the site. Today only Jacob can sign in and edit; visitors see the site without an account.

**What's already in place:** sign-in with GitHub through Better Auth in the Worker, with its tables in D1 (Cloudflare's database). Better Auth can add Google or email sign-in for others. The editor is built to be reused, with only saving swapped: from "commit to the repo" to "save to my account" in D1. D1 only holds sign-in data today.

**Open questions,** parked on 2026-11-01:

- **One shared library, or each person's own copies** of recipes.
- **How people sign in:** GitHub suits Jacob, not most friends and family.
- **Scope:** what a person can do (add recipes, edit others', only their own).
- **Audience:** who it's for, and whether visitors without an account still see everything.
- **The AI step:** friends importing with it would share the free daily allowance.

**What waits for it**, and should be kept somewhere that can later move to a person's account:

- **Settings** (above): prep first, theme, pace, cooking setup, units.
- **Your own notes on a recipe** (above).
- **Saved lineups,** and maybe the size you last scaled a recipe to.
- **Feedback and bug reports** (below).

## Feedback and bug reports

2026-11-10 · from Jacob, for when the multi-user version is built

A way for people using the site to send feedback or report a bug, without leaving the site or needing a GitHub account: a "Send feedback" link in the footer, and maybe "Something wrong with this recipe?" on each recipe page.

**Things to work out:**

- **Feedback, bug reports, or both:** one form with a choice ("Something's broken", "An idea", "A recipe problem"), or separate ones.
- **What it fills in for you:** the page and recipe it was sent from, the browser and device, and who sent it if they're signed in, so a report like "the timer didn't start" can be followed up. The person sees what's sent before sending it.
- **Where reports go:** a GitHub issue on this repo, opened by the Worker (the GitHub App would need permission to open issues), keeps them next to the code. A table in D1 keeps them private. Either way, the person sending one doesn't connect to anything themselves.
- **Who can send one:** signed-in people only keeps out spam. Anyone, with a limit per day, is easier for visitors.
- **Hearing back:** whether the sender can see when a report is fixed, and whether Jacob gets told when one comes in.
- **Privacy:** don't send recipe notes, settings or anything else personal unless the person adds it.
