# Meal planner: design

2026-11-03 · Jacob Dennen, with Claude

## Why

Cook mode handles one recipe at a time. A real dinner is several: a ribeye, parmesan asparagus, applesauce and hasselback potatoes. The hard part isn't any single recipe, it's the order. What goes first? What fits into the potatoes' 40 minutes in the oven? When does the steak go on so everything is hot together? The meal planner works that out and walks you through it in cook mode, one step at a time, across all the recipes.

It also covers sub-recipes. A pavlova with lemon curd and blueberry whipped cream is five recipes deep (the cream needs blueberry syrup), and the curd and syrup can be made while the meringue bakes, rather than the day before.

This is the "Later: cooking a whole meal" project from `docs/specs/cook-mode-design.md`.

## Goals

- Pick several recipes as one meal, and cook them in one cook-mode session.
- The planner puts every step of every recipe in one order for **one cook**. Each dish's waits get filled with another dish's hands-on steps. Dishes never need the oven at two settings at once, and you're never asked to do two hands-on things at once.
- Hot dishes are ready together at serving. Things that keep (applesauce, a chilled curd) are made whenever there's room.
- **Order and timers only.** While cooking you see the step to do now, any timers running, and "Nothing to do for about 12 min" when there's a gap. No clock times (Jacob's decision: a schedule makes him stressed).
- The plan re-plans itself from where you are each time you finish a step, so running long never means a broken plan.
- Sub-recipes: an ingredient can link to the recipe that makes it. When you add the dish to a meal, you choose to make it or use some you have, and the planner fits it in before the step that needs it.
- **Prep comes before heat.** Chopping and measuring for a dish is done before that dish's first time-sensitive step, and by default all the meal's prep is done first. Prep is where cooks' speeds vary most, so getting it out of the way keeps the time-sensitive steps on time (Jacob's idea).

## Non-goals

- Two or more cooks. Always one pair of hands.
- Choosing your own order step by step. The planner decides, and the order it picks was checked against Jacob's meals in the prototype. (See Later.)
- Scaling a sub-recipe to the amount needed. You make the whole sub-recipe.
- Guessing a step's equipment or timing from its wording. Planning data is written into the recipes, the same rule cook mode follows for ingredients.
- Oven rack space. Two dishes at the same setting share the oven, however full it gets.
- No change to how single-recipe cook mode works, apart from the step order choice (see "Prep first or as written").

## Anti-goals (failures even if it technically works)

- **A hot dish that's ready long before serving, or one that's late without saying so.** If no order gets everything out on time, the lineup page says which dish will be late, and by about how much.
- **An oven clash.** For example, telling you to broil the asparagus while the potatoes are still baking at 200°C.
- **Two hands-on things at once,** such as basting the steak while the asparagus needs you at the broiler.
- **A clock time in lineup cook mode.**
- **A sub-recipe that isn't ready when its step comes,** such as syrup that's still warm when the cream needs it.
- **Losing a recipe's own progress.** Steps done in a meal show as done on that recipe's own page, and the other way round.

## How the planner works

The prototype (branch `prototype/meal-planner`, and the published page linked in its README) ran this on Jacob's two example meals. He agreed with the orders it chose. The rules:

1. **Work back from serving.** Each dish's last step finishes by serve time. A sub-recipe finishes before the step that uses it. Working backwards gives each step a latest start.
2. **One cook, most urgent first.** Move forward through time. Whenever your hands are free, start the step whose latest start is soonest, among the steps that can start now. A step can start now when the step before it in its recipe is done, its sub-recipes are ready, and its equipment is free.
3. **Waits run on their own,** unless the step marks them as needing you (searing, broiling, whisking a curd). While one runs, your hands go to the next most urgent step.
4. **Hot dishes are held back.** A hot dish doesn't start so early that it would sit longer than it can once done. Dishes that keep have no such limit and fill the gaps.
5. **Equipment:** one oven, four burners, one microwave, one grill.
   - Dishes can share the oven only at the same setting. Temperatures within 15°F (about 10°C) count as the same, so 200°C and 400°F share.
   - A dish holds the oven from its first oven step to its last.
   - Heating the oven runs in the background while you carry on. If a dish needs the oven at a setting and its recipe has no step heating it, the planner adds "Heat the oven to 200°C / 400°F" at the start of that dish, marked as added for this meal. If the oven is already at that setting, the added step is skipped. Turning the oven down or off needs no heating time.
6. **Heating time counts.** Heating takes 15 minutes, or 3 minutes for the broiler. When the step straight after a heating step needs the oven hot, the heating time counts in the backward pass.
7. **Fixing a late dish.** If a dish comes out late, the planner plans it to finish a little earlier, and the same for any dish whose oven use held it up. It never moves a dish earlier than it can sit once done. If no order is on time, it serves at the earliest time it can get everything ready.
8. **The earliest serve time wins.** The planner tries serve times from the shortest possible upward and keeps the first one that works.
9. **Re-planning.** Each time you finish a step, the planner runs again from that moment. Finished steps and running waits stay as they happened, using real elapsed time, so a slow step moves the rest of the meal later. There's no "this took longer" button, because the planner can see it.
10. **Ranges plan from the middle.** "7 to 8 min" plans as 7.5. Timers still start at the short end, as in cook mode, so you check early.
11. **Prep before heat, always.** A dish's prep steps (marked `prep`, see Recipe data) come before its first step that isn't prep. Prep marked "just before" (cutting apples that would brown, salting a steak) is done as late as it can be, but still before the step that needs it.
12. **"Prep everything first" or "Fastest".** These are the two ways to plan a meal.
    - **Prep everything first** (the default): no step that isn't prep starts until all the meal's ahead-of-time prep is done. Only heating the oven, which runs in the background, can start during prep.
    - **Fastest:** prep fills waits like any other step, as in the prototype.

    Prep-first makes the meal longer, since the potatoes go in the oven later. In return, nothing time-sensitive starts until the knife work is behind you. The lineup page shows how long each way takes.

The planner is a pure module (`assets/planner.js`, or the builder's choice of name) with no page code. The prototype's `planner.js` is the starting point.

## Courses and making things ahead

- **Courses.** Each dish in a meal is either **Main** or **Dessert**. Baking dishes start as Dessert and everything else as Main; you can change either.
  - Dessert is served 45 minutes after the main (Jacob agreed). The planner plans it with its own serve time.
  - Between serving the main and starting dessert, you're at the table, so nothing hands-on is planned in that gap. Unattended steps (a chill, an oven cool-down) keep running.
- **Making something ahead.** Some dishes hold the oven or a long wait for hours. A pavlova's meringue bakes for 90 minutes and then cools in the oven with the door shut. On the same day as a dinner that needs the oven, that turns a 1½-hour meal into 5½ hours. So **the lineup page asks** (Jacob's decision).
  - **When it asks:** when doing a dish's first part ahead would make the day's plan more than 30 minutes shorter. The first part is everything up to the step marked `holds` (see Recipe data), or the whole dish if it keeps.
  - **What it asks:** "The pavlova's meringue keeps the oven for about 3½ hours. Make it ahead, or do it all today?"
  - **Make it ahead:** that part becomes a separate **"Ahead of time"** run on the lineup page. You cook it through lineup cook mode like any other plan, planned on its own with no serve time. The day's plan then starts after that point.
  - **All today:** the planner plans everything together, however long it takes.
- Sub-recipes made earlier are covered by choosing "I have some".

## Building a lineup

On the site this feature is called **the lineup**: the recipes you're making together, in order. It isn't called a "meal" because it can just as well be one dessert made from three recipes (a pavlova with lemon curd and whipped cream) or a round of drinks (Jacob's decision). This spec still says "meal" for what you're cooking.

- **One lineup at a time,** saved on the device. Saved, named lineups are for later.
- **The lineup page** (`lineup.html`):
  - **Empty,** it opens with "Let's cook a meal" (or similar). It has a **search box** and a link to browse the recipes page.
  - **Search results** use the same card as the recipes page (title, description, time), plus a **"+"** that adds the recipe straight away. Tapping the card opens the recipe page to read more. Coming back restores your search and results.
  - **The dishes in it.** For each dish:
    - its course, which you can change, and a way to remove it;
    - under it, a choice for each linked sub-recipe: **Make it**, **I have some**, and **Leave it out** if the ingredient is optional. Where the ingredient links to more than one recipe ("Whipped cream": plain or blueberry), the choices name each one. Choosing to make a sub-recipe shows that sub-recipe's own choices too.
  - **Below the dishes:**
    - the make-ahead questions;
    - **Prep everything first** or **Fastest**, with how long each takes ("Prep first: about 1 hr 45 min · Fastest: about 1 hr 30 min"). It starts on your saved choice, and changing it here changes the saved choice for next time too. Until a settings page exists (see `docs/ideas.md`), this is where the choice lives;
    - "Takes about 1 hr 30 min" for the plan;
    - a warning if a dish can't be on time;
    - **Start cooking**, which starts the whole lineup.
- **There's one recipe page.** The lineup doesn't get its own version of it, so the two can't drift apart. The recipe page gets:
  - an **"Add to lineup"** button. Once the recipe is in, it reads **"In your lineup (3 dishes) · Cook the lineup"**, with a link to the lineup page. Adding shows a short confirmation ("Added. Your lineup has 3 dishes · View lineup");
  - **"Back to your lineup"** at the top when you came from the lineup page.
- **The recipe page's Start button always starts only that recipe,** even when the recipe is in your lineup (Jacob agreed). A button should do the same thing every time, and cooking one recipe on its own while a lineup is saved is normal, such as making the chimichurri the night before. It isn't a setting either, because a setting that changes what a button does makes it unpredictable. Each recipe keeps its own progress, so cooking it alone and cooking it in the lineup stay in step.
- **The recipes page:** cards don't get a "+". Browsing is for reading, and adding happens from the recipe page. A card for a recipe already in your lineup shows a small **"In your lineup"** marker (Jacob's decision).
- **The site header** shows a link to the lineup page while it has dishes ("Lineup · 3").
- If a recipe in the lineup already has progress (steps done on its own page), those steps count as done.

## Cooking a lineup

Lineup cook mode is cook mode's screen with a different source of steps.

- **The step to do now**, with a chip naming its recipe in the recipe's section colour. It shows the step's instruction, ingredients (from that recipe's `uses`), wait and cue, exactly as single-recipe cook mode does.
- **Done** marks the step done, both in the meal and in that recipe's own progress, then re-plans and shows the next step. If the step has a wait, its timer **starts by itself**, because the plan depends on it. You can cancel it from the strip.
- **Back** undoes the last Done. It un-marks the step, cancels the timer it started, and re-plans.
- **Gaps.** When the next step can't start yet, the screen says "Nothing to do for about 12 min", counting down like a timer, and shows the next step dimmed below. **"Start it now"** lets you go ahead early.
- **Running timers** stay pinned at the top, using the shared timers that already exist. "+2 min" on a ringing timer re-plans, and so does cancelling one early.
- **Up next** previews the next step in the plan, from whichever recipe, as cook mode does today.
- **No serve time and no clock.** The one figure shown is "Takes about…" on the lineup page before you start. The existing timer strip's "ready around 9:40 pm", for waits of an hour or more, stays as it is (see Calls).
- The done screen comes when every dish is done. It shows each dish's notes, collapsed under its name.
- **Reloading** keeps you in lineup cook mode. The lineup saves when it started and when each step was done, as real times, so re-planning stays right.

## Recipe data changes

New optional fields. Each one has a fallback, so a recipe without them still gets a rough plan. Like the step-ingredient links, the exact JSON shape is the builder's call, as long as a person can read and write it by hand and the checker validates it. The fields are proposed as:

| Field | On | Means | Fallback |
|---|---|---|---|
| `hands` | step | Minutes your hands are busy, e.g. `"10 min"` | The recipe's active or prep time, spread over the steps that don't give one. Otherwise 2 min a step |
| `watch` | step | `true` when the step's `wait` needs you there | The wait runs on its own |
| `oven` | step | The setting the step needs while it runs: `"200C"`, `"400F"`, `"broil"` or `"off"` | No oven |
| `preheat` | step | The step heats the oven to this setting in the background | The planner adds a heating step if a dish needs the oven |
| `burner`, `grill`, `microwave` | step | `true` when the step uses one | Not used |
| `prep` | step | Prep: knife work, measuring, getting things ready. `true` means it can be done ahead; `"just before"` means close to when it's needed | Not prep |
| `prepOnly` | step | An added prep step that brings out prep hidden in an ingredient line. It shows only when steps are in prep-first order | Shown in both orders |
| `holds` | step | After this step, the dish keeps as long as you like (a cooled meringue) | The whole dish is tied to serving if it's hot |
| `serve` | recipe | `"hot"`, `"soon"` or `"keeps"`, with `sits` for how long a hot or soon dish can wait once done, e.g. `"10 min"` | Components and baking keep; cocktails are soon (5 min); cooking dishes are hot (10 min) |
| `recipe` | ingredient | The slug of the recipe that makes it, or a list of slugs to choose from | No sub-recipe |

The recipe checker (`scripts/build-index.mjs`):

- **Fails the build** for:
  - a `hands` or `sits` it can't read as a time;
  - an oven setting it doesn't know;
  - `watch` on a step without a `wait`;
  - more than one `holds` in a recipe;
  - an ingredient `recipe` that doesn't exist;
  - sub-recipes that loop.
- **Warns** when a step's text mentions the oven, broiler, a skillet or pan, the grill or the microwave, but the step has no equipment field. That catches a missing field without guessing it.

The README's "Recipe fields" table and `recipes/_template.json` document the fields. On the recipe page, an ingredient with a `recipe` links to that recipe, which is useful outside meals too.

### Filling it in for the existing recipes

Claude adds the planning data and the sub-recipe links to all 40 recipes, and Jacob reviews them, as with the step-ingredient links. The hands-on minutes are Claude's estimates, from the recipes' active times and the step text. It's recipe data, so it lands in its own commit(s), separate from the code. The prototype's `library.js` already has the data for the nine recipes in Jacob's two meals.

**Prep hidden in ingredient lines.** Much of today's prep lives in ingredient lines ("garlic, minced", "jalapeño, seeded and diced" in the carne asada) or in "Before you start", so there is no step to mark. Each such recipe gets added prep steps ("Mince the garlic and dice the jalapeño"), marked `prep` and `prepOnly`, with `uses` links like any other step. The recipe as written is unchanged: its own steps keep their text and order, and the added steps only show in prep-first order. The added steps are new text, so they land in their own commit(s) for Jacob to review apart from the field data. The future recipe-import tool writes recipes the same way: the source's steps as written, plus prep marks and added prep steps.

### Prep first or as written

Every recipe can show its steps in two orders, on the recipe page and in single-recipe cook mode (Jacob's idea):

- **Prep first:** a prep stage, then the cooking.
  - The prep stage holds the recipe's `prep` steps that can be done ahead, plus its `prepOnly` steps, in the recipe's own order.
  - The cooking is the rest of the steps in their written order.
  - "Just before" prep stays where it was written, because doing it early would hurt the dish.
  - In cook mode, the prep stage has its own heading ("Prep"), so you can see where the cooking starts.
- **As written:** the source's own steps in its own order, with the `prepOnly` steps left out. This is what the site shows today.

Rules:

- The choice is the same saved preference as the lineup page's "Prep everything first" (one setting, Claude's call), and it defaults to prep first. A recipe page has a toggle to switch, and switching there changes the saved preference. A recipe with no prep marks looks the same both ways, so it shows no toggle.
- **Progress follows the step, not the display.** Saved progress uses each step's place in the recipe file, as it does today, so switching order never ticks or un-ticks the wrong step. "Where you are" is the first step not done in the order being shown. A `prepOnly` step done in prep-first order doesn't count in as-written order.
- **Only prep that's safe to do before any cooking is marked `prep`.** A step that depends on an earlier cooking step ("slice the rested steak") isn't prep. When it adds the marks, Claude lists any step where moving it could be wrong, for Jacob to check.
- In a meal, the planner always uses the prep marks, whichever order a single recipe shows. "Prep everything first" or "Fastest" decides how.

## Saving

- Each recipe keeps its own progress in `sss:progress:<slug>`, as now. A Done in lineup cook mode writes there too.
- The lineup saves in `localStorage` under `sss:lineup`. It holds:
  - the dishes and their courses;
  - the sub-recipe and make-ahead choices;
  - when cooking started;
  - each finished step with the real time it was done.

  The exact shape is the builder's call.
- Timers stay in `sss:timers`. Timers started by lineup cook mode are ordinary timers there, so a recipe's own cook mode shows them too.

## Accessibility

- Everything works by keyboard and screen reader.
- The current step is exposed the way cook mode already does it (`aria-current="step"`), and each step change is announced, including the recipe it belongs to.
- The "Nothing to do" countdown doesn't announce every second. It announces when the gap starts and when it ends.
- `tests/e2e/accessibility.spec.mjs` gets these added to `PAGES`, in light and dark mode:
  - the lineup page, with a sub-recipe choice and a make-ahead question showing;
  - lineup cook mode on a step;
  - lineup cook mode during a gap;
  - the lineup's done screen;
  - a recipe page and single-recipe cook mode in prep-first order, with the prep stage showing.

  Colour problems the scan finds are shown to Jacob before any colour is changed.

## Constraints

- Plain HTML, CSS and JavaScript: no frameworks, no build step, no new runtime dependencies (README).
- The Content-Security-Policy forbids inline scripts and styles. Set styles through the DOM, as `recipe.js` does.
- Tests come first, with the `mattpocock-skills:tdd` skill, per `.claude/rules/testing.md`:
  - The planner is pure, so it gets unit tests on Node's built-in runner (`tests/unit/planner.test.mjs`). They cover Jacob's two meals as cases: the broil waiting for the potatoes, the curd and syrup fitting into the meringue's bake, a slow step moving the meal later, the gap between courses, the make-ahead question, prep before heat, and prep-first against fastest.
  - Browser tests use fixture recipes in `tests/e2e/fixtures.mjs`, with planning data added there, never the real recipes.
  - Checker tests go through `tests/helpers/build-index.mjs`.
  - `npm test` passes before the work is called done.
- The service worker is network-first, so new pages and files need no special handling.

## Checking it as it's built

Jacob checks it at four points, each before the next stage starts:

1. **Layout mockups, before any site code.** These are throwaway pages showing a few different layouts of:
   - the lineup page: empty, searching with "+", with dishes and their choices, and ready to start;
   - the recipe page's additions;
   - lineup cook mode: a step, a gap, timers running.

   They use the real recipes and the site's look, but nothing works behind them. Jacob picks a layout (or mixes parts of them) on his phone, and the chosen layout goes into this spec. The planner's behaviour was already checked in the logic prototype.
2. **The recipe data,** as its own commits: the planning data, then the added prep steps. A recipe's prep-first order is easier to judge than JSON, so it can be shown as a page.
3. **The built feature, before merging.** Claude clicks through it on the branch and shares screenshots at phone and desktop width, in light and dark mode. Jacob can also run it himself (`python3 -m http.server 8000` in the repo, as in `.claude/launch.json`). What he finds gets fixed before merging.
4. **A real lineup in the kitchen, after merging.** Cooking a real dinner on the phone is the one test nothing else replaces: real timing, messy hands. What felt wrong becomes fixes, and better time estimates.

## Left to the builder

- The exact JSON shape of the new fields, within the requirements above.
- Whether the lineup page is its own page (`lineup.html`) or a view of an existing one, and how lineup cook mode is reached and left. The phone's back gesture must return to the lineup page, as it returns to the recipe page today.
- Where "Add to lineup", "Back to your lineup" and the header link go, within the Field Guide style. The layout is settled with Jacob from mockups first (see "Checking it as it's built").
- How the planner is made fast enough on a phone if trying serve times one minute at a time is slow. The prototype's five meals each plan instantly.

## Calls Claude made (for Jacob to check)

- One lineup at a time, not saved, named lineups.
- Baking dishes start as Dessert, everything else as Main.
- Nothing hands-on is planned between serving the main and dessert.
- The make-ahead question appears when doing it ahead would make the day's plan more than 30 minutes shorter.
- A timer starts by itself when you finish a step with a wait, in lineup cook mode only.
- No "this took longer" button. Real elapsed time does that job.
- "Start it now" lets you go ahead during a gap.
- The planner adds a heating step when a dish needs the oven and its recipe doesn't heat it, and skips it when the oven is already at that setting.
- Temperatures within 15°F count as the same setting.
- Planning uses the middle of a range, and timers keep the short end.
- Sub-recipes default to "Make it".
- An ingredient with a sub-recipe links to it on the recipe page, outside meals too.
- The timer strip's "ready around 9:40 pm" for long waits stays, even in lineup cook mode, because it's a timer and not a schedule. Say if it should go.
- No guessing equipment from step text. The checker warns instead.
- "Prep everything first" is the default. Only heating the oven can start during prep.
- The lineup page remembers your prep choice for next time, until a settings page takes it over.
- One saved prep preference covers both the meal planner and how single recipes are ordered.
- A recipe with no prep marks shows no order toggle.
- Added prep steps show only in prep-first order. As written, prep stays in the ingredient lines, as today.

## Later

- Saved, named lineups ("Cookout").
- A settings page that holds the prep choice and other preferences (`docs/ideas.md`).
- Learning your pace: comparing how long your steps, prep especially, really take with the estimates, and planning with your speed.
- Choosing your own order step by step, or "do this first".
- A combined shopping list for the meal.
- Two cooks.
- Oven rack space, and more than one oven.
- Scaling a sub-recipe to the amount the parent needs.
- Listing a recipe under more than one section (blueberry syrup in Cocktails and Baking). That's a small change of its own.
