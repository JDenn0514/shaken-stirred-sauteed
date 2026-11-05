# Cook mode: design

2026-11-02 · Jacob Dennen, with Claude

## Why

A recipe page today is one long page. Partway through, you have to scan it to find your place, and when a step says "Combine the flour, salt, baking soda and sugar" you have to scroll back up to the ingredients for the amounts. Cook mode is a second way to view a recipe's steps: one step per screen, big enough to read at arm's length, with that step's ingredients and amounts right there. It helps you stay focused on the step you're on and not skip ahead, while still letting you check what's coming.

It's for every section: baking, cooking and cocktails.

## Goals

- One step per screen, so you always know what you're doing now without scanning.
- Each step shows the ingredients it uses, with their amounts, as a tick-list.
- You can see what's next without losing your place.
- Waits get a timer, and a running timer stays visible while you move on to other steps. This is how cook mode handles "do two things at once": something bakes while you do the next step.
- Progress is the same progress the full recipe page already saves. Ticks and finished steps show in both views.

## Non-goals

- Cook mode is **not** the default view. The full recipe page stays as it is, apart from a button to start cook mode.
- No alarms that ring while the phone is locked or the page is in the background. A website can't schedule them, especially on an iPhone (see Timers).
- No guessing which ingredients a step uses from the step's wording.
- The recipe-import tool (URL or photo → recipe JSON) is a separate project, planned after this one. This design only has to leave it an easy format to write.
- No screenshot tests, offline tests or print layout for cook mode (matching `.claude/rules/testing.md`).

## Anti-goals (failures even if it technically works)

- **Showing a wrong amount.** Nine recipes list the same ingredient twice. The donuts, for example, have 10 Tbsp butter in the batter and 6 Tbsp melted for the topping. A wrong amount is worse than no amount.
- **Losing your place.** Looking ahead must never move you or mark anything done.
- **An accidental swipe or tap you can't undo.** With messy hands this will happen. One tap has to undo it.
- **A timer that seems to promise it will ring when it won't.**

## The screen

The mockups from the brainstorm (`step-screen.html`, `peek-v2.html`, `timers.html`) were throwaway. This is the agreed layout, top to bottom:

1. **Header row:** the step's group name if the recipe groups its steps ("Batter"), and "Step 4 of 9", with a ✕ that closes cook mode.
2. **Progress bar:** one segment per step. Finished steps are filled, the current one is lighter.
3. **Running timers**, if any (see Timers).
4. **The instruction** (`do`), in large text.
5. **This step's ingredients** as a tick-list: checkbox, amount, ingredient name, plus the note if there is one. Grams come first when the recipe has them; the other amount (cups, ml) can be shown smaller. An ingredient that is a plain string shows as written. Ticking here is the same tick as on the full page. **Instruction first, ingredients below:** Jacob reads what he's doing first, then measures.
6. **Wait** (`wait`) on its own line, with a timer button when it can be timed. **Cue** (`cue`) on its own line in the section colour.
7. **"Up next"** at the bottom: one dimmed line with the start of the next step's instruction, cut off. **Tapping it opens it in place** to show the whole next instruction in the same small text, and tapping again folds it. It's a preview only: you don't move, and nothing is marked done. It shows only the instruction, not the next step's ingredients. It folds back each time you move to another step. On the last step it isn't shown.
8. **Back** and **Next step** buttons, large. On the last step, Next reads **Finish**.

Steps with no ingredients and no wait simply leave those parts out.

The look follows the site's Field Guide style (`assets/style.css`): its fonts and the section's colour (`--section`), in both light and dark mode.

## Moving through it

- **Next step**, or swiping forward, marks the current step done and moves on.
- **Back**, or swiping back, goes to the previous step and un-marks it. That's the one-tap undo for an accidental Next or swipe.
- Where you are is always the first step that isn't done, the same rule the full page uses for its "current" highlight. So both views always agree.

## Getting in and out

- A button on every recipe page, worded by section: **"Start baking"**, **"Start cooking"**, **"Start mixing"**.
- It opens at the first unfinished step. If no steps are done and the recipe has `beforeYouStart`, it opens on a **"Before you start" screen** that lists those items, with Next leading to step 1.
- **The ✕, or the phone's back gesture, returns to the full recipe page.** It must not leave the site or go to the page before the recipe.
- Reloading the page while in cook mode keeps you in cook mode at the same step.
- **Keep screen on switches on by itself** while cook mode is open (where the browser supports it, the same as today's button) and releases when you leave.
- **Finish** opens a short done screen with a way back to the recipe. If the recipe has notes, they're shown there, since serving and storage tips usually live in the notes.

## Timers

- A step with a `wait` gets a **Start** button when the wait can be read as a length of time. For a range ("12 to 15 min"), the timer is set to the short end, so you check early.
- Once started, a timer **stays pinned at the top of every cook-mode screen** until it's finished or cancelled. It shows the time left and the step it belongs to. You can pause or cancel it. Several timers can run at once and they stack.
- When it reaches zero, it plays a sound and the strip changes to show **that step's cue** ("Evenly golden brown; a toothpick… comes out clean"), with **"+2 min"** and **Stop**.
- A timer counts toward a fixed finish time that is saved, so it stays correct if the page reloads or you leave cook mode and come back.
- **Timers are shared across recipes, not kept per recipe** (Claude's call). Several recipes are parts of one meal: chimichurri with carne asada, the sauces with the shawarma, the acini di pepe with the wedding soup. So a timer started in one recipe's cook mode still shows, and still rings, in another's. Each strip names its recipe as well as its step, and links back to it.
- **The limit, stated honestly:** it can only ring while cook mode is open on screen. Keep screen on helps with that. For long waits, such as an overnight marinade, the strip shows the time it will be ready ("ready around 9:40 pm") rather than suggesting it will wake you. Jacob agreed this is good enough.
- **A second limit:** browsers only let a page make sound after a tap since it loaded. Any tap in cook mode turns the sound on, so after a reload a timer only beeps once you've tapped something. It buzzes regardless, on phones that can (not iPhones, which don't let web pages vibrate).
- **On an iPhone it beeps through the silent switch** (Jacob's call). That also pauses any music or podcast playing, so it's only switched on while a timer is ringing. Needs Safari 17 or later; older ones stay muted by the switch.

## Recipe data changes

### Which ingredients a step uses

Each step object gets a new optional field listing the ingredients it uses. Requirements for the format (the exact shape is the builder's call):

- A person can read and write it by hand in the JSON, and so can the future import tool.
- It is unambiguous when an ingredient name appears twice. For example, it might name the group plus the item, or use another approach that holds up for the nine recipes with repeated names.
- The recipe checker (`scripts/build-index.mjs`) **fails the build** for a link that doesn't match an ingredient, or matches more than one. The link must never quietly point at the wrong one.
- **A link can carry its own amount for that step.** Some ingredient lines are used across several steps: `minty-lime-bars` uses "200 g granulated sugar, divided" as 100 g and then "the remaining 100 g", `hot-honey-chicken` uses its butter as 1 tbsp then the rest, and the lemon juice in `israeli-salad` and `chicken-shawarma-salad` is split in half. Such a step shows its own share ("100 g Granulated sugar"), never the full line's amount. If a share can't be given as an amount ("the rest of the marinade"), the step shows the ingredient with that wording and no number. The checker validates these the same way.
- **Each use of a split ingredient gets its own tick** (Jacob's decision). In cook mode, ticking the first 100 g of sugar doesn't tick the later step's 100 g. On the full recipe page, that ingredient shows as ticked only once every use is ticked. Ticking it on the full page ticks all its uses, and unticking it there unticks them all. An ingredient used in only one step behaves exactly as today. How the per-use ticks are saved alongside the existing `ing` list is the builder's call.
- Steps without the field work fine and show no ingredient list.
- The README's "Recipe fields" table and `recipes/_template.json` document it.

### Filling it in for the existing recipes

Claude adds the links to all 36 recipes, and Jacob reviews them. While doing so:

- Steps that have their timing only in the text ("beat on medium for 3 to 4 minutes") get a `wait` too, so they get a timer button.
- A `wait` that holds two different waits ("30 min ice bath, then about 1 hr fridge") is left as it is or split into two steps, whichever reads better for that recipe. Claude decides per recipe and lists what changed.
- This is recipe data, so it lands as its own commit(s), separate from the code, to keep the review readable.

## Accessibility

- Everything works by keyboard and screen reader, not only by touch and swipe.
- The current step is exposed to assistive tech, for example with `aria-current="step"` and a step change that is announced. When that exists, the rule in `.claude/rules/testing.md` says to move the recipe-page tests off the `done`/`current` classes. Do that for any test this touches.
- The accessibility scan (`tests/e2e/accessibility.spec.mjs`) gets the new states added to `PAGES`: cook mode on a step, "Up next" opened, a timer running and a timer ringing, the "Before you start" screen and the done screen, in light and dark mode. Colour problems the scan finds are shown to Jacob before any colour is changed.

## Later: cooking a whole meal

Jacob would like to add several recipes to one cook-mode session, for example carne asada, the grilled corn salad and hasselback potatoes. The site would then work out the order to do things in. **That is its own project, planned after cook mode ships**, and is out of scope here. Working out an order needs things the recipes don't have yet: roughly how long each hands-on step takes, which steps can run unattended, and which steps compete for the oven, grill or stovetop (and at what temperature).

This design prepares for it in three ways, and none of them should be undone:
- Timers are shared across recipes and name their recipe.
- During the data work, every hands-off wait is moved into `wait`, including timings that today appear only in the step text.
- Progress and timers are kept per recipe and per step, so several recipes can later be in progress at once.

## Constraints

- Plain HTML, CSS and JavaScript, no frameworks, no build step, no new runtime dependencies (README).
- The page's Content-Security-Policy forbids inline scripts and styles. Set styles through the DOM, as `recipe.js` already does.
- Progress is saved per recipe in `localStorage` under `sss:progress:<slug>`, as `{ ing: [...], steps: [...] }` with flat indexes across groups. Cook mode reads and writes that same record, so existing saved progress keeps working. Because those indexes are positions, a recipe edit that adds or splits steps or ingredients would shift them and tick the wrong things. So saved progress gets a fingerprint of the recipe's step and ingredient lists, and is quietly dropped when it no longer matches (Claude's call). Progress saved before this change has no fingerprint, so it is kept as it is. The data work below is the only thing that might shift it, and a stale tick is easy to clear with "Reset checkmarks".
- The service worker is network-first and caches what it fetches, so new files need no special handling.
- Tests come first (`mattpocock-skills:tdd`, per `.claude/rules/testing.md`): browser tests use the fixture recipes in `tests/e2e/fixtures.mjs` (add cases there, such as a repeated ingredient name, a timed wait and a grouped recipe), and checker tests go through `tests/helpers/build-index.mjs`. `npm test` passes before it's called done.
- Work happens on the `cook-mode` branch, apart from the CI work.

## Left to the builder

- The exact JSON shape of the step-to-ingredient link (within the requirements above).
- Whether cook mode is a view inside `recipe.html` (e.g. a URL hash or parameter) or its own page, as long as the back gesture, reload and progress behave as described.
- How a wait is read as a duration, and which unreadable waits (if any) the checker warns about.
- The timer sound (Web Audio or a small file), and whether to vibrate where the phone supports it.
- Swipe thresholds, animation and exact spacing, within the Field Guide style.
- Whether a running timer also shows anywhere on the full recipe page. (Claude's call for now: no. Timers live in cook mode and are there when you come back.)

## Calls Claude made (for Jacob to check)

- Back un-marks the step you go back to.
- Grams first, other units smaller.
- Notes on the done screen.
- "Up next" folds back on every step change, and it doesn't show the next step's ingredients.
- Keep screen on switches on automatically in cook mode.
- The button wording "Start baking / cooking / mixing".
- Timers start at the short end of a range; "+2 min" when one rings.
- Timing hidden in step text gets moved into `wait` while linking ingredients.
- Timers are shared across recipes, and each strip names its recipe.
- Saved progress is dropped when the recipe's steps or ingredients change shape.
- A step that uses part of an ingredient shows its own share of the amount.
