# Feature map

Each page, what a visitor does there, and what should happen. The README is the full spec; this is the checklist the `verify` skill walks. Local addresses are on the `site` server (port 8000). Recipes named here are real ones; pick any recipe of the kind needed.

## Welcome page: `index.html`

- Search box: typing and pressing Enter opens the recipes page with that search.
- One entry per section (Baking, Cooking, Cocktails), each with its count: opens the recipes page on that section.
- With dishes on the menu, a "Your menu · N →" link opens the menu.

## Recipes page: `recipes.html`

- Search by name, ingredient or tag: the list and the count narrow as you type.
- Section tabs, then each section's filters in a sheet (cuisine, flavor, base spirit…) and the shared ones (ingredients, time, occasion, season, diet). Several options in one filter widen; filters together narrow. Each option shows how many recipes it would leave.
- Chips show the active filters; removing one widens the list again.
- Sort: A–Z, newest, quickest.
- The URL holds search, section, filters and sort: reload and Back keep them, and a copied link opens the same list.
- A recipe on the menu says "On your menu".

## Recipe page: `recipe.html?r=<recipe-name>`

- Tap an ingredient to tick it, tap a step to mark it done; the current step is marked. Reload keeps both.
- "Prep first" switch (only on recipes where the order differs): prep steps under a "Prep" heading, then the cooking. Off shows the recipe as written. The choice is remembered and applies to cook mode.
- "Start baking" / "Start cooking" / "Start mixing" opens cook mode.
- "+ Add to menu"; once added, the recipe's menu choices are here.
- "Keep screen on" (not checkable here: say so).
- A recipe that doesn't exist, or a broken recipe file, shows a message, not a blank page.

## Cook mode (on the recipe page)

- One step per screen, with that step's ingredients and amounts to tick off and a peek at what's up next.
- A step that waits offers a timer. Timers keep running when you move on, even into another recipe, and ring while cook mode is open. A test clock covers timing; here just check one starts, shows its time and can be stopped.
- Progress is shared with the recipe page both ways. The last step ends on an "all done" screen.

## Menu: `menu.html`

- Empty: "Let's make something", with a search that adds dishes ("+ Add").
- The menu card: each course, the recipes a dish needs (Make it / Already made), and what's worth making ahead.
- Questions the menu asks about what a recipe doesn't say; answering changes the plan.
- "Start cooking": every dish's steps in one order, waits on their own screen, a ringing timer that says what's next, "Already done" on a waiting step, and one "Plate up" step at the end. Steps done here show as done on each recipe's page.
- When no order works, the page says so (an alert), not a blank plan.

## Intake: `intake.html`

- Three ways in: pasted text works locally. A recipe website's address needs the Worker; a PDF works locally (try `tests/samples/recipe.pdf`).
- It asks only what it couldn't read (how long a step bakes, how a dish is served) and holds back until answered.
- The preview, with Prep first and the original beside it (one tap away on a phone). Reload keeps an unfinished review.
- "Continue in the editor" needs sign-in: use the browser tests. "Copy instead" gives the recipe file.

## Editor: `edit.html?r=<recipe-name>` and `edit.html?new`

Needs sign-in, so locally it only asks you to sign in. Check it through `tests/e2e/editor.spec.mjs`, `saving.spec.mjs`, `from-scratch.spec.mjs` and `intake-to-editor.spec.mjs`.

## Every page

- The footer's "Sign in" link (signing in itself needs the live site).
- Light and dark mode follow the phone; the browser bar colour matches.
- Usable at phone width, by keyboard, with no console errors.
