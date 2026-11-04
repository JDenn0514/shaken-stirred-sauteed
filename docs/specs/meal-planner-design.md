# Lineup (meal planner): design

2026-11-03 · Jacob Dennen, with Claude

## Why

Cook mode handles one recipe at a time. A real dinner is several: a ribeye, parmesan asparagus, applesauce and hasselback potatoes. The hard part isn't any single recipe, it's the order. What goes first? What fits into the potatoes' 40 minutes in the oven? When does the steak go on so everything is hot together? The lineup works that out and walks you through it in cook mode, one step at a time, across all the recipes.

It covers recipes inside recipes too. Blueberry whipped cream needs blueberry syrup, and a pavlova can come with lemon curd and that cream. The curd and syrup can be made while the meringue bakes, rather than the day before.

This is the "Later: cooking a whole meal" project from `docs/specs/cook-mode-design.md`.

## Names

- **On the site the feature is called your menu** (Jacob's decision, 2026-11-04, replacing "lineup" everywhere on the site): the recipes you're making together. It isn't called a meal, because it can as easily be one dessert made from three recipes, or a round of drinks. The page is `menu.html`, and the wording is "Your menu", "Menu · 7 →", "+ Add to menu", "✓ On your menu ▾" and the "On your menu" tape.
  - **Inside the code it's still the lineup:** `planLineup`, the `sss:lineup` key and this spec's own words for it. Those aren't seen, and renaming them would only churn merged code. This spec says "lineup" for the feature and "meal" for what you're making; where it quotes words shown on the site, they're the menu wording above.
- **A nested recipe** is a required ingredient that has its own recipe card, such as the garlic paste in hasselback potatoes or the blueberry syrup in blueberry whipped cream. It's part of its dish.
- **A connected recipe** is an optional ingredient that has its own recipe card, such as the lemon curd on a pavlova. It's a dish of its own that goes with another (Jacob's distinction).

## Goals

- Pick several recipes as one lineup, and cook them in one cook-mode session.
- The planner puts every step of every recipe in one order for **one cook**:
  - each dish's waits are filled with another dish's hands-on steps;
  - dishes never need the oven at two settings at once;
  - you're never asked to do two hands-on things at once.
- Hot dishes are ready together at serving. Things that keep (applesauce, a chilled curd) are made whenever there's room.
- **Order and timers only.** While cooking you see the step to do now, any timers running, and a wait step when nothing needs you. No clock times (Jacob's decision: a schedule makes him stressed).
- The plan re-plans itself from where you are each time you move on, so running long never means a broken plan.
- **Nested recipes come with their dish,** and you say whether you're making them or already made them. **Connected recipes** are dishes you add yourself. Either way the planner has them ready before the step that uses them.
- **Prep comes before heat.** Chopping and measuring for a dish is done before that dish's first time-sensitive step, and by default all the meal's prep is done first. Prep is where cooks' speeds vary most, so getting it out of the way keeps the time-sensitive steps on time (Jacob's idea).

## Non-goals

- Two or more cooks. Always one pair of hands.
- Choosing your own order step by step. The planner decides; the order it picks was checked against Jacob's meals in the prototype. (See Later.)
- Scaling a sub-recipe to the amount needed. You make the whole recipe.
- Guessing a step's equipment or timing from its wording. Planning data is written into the recipes, the same rule cook mode follows for ingredients.
- Oven rack space. Two dishes at the same setting share the oven, however full it gets.
- Suggestions of what goes with a dish. (See Later.)
- No change to how single-recipe cook mode works, apart from the step order choice (see "Prep first or as written").

## Anti-goals (failures even if it technically works)

- **A hot dish that's ready long before serving, or one that's late without saying so.** If no order gets everything out on time, the lineup page says which dish will be late, and by about how much.
- **An oven clash.** For example, telling you to broil the asparagus while the potatoes are still baking at 200°C.
- **Two hands-on things at once,** such as basting the steak while the asparagus needs you at the broiler.
- **A clock time in lineup cook mode.**
- **A sub-recipe that isn't ready when its step comes,** such as syrup that's still warm when the cream needs it.
- **Being moved on without asking.** A timer ringing never changes the step you're on.
- **Losing a recipe's own progress.** Steps done in the lineup show as done on that recipe's own page, and the other way round.

## How the planner works

The prototype on branch `prototype/meal-planner` (README there, with the published page) ran this on Jacob's two example meals, and he agreed with the orders it chose. The rules:

1. **Work back from serving.** Each dish's last step finishes by serve time. A nested or connected recipe finishes before the step that uses it. Working backwards gives each step a latest start.
2. **One cook, most urgent first.** Move forward through time. Whenever your hands are free, start the step whose latest start is soonest, among the steps that can start now. A step can start now when:
   - the step before it in its recipe is done;
   - the recipes it uses are ready;
   - its equipment is free.
3. **Waits run on their own,** unless the step marks them as needing you (searing, broiling, whisking a curd). While one runs, your hands go to the next most urgent step. That can be a later step of the same dish when the recipe marks it `during` (frying the pork while the congee simmers); the step after those waits for both.
4. **Hot dishes are held back.** A hot dish doesn't start so early that it would sit longer than it can once done, and the same goes for each later step that starts cooking it (in the oven, on a burner): the asparagus isn't roasted early only to wait for the broiler. Dishes that keep have no such limit and fill the gaps.
5. **Food on the heat comes first.** When something on a burner is about to be ready (the curd's juice coming to a simmer), nothing from another dish starts that would run past that moment, and its next step goes first once it's ready. The same goes for a pot with no timer whose next step is off the stove (the syrup kept at a simmer until its sugar dissolves, then strained), and for food in the oven whose next step takes it out (`oven: false`). Between two pots it works both ways: one pot's next step doesn't run past the other being ready, and when both are ready at once the shorter step goes first.
6. **Equipment:** one oven, four burners, one microwave, one grill.
   - Dishes can share the oven only at the same setting. Temperatures within 15°F (about 10°C) count as the same, so 200°C and 400°F share. They share only if at most one of them needs the oven at another setting later: two that both change it (lime bars going down to 300°F, a pavlova down to 200°F and then off) would each wait for the other, so one waits its turn instead.
   - A dish holds the oven from its first oven step to its last, or, when a later step takes it out (`oven: false`), until that step is done. Nothing switches to broil while the potatoes are still in.
   - Heating the oven runs in the background while you carry on.
   - If a dish needs the oven at a setting and its recipe has no step heating it, the planner adds "Heat the oven to 200°C / 400°F" at the start of that dish's cooking, after its prep, marked as added for this meal. If the oven is already at that setting, the added step is skipped.
   - Turning the oven down or off needs no heating time, and leaves it at that setting: a dish that needs it hotter afterwards heats it again.
7. **Heating time counts.** Heating takes 15 minutes, or 3 minutes for the broiler. When the step straight after a heating step needs the oven hot, the heating time counts in the backward pass.
8. **Fixing a late dish.** If a dish comes out late, the planner plans it to finish a little earlier, and does the same for any dish whose oven use held it up. It never moves a dish earlier than it can sit once done. If no order gets every hot dish there within its sitting time (three dishes that each must be eaten within 5 minutes, and one cook), it loosens the sitting times a little at a time (5 minutes more, then 10, 20, 40, 80) until one does, so dishes sit only as much longer as they must and the plan stays whole.
9. **The earliest serve time wins.** The planner tries serve times from the shortest possible upward and keeps the first one that works.
10. **Re-planning.** Each time you move on, the planner runs again from that moment. Finished steps and running waits stay as they happened, using real elapsed time, so a slow step moves the rest of the meal later. There's no "this took longer" button, because the planner can see it.
11. **Ranges plan from the middle.** "7 to 8 min" plans as 7.5. Timers still start at the short end, as in cook mode, so you check early.
12. **Prep before heat, always.** A dish's prep steps (marked `prep`, see Recipe data) come before its first step that isn't prep. For a dish that keeps part-way (`holds`), each part has its own prep: the pavlova's fruit is prepped on the day, not with the meringue. Prep marked "just before" (cutting apples that would brown, salting a steak) is done as late as it can be, but still before the step that needs it.
13. **"Prep everything first" or "Fastest".** These are the two ways to plan a meal.
    - **Prep everything first** (the default, Jacob's decision): no step that isn't prep starts until all the meal's ahead-of-time prep is done. Only heating the oven, which runs in the background, can start during prep, and so can a nested or connected recipe that a prep step uses (the garlic paste for the potatoes' garlic butter), all of it.
    - **Fastest:** prep fills waits like any other step, as in the prototype.

    Prep-first makes the meal longer, since the potatoes go in the oven later. In return, nothing time-sensitive starts until the knife work is behind you. The lineup page shows how long each way takes.
14. **A ringing timer changes the plan, not your step.** When another dish's wait ends (the potatoes' bake), its follow-up step ("baste the potatoes") becomes urgent, so it becomes your next step after the one you're on.
15. **The plan says what it doesn't know** (`unknown`), so the lineup page can ask the cook before they start and save the answer to the recipe. Recipes from other people will often be missing these, and a plan built on them is wrong without saying so.
    - **A step that waits with no time** (bakes, rises, chills, cools, rests, marinates; goes in the oven; is left somewhere warm) plans as if it took none, so the plan comes out short. Any time in the step's text comes as a suggested answer. Not counted: prep, work done while something else waits, warnings ("don't let them soak"), storage ("refrigerate up to 24 hours"), and stove steps cooked "until fragrant", whose time is already the step's hands-on time.
    - **A dish with no serving time** is planned as hot, sitting up to 10 minutes (Jacob's decision). Components, baking and cocktails have safe defaults, so they aren't reported.
    - The recipe intake uses the same check to know what to ask: see `intake-lineup-needs.md`.
    - Tested on the recipes as code alone restructures them (`tools/lineup-test/code-only.mjs` on the experiment branch): the steps reported hold about 90% of the missing waiting time, and nothing is reported on the reviewed recipes.

The planner is a pure module (`assets/planner.mjs`) with no page code.

### What the planner gives the page

`planLineup(lineup, recipes, progress)` returns everything the lineup page and lineup cook mode need that only the planner knows. Times are minutes from the start; there are no clock times (Jacob's decision).

**The lineup it's given:** `{ dishes: [{ slug, made, course }], ahead: { slug: true/false }, prepFirst }`. `made` lists a dish's nested recipes marked "Already made" (the page starts these from the ingredient's `alreadyMade`). `ahead` is the cook's answer to the make-ahead offer.

**Progress, for re-planning as you cook:** `{ now, done: [{ slug, step, at, waitUntil }], current }`. The page sends this each time you move on; the plan comes back with finished steps marked `done`.

| Field | What it is | What the page does with it |
|---|---|---|
| `steps` | Every step in order: `slug`, `step` (its index in the recipe, or `"heat"` for an added heating step), `text`, `at`. Also `done`, `current`, `skipped` (oven already hot), `added` (not on the recipe card). | The list, one step at a time in cook mode. |
| `steps[].hands`, `.wait`, `.watch` | Hands-on minutes, the wait after them (a range planned from its middle) and whether the wait needs you there. | Durations; "stay with it" on watched waits. |
| `steps[].timer` | On a step with a wait: `from` (it starts), `short` (the short end of the range, where the timer starts, so you check early) and `ends`. | The timer, pinned at the top while it runs. |
| `steps[].followUp` | On a step with a wait: the index of the dish's next step. | **What to do when the timer rings** ("Pull the pan out", "Stir it all around again"). The second test's testers lost these when they sat on the step that started the timer. |
| `steps[].idle` | How long nothing needs you before this step. | Say "Nothing needs you for 8 min" only when this is over a minute or two, and never on a hands-on stretch. |
| `minutes`, `courses` | When it's served, and each course's time (dessert follows the main). | The total, and a closing step per course. |
| `serving` | Each course: `at`, its `dishes`, and `sitting`: for each dish, how long it waits between ready and served (`waits`), how long it can (`limit`, `null` if it keeps) and by how much it's over (`over`). | **One closing "plate everything" step** per course, naming the dishes, so no dish's own "serve hot" ends the meal early. When `over` is more than a few minutes, tell the cook before they start ("the potatoes will be ready about an hour early: one oven, two temperatures"). |
| `ready` | When each dish is done. | |
| `upNow`, `wait` | The step to do now, and how long until it when nothing needs you yet. | Cook mode's current step. |
| `makeAhead`, `aheadOfTime` | Dishes worth making ahead (each with the minutes it `saves` and whether it's set `ahead`), and the made-ahead plan, with the same step fields. | The make-ahead offer, and the day-before plan. |
| `unknown` | What the plan doesn't know (rule 15): a step that waits with no time (`suggest` is a time from its text), and a dish planned on an assumed serving time (`assumed`). | Ask the cook before they start; save the answer to the recipe and re-plan. |

**The page's own work, from the recipe data:** quantities on each step (from its `uses` and the ingredients), the gather list (each dish's "Before you start"), a shopping list, and how far behind you are (keep the first plan's `minutes` and compare). The planner doesn't do these.

**Left to the design:** whether to show landmarks in the list (the second test found phase headings no help where they were; testers asked for them at the busy hand-offs and at serving), how the unknowns are asked, and the wording of the warnings.

## Nested and connected recipes

One kind of link does all of this: **an ingredient can point to the recipe that makes it.** Whether the ingredient is optional decides how it behaves (Jacob's rule).

| | Nested: a required ingredient | Connected: an optional ingredient |
|---|---|---|
| Example | Garlic paste in hasselback potatoes; blueberry syrup in blueberry whipped cream | Lemon curd and whipped cream on a pavlova |
| Joins the lineup | Automatically, with its dish | Only when you add it, like any other recipe |
| Shown | Indented under its dish | At the same level as the other dishes |
| Make it / Already made | Yes. It's needed either way, so you say which | No. In the lineup means you're making it; not in it means you aren't, or you have some already |

- **The planner connects them by itself.** A pavlova's last step uses its "Lemon curd" ingredient, so a lemon curd recipe in the same lineup is planned to be ready before that step. If it isn't in the lineup, the step still says "pile on the cream, curd and berries", which covers curd you already have. Nothing asks "is this for the pavlova?".
- **If two dishes in a lineup both use it,** a connected recipe is made once and is ready before the first step that needs it.
- **A nested recipe that's also in the lineup as a dish of its own** (homemade acini di pepe added beside the wedding soup) is made once, too, and can be made ahead like any dish; made ahead, it isn't made again on the day for the dish that uses it.
- **Already made** keeps a nested recipe listed under its dish, because it still goes in: the parent's step that uses it is unchanged. Only that recipe's own steps are left out.
- **Nesting goes deeper:** blueberry syrup sits under blueberry whipped cream, which may itself be connected to a pavlova. A recipe whose required ingredients are its parts (meringue, curd, cream, fruit) shows all of them nested under it.
- **A component can be a dish on its own.** Lemon curd can go in a lineup with nothing to go into.
- **A required ingredient that links to more than one recipe** ("whipped cream": plain or blueberry) gets a small choice of which one, on its nested line. This should be rare.
- On the recipe page, an ingredient with a linked recipe links to it, which is useful outside lineups too. That's how you find connected recipes: the pavlova's "Lemon curd (optional)" links to the curd's own page, with its own "Add to lineup".

## Courses and making things ahead

- **Courses.** Each dish in a lineup is either **Main** or **Dessert**. Baking dishes start as Dessert and everything else as Main, and you can change either.
  - Dessert is served 45 minutes after the main (Jacob agreed). The planner plans it with its own serve time.
  - Between serving the main and dessert, you're at the table. The only hands-on steps planned in that gap are a dessert's finishing touches: steps of a dessert dish that can't be made ahead, such as whipping cream that can only sit 15 minutes. Anything that keeps is done before the main is served. Unattended steps (a chill, an oven cool-down) keep running.
  - A lineup that's all one course (just a pavlova and its parts) has only that course.
  - Nested recipes follow their dish's course.
- **Making something ahead.** Some dishes hold the oven or a long wait for hours. A pavlova's meringue bakes for 90 minutes and then cools in the oven with the door shut. On the same day as a dinner that needs the oven, that turns a 1½-hour meal into 5½ hours. So **the lineup page asks** (Jacob's decision).
  - **When it asks:** when doing a dish's first part ahead would make the day's plan more than 30 minutes shorter. The first part is everything up to the step marked `holds` (see Recipe data), or the whole dish if it keeps. A dish that keeps entirely isn't offered when it's the whole lineup, since nothing would be left for the day.
  - **What it asks:** a line under the dish: "The meringue · made ahead (it holds the oven 3½ hr) · Change". It starts on whichever choice makes the day shorter.
  - **Made ahead:** that part becomes a separate **"Ahead of time"** run on the lineup page. You cook it through lineup cook mode like any other plan, planned on its own with no serve time. The day's plan then starts after that point.
  - **All today:** the planner plans everything together, however long it takes.

## The lineup page

The layout was chosen from four rounds of mockups (branch `prototype/meal-planner`, `lineup-prototype-v4.html` is the last). It's the site's Field Guide style throughout.

- **One lineup at a time,** saved on the device. Saved, named lineups are for later.
It's its own page, `menu.html` (round 5).

- **Empty:**
  - "Your menu" as a small heading, then **"Let's make something"** (Jacob's wording);
  - a line saying it's for a whole dinner, or one dessert made from a few recipes;
  - a search box, and "Or browse all recipes →";
  - a short numbered how-to: add recipes, make your choices, start cooking.
- **Searching:**
  - **"← Back to your menu · 7"** at the top;
  - the search box, then the recipes page's section tabs (All, Baking, Cooking, Cocktails) to filter;
  - results as compact rows (the recipe's drawing, title, and one line of description), each with **"+ Add"**, or **"✓ Added"** once it's in. Tapping a row opens the recipe page to read more. Coming back restores your search and results.
- **With dishes: a menu card.** A bordered card with tape, headed "Your menu", with "← Recipes" above it:
  - courses as italic headings ("Main", "Dessert · 45 min later");
  - each dish as a line, with its title in its section's colour, a dotted leader and its time on the right. **Tapping a dish's name opens a small menu:** Open the recipe, Move to Dessert (or Main), Remove from menu (Jacob's pick, round 5);
  - nested recipes indented under their dish, each with **Make it | Already made**;
  - the make-ahead line under a dish that has one;
  - "+ Add a dish", which opens search;
  - **Prep everything first** as a switch, with how long the other way would take ("Fastest would be 1 hr 30 min"). It starts on your saved choice, and changing it here changes the saved choice for next time too. Until a settings page exists (see `docs/ideas.md`), this is where the choice lives;
  - a warning in the card when a dish will sit more than 5 minutes longer than it can (`serving[].sitting[].over`): "The potatoes will be ready about 25 min early. One oven, two temperatures…".

  Below the card, a full-width **"Start cooking · about 1 hr 45 min"** starts the whole lineup.
- **Made ahead** (round 5): when a dish's first part is set to be made ahead, an **"Ahead of time"** box sits above the card, naming the part and its time, with its own start button ("Start the meringue · about 4 hr 23 min"). It's cooked through lineup cook mode like the day's plan. Once done, the box says "✓ The meringue is made". The day's Start cooking works either way, since the cook may have made it some other way.
- **What the recipes don't say** (`unknown`, round 5): a box above Start cooking, "Two things the recipes don't say", asks for each wait with no time (pre-filled from `suggest`) and each assumed serving time (Hot · Soon · Keeps). Start cooking still works, planned on the guesses. **Answers are saved per recipe on this device** (`sss:answers:<slug>`) and given to the planner as if the recipe said them; the page can't change the recipe files. None of the 40 reviewed recipes has any; recipes from the intake may.
- **No order works:** if `planLineup` throws, the card stays and Start cooking is replaced by "These can't be planned together", with a line suggesting removing a dish or switching off Prep everything first.
- **While cooking,** leaving cook mode with ✕ comes back here, and Start cooking reads "Back to cooking".

## The recipe page and the recipes page

- **There's one recipe page.** The lineup doesn't get its own version of it, so the two can't drift apart.
- **The header doesn't change.** The way to the lineup moves out of the header, which is cramped on a phone, into the row with the back link (Jacob's idea). **"← Cooking"** (the section) sits on the left, and **"Menu · 7 →"** on the right.
  - The top of the page is the same whether or not the recipe is on your menu (Jacob's decision).
  - The menu link shows even when the menu is empty, reading "Menu →", so the page always looks the same.
- **Next to Start cooking:** **"+ Add to menu"**, in the section's colour. Once the recipe is in, it reads **"✓ On your menu ▾"**, with nothing added under it. Tapping it opens a small menu: **Remove from menu** and **Go to your menu**.
- **The Start button always starts only that recipe,** even when the recipe is in your lineup (Jacob agreed). A button should do the same thing every time, and cooking one recipe on its own while a lineup is saved is normal, such as making the chimichurri the night before. It isn't a setting either, because a setting that changes what a button does makes it unpredictable. Each recipe keeps its own progress, so cooking it alone and cooking it in the lineup stay in step.
- **The recipes page:**
  - cards don't get a "+". Browsing is for reading, and adding happens from the recipe page;
  - a card for a recipe on your menu gets a strip of lime tape across its corner reading **"On your menu"** (Jacob's pick);
  - the "Menu · 7 →" link sits above the search box, on the right.
- **The welcome page:** under "Browse all recipes →", a second link, "Your menu · 7 →", or "Plan a menu →" when it's empty (round 5, Claude's call).
- If a recipe in the lineup already has progress (steps done on its own page), those steps count as done.

## Cooking a lineup

Lineup cook mode is today's cook screen, kept focused, with a different source of steps (Jacob's pick). The ✕ leaves it, to the menu page. It's `menu.html#cook`, as single-recipe cook mode is `#cook` on the recipe page, so the back gesture and reloading behave the same.

- **The top:** a chip naming the step's recipe in its section colour, and **"Step 9 of 24"** across the whole lineup, with one progress bar for the whole lineup.
- **The step** shows the instruction, ingredients (from that recipe's `uses`), wait and cue, exactly as single-recipe cook mode does.
- **Next step** (Jacob's wording, not "Done") marks the step done, both in the lineup and in that recipe's own progress, then re-plans and shows the next step. On the last step it reads **Finish**.
  - When the step has a wait, such as "brush the potatoes and bake 40 minutes", its timer **starts when you press Next step**. You've just put them in, and the plan depends on it. You can cancel it from the strip.
- **Back** undoes the last Next step. It un-marks the step, cancels any timer it started, and re-plans.
- **Up next** at the bottom previews the next step in the plan, from whichever recipe, as cook mode does today.
- **Running timers** stay pinned at the top, using the shared timers that already exist. A strip names its dish and wait ("Potatoes, bake").
- **No serve time and no clock.** The one time shown is "about 1 hr 45 min" on the lineup page before you start. The existing timer strip's "ready around 9:40 pm", for waits of an hour or more, stays as it is (see Calls).
- **The done screen** comes when every dish is done. It shows each dish's notes, collapsed under its name.

### Decided in round 5 (2026-11-04)

The mockups are published at https://claude.ai/artifact/3fMsW5kxrpF8DNhfpUH18h (private to Jacob). From the presentation tests and Jacob's picks:

- **Gather list first.** Lineup cook mode opens on a "Before you start" screen listing every dish's `beforeYouStart` items under its name, so the thermometer is out before it's needed.
- **Quantities on every step,** from `uses`, as single-recipe cook mode shows them. A nested recipe used in its parent shows the parent's amount ("1 tsp Garlic paste"), not the whole batch.
- **Which end of a range.** A wait with a range says "The timer starts when you press Next step, set to 8 min so you check early."
- **A running timer names what comes after it:** "Hasselback Potatoes · then pull the tray out and baste". When it rings: "Time's up. Next: Pull the tray out and baste with the reserved garlic butter." (from `followUp`). Up next shows that step, marked "due now".
- **"Nothing needs you" only when it's true:** the wait screen shows only when `upNow` is more than 2 minutes away and the step's `idle` says nothing needs you.
- **Running behind** (Jacob's pick): when the re-planned meal ends 5 minutes or more after the first plan's `minutes`, a quiet line under the step count: "About 9 min behind. The rest of the plan has moved to fit." Nothing to press.
- **Landmarks** (Jacob's pick): a heads-up on the step before a busy stretch, "Busy stretch next: … 11 steps, about 25 min, one straight after another", where the steps after it follow with no idle time between them for 15 minutes or more. And the closing step.
- **Plating up.** Each course ends with one closing step, "Plate up the main", listing its dishes. Inside a lineup, a dish's last step drops a closing "and serve (hot)" clause, so no dish goes out alone. This is display only: the recipe's own page keeps its words.
- **Reloading** keeps you in lineup cook mode. The lineup saves when it started and when each step was done, as real times, so re-planning stays right.

### Waits

When nothing needs you yet, the next screen is a wait step, laid out like any other step (Jacob's design):

- **"Wait about 12 minutes before the next step."** It sits under a ring showing the time, with a line saying what's going on ("The potatoes and applesauce are going. Nothing needs you yet.").
- **Start 12 min timer** starts it. The ring then empties as the time runs out, with a Pause button. Without reduced motion the ring drains smoothly; with it, only the numbers change.
- **Up next stays at the bottom,** in the same place as on every step, so the next step reads as next and not as something to do now (Jacob's point: otherwise people do the step straight away and then wait).
- **Next step moves on early** at any time.
- **When the time is up,** the ring and the alarm go off until you press **Stop**.
  - **Stop only stops the sound** (Jacob's decision). The screen then says "Time's up. Go on to the next step when you're ready."
  - **Next step is still the one way to move on,** as on every screen, so silencing an alarm with messy hands never loses your place.

### When another dish's timer rings

- **It doesn't interrupt the step you're on.** Its strip at the top rings, in the section colour, with its own **Stop** and its follow-up: "Potatoes, bake · Time's up: then baste them".
- **The plan makes the follow-up your next step** (planner rule 14), and Up next changes to show it.
- **Two timers at once** stack, each with its own Stop, and one sound plays until all are stopped.
- "+2 min" on a ringing timer, or cancelling one early, re-plans.

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
| `during` | step | `true` when the step runs while an earlier step's wait does (the pork while the congee simmers) | Steps run one after another |
| `holds` | step | After this step, the dish keeps as long as you like (a cooled meringue) | The whole dish is tied to serving if it's hot |
| `serve` | recipe | `"hot"`, `"soon"` or `"keeps"`, with `sits` for how long a hot or soon dish can wait once done, e.g. `"10 min"` | Components and baking keep; cocktails are soon (5 min); cooking dishes are hot (10 min) |
| `recipe` | ingredient | The slug of the recipe that makes it. A list of slugs when there's a choice (rare) | No linked recipe |
| `optional` | ingredient | `true` when the dish works without it. With `recipe`, it makes the link connected instead of nested | Required |

The pavlova's curd is already written as optional in its amount; it and the whipped cream get `optional: true`.

The recipe checker (`scripts/build-index.mjs`):

- **Fails the build** for:
  - a `hands` or `sits` it can't read as a time;
  - an oven setting it doesn't know;
  - `watch` on a step without a `wait`;
  - more than one `holds` in a recipe;
  - an ingredient `recipe` that doesn't exist;
  - recipe links that loop.
- **Warns** when:
  - a step's text mentions the oven, broiler, a skillet or pan, the grill or the microwave, but the step has no equipment field. That catches a missing field without guessing it;
  - an ingredient's amount or note says "optional" but it isn't marked `optional`.

The README's "Recipe fields" table and `recipes/_template.json` document the fields.

### Filling it in for the existing recipes

Claude adds the planning data and the recipe links to all 40 recipes, and Jacob reviews them, as with the step-ingredient links. The hands-on minutes are Claude's estimates, from the recipes' active times and the step text. It's recipe data, so it lands in its own commit(s), separate from the code. The prototype's `library.js` already has the data for the nine recipes in Jacob's two meals.

**Prep hidden in ingredient lines.** Much of today's prep lives in ingredient lines ("garlic, minced", "jalapeño, seeded and diced" in the carne asada) or in "Before you start", so there is no step to mark.

- **Each such recipe gets added prep steps** ("Mince the garlic and dice the jalapeño"), marked `prep` and `prepOnly`, with `uses` links like any other step.
- **The recipe as written is unchanged.** Its own steps keep their text and order, and the added steps only show in prep-first order.
- **They're reviewed separately.** The added steps are new text, so they land in their own commit(s) for Jacob to review apart from the field data.
- **The future recipe-import tool** writes recipes the same way: the source's steps as written, plus prep marks and added prep steps.

### Prep first or as written

Every recipe can show its steps in two orders, on the recipe page and in single-recipe cook mode (Jacob's idea):

- **Prep first:** a prep stage, then the cooking.
  - The prep stage holds the recipe's `prep` steps that can be done ahead, plus its `prepOnly` steps, in the recipe's own order.
  - The cooking is the rest of the steps in their written order.
  - "Just before" prep stays where it was written, because doing it early would hurt the dish.
  - In cook mode, the prep stage has its own heading ("Prep"), so you can see where the cooking starts.
- **As written:** the source's own steps in its own order, with the `prepOnly` steps left out. This is what the site shows today.

Rules:

- **One saved preference** covers this and the lineup page's "Prep everything first" (Claude's call). It defaults to prep first. A recipe page has a toggle to switch, and switching there changes the saved preference. A recipe with no prep marks looks the same both ways, so it shows no toggle.
- **Progress follows the step, not the display.** Saved progress uses each step's place in the recipe file, as it does today, so switching order never ticks or un-ticks the wrong step.
  - "Where you are" is the first step not done, in the order being shown.
  - A `prepOnly` step done in prep-first order doesn't count in as-written order.
- **Only prep that's safe to do before any cooking is marked `prep`.** A step that depends on an earlier cooking step ("slice the rested steak") isn't prep. When it adds the marks, Claude lists any step where moving it could be wrong, for Jacob to check.
- In a lineup, the planner always uses the prep marks, whichever order a single recipe shows. "Prep everything first" or "Fastest" decides how.

## Saving

- Each recipe keeps its own progress in `sss:progress:<slug>`, as now. Next step in lineup cook mode writes there too.
- The lineup saves in `localStorage` under `sss:lineup`. It holds:
  - the dishes and their courses;
  - the Make it / Already made and make-ahead choices;
  - when cooking started;
  - each finished step, with the real time it was done.

  The exact shape is the builder's call.
- The prep preference is saved on its own, so a settings page can take it over later.
- Timers stay in `sss:timers`. Timers started by lineup cook mode are ordinary timers there, so a recipe's own cook mode shows them too.

## Accessibility

- Everything works by keyboard and screen reader.
- The current step is exposed the way cook mode already does it (`aria-current="step"`). Each step change is announced, including the recipe it belongs to.
- The wait step's countdown doesn't announce every second. It announces when the timer starts, when time is up, and when it's stopped.
- Nested recipes are exposed as nested lists, so their place under their dish isn't only shown by indenting.
- `tests/e2e/accessibility.spec.mjs` gets these added to `PAGES`, in light and dark mode:
  - the lineup page empty, searching, and with dishes (including a nested recipe and a make-ahead line);
  - a recipe page in your lineup, with the "In your lineup" menu open;
  - lineup cook mode on a step, on a wait (before, during and when time is up), and with another dish's timer ringing;
  - the lineup's done screen;
  - a recipe page and single-recipe cook mode in prep-first order, with the prep stage showing.

  Colour problems the scan finds are shown to Jacob before any colour is changed.

## Constraints

- Plain HTML, CSS and JavaScript: no frameworks, no build step, no new runtime dependencies (README).
- The Content-Security-Policy forbids inline scripts and styles. Set styles through the DOM, as `recipe.js` does.
- Tests come first, with the `mattpocock-skills:tdd` skill, per `.claude/rules/testing.md`.
  - **Planner unit tests.** The planner is pure, so it gets unit tests on Node's built-in runner (`tests/unit/planner.test.mjs`), with Jacob's two meals as cases:
    - the broil waiting for the potatoes;
    - the curd and syrup fitting into the meringue's bake;
    - a slow step moving the meal later;
    - the gap between courses;
    - the make-ahead question;
    - prep before heat, and prep-first against fastest;
    - a nested recipe marked Already made;
    - a connected recipe being ready before the step that uses it;
    - a ringing timer making its follow-up the next step.
  - **Browser tests** use fixture recipes in `tests/e2e/fixtures.mjs`, with planning data and recipe links added there, never the real recipes.
  - **Checker tests** go through `tests/helpers/build-index.mjs`.
  - `npm test` passes before the work is called done.
- The service worker is network-first, so new pages and files need no special handling.

## Checking it as it's built

Jacob checks it at four points, each before the next stage starts:

1. **Layout mockups, before any site code.** Done: four rounds, on branch `prototype/meal-planner`. The layout above is what he chose.
2. **The recipe data,** as its own commits: the planning data and recipe links, then the added prep steps. A recipe's prep-first order is easier to judge than JSON, so it can be shown as a page.
3. **The built feature, before merging.** Claude clicks through it on the branch and shares screenshots at phone and desktop width, in light and dark mode. Jacob can also run it himself (`python3 -m http.server 8000` in the repo, as in `.claude/launch.json`). What he finds gets fixed before merging.
4. **A real lineup in the kitchen, after merging.** Cooking a real dinner on the phone is the one test nothing else replaces: real timing, messy hands. What felt wrong becomes fixes, and better time estimates.

## Left to the builder

- The exact JSON shape of the new fields, within the requirements above.
- How the planner is made fast enough on a phone if trying serve times one minute at a time is slow. In `assets/planner.mjs`, the steak dinner with a pavlova, curd and blueberry cream plans in about half a second on a laptop, most of it spent on the make-ahead comparison. A phone could take a second or two, which matters because it re-plans on every Next step.

## Calls Claude made (for Jacob to check)

- One lineup at a time, not saved, named lineups.
- Baking dishes start as Dessert, everything else as Main. Nested recipes follow their dish's course.
- Between serving the main and dessert, only a dessert's finishing touches are hands-on (whipping cream that can't sit long). Anything that keeps is done before the main.
- The make-ahead question appears when doing it ahead would make the day's plan more than 30 minutes shorter, and starts on whichever choice makes the day shorter.
- A step's own wait (the potatoes' 40-minute bake) starts its timer when you press Next step, while the wait step between dishes has a Start timer button, as Jacob designed it. The difference is because you've just put the potatoes in, and the plan depends on that timer running.
- No "this took longer" button. Real elapsed time does that job.
- Tapping "In your lineup" opens a small menu (Remove from lineup, Go to your lineup) rather than removing straight away with an Undo. The mockups showed both; say if you'd rather have Undo.
- The lineup link on the recipe page shows even when the lineup is empty.
- The way to your menu on the welcome page sits under "Browse all recipes →".
- Answers to what a recipe doesn't say are saved per recipe on this device, not in the recipe file.
- A busy stretch is 15 minutes or more of steps with no idle time between them.
- A dish's last step drops a closing "and serve" clause inside a lineup (display only).
- Nested recipes default to Make it.
- A connected recipe used by two dishes is made once.
- The planner adds a heating step when a dish needs the oven and its recipe doesn't heat it, and skips it when the oven is already at that setting.
- Temperatures within 15°F count as the same setting.
- Planning uses the middle of a range, and timers keep the short end.
- The timer strip's "ready around 9:40 pm" for long waits stays, even in lineup cook mode, because it's a timer and not a schedule. Say if it should go.
- No guessing equipment from step text. The checker warns instead.
- Only heating the oven can start during prep-first prep.
- The lineup page remembers your prep choice for next time, until a settings page takes it over.
- One saved prep preference covers both the lineup and how single recipes are ordered.
- A recipe with no prep marks shows no order toggle.
- Added prep steps show only in prep-first order. As written, prep stays in the ingredient lines, as today.

## Later

- Saved, named lineups ("Cookout").
- Suggestions of what goes with a dish (offered when you add it), if finding connected recipes through the ingredient links isn't enough.
- A settings page that holds the prep choice and other preferences (`docs/ideas.md`).
- Learning your pace: comparing how long your steps, prep especially, really take with the estimates, and planning with your speed.
- Choosing your own order step by step, or "do this first".
- A combined shopping list for the lineup.
- Two cooks.
- Oven rack space, and more than one oven.
- Scaling a sub-recipe to the amount the parent needs.
- Listing a recipe under more than one section (blueberry syrup in Cocktails and Baking). That's a small change of its own.
