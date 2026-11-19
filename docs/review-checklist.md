# Review checklist

Bugs this repo has already had, each with a **trigger** you can spot in a diff, the **check** to make when it fires, and **where it came from**. A reviewer reads the triggers, then runs only the checks whose trigger matches: usually a handful per change, not all of them.

## Keeping it useful

- Add an item when a bug got past review and its trigger can be read from a diff. Name the commit or PR it came from.
- When an item can be checked by a machine (a lint rule, a test, a law), write that check and delete the item.
- Delete an item whose code is gone, or that hasn't fired in a long time.

## Saving and the editor

**A save that can overwrite a newer one**
- Trigger: the editor's save, its browser draft, or the Worker's save or delete code changes.
- Check: a save still carries the version it was opened from, so a recipe saved since (another tab, another device) is refused with "This recipe changed since you opened it", not replaced. Fields the editor has no control for come out unchanged.
- From: 88af367 (a brought-back draft could undo a newer save).

**What's typed is lost**
- Trigger: a new form, field or line in the editor, or a change to how one opens, closes or saves.
- Check: typing goes into the recipe and its draft as it's typed (`applyForm`); Cancel and Escape put the line back with `putBack`; every change to the recipe goes through `update()`.
- From: 91eab7a (opening another line, Save or a reload lost an open line).

**A redraw takes focus, the cursor or a click with it**
- Trigger: code that redraws part of a page after input, blur, a fetch or a timer, on any page.
- Check: focus, the cursor and the typed text survive the redraw, a click on a button mid-redraw still lands, and on a phone the keyboard stays open. Something that arrives late (a plan, a recipe) doesn't steal focus from what the visitor opened meanwhile.
- From: 7cef6d5 (moving on from a Details field lost focus and closed the phone's keyboard), 3089448 (a dish's menu lost focus when the plan arrived, so Escape did nothing), ee2b9c8.

**Renaming leaves references behind**
- Trigger: renaming, removing, moving or regrouping something other parts of a recipe name: an ingredient (named by steps' `uses`), a recipe (named by `recipe` links).
- Check: every reference follows, or the checker says which one broke. Deleting a recipe another uses is refused.
- From: b51ea6f (renaming an ingredient broke every step that used it and turned Save off).

**An empty field is dropped, and a reader expects it**
- Trigger: code that removes a field once it's empty (`tags`, a list), or code that reads one that can be missing, laws included.
- Check: every reader treats a missing field as empty.
- From: 6360fc9 (a section-move law crashed when a move dropped every tag).

## The lineup planner and menu

**Two dishes wait on each other**
- Trigger: `planner.mjs` changes how dishes share the oven or other equipment, what holds what, or the order of prep, heating and nested recipes.
- Check: the planner laws pass on several fresh seeds, and there's an example test for two dishes that both need the shared thing at different settings later, and for prep-first with a nested recipe. When nothing can ever start, the planner says so instead of looping.
- From: 0e83f55 (lime bars and pavlova deadlocked on the oven), df2ae57 (prep-first lineups looped forever), a3d0d52 (a dish went into a cooler oven).

**A recipe is made twice, or not counted**
- Trigger: a change to how nested or connected recipes, or dishes made ahead, join the lineup.
- Check: a recipe that's both a lineup dish and another dish's nested recipe is made once, and making it ahead takes it off the day.
- From: 1769107 (the acini di pepe was made twice).

**Re-planning mid-cook ignores what's done**
- Trigger: a change to what the planner is given when it re-plans during cooking.
- Check: it plans from now, counting only steps still to do, and keeps choices already settled (made ahead) rather than weighing them again.
- From: 78ed130 (finishing early never brought dinner forward), 0547cdd.

**The planner gets slow on a phone**
- Trigger: the planner does more work per plan: a new comparison, search or pass.
- Check: Next step on the steak dinner with the pavlova, in Chrome at 6× CPU slowdown, stays under about half a second.
- From: 0547cdd (each Next step took about 2 seconds).

**A time on screen stops counting**
- Trigger: a screen that shows minutes left or a countdown.
- Check: it counts down while it's on screen, not just when it's drawn, and says when the time's up.
- From: ad8b6b0 (a wait screen still said 45 minutes when the roast's 40-minute timer rang).

**Text that grows with what's going on**
- Trigger: a strip, list or note whose length depends on how many things are happening (timers ringing, dishes, questions).
- Check: at phone width with the worst case (several timers at once, a long step), the main content stays on screen.
- From: 3089448 (a few timers ringing pushed the step off the screen).

## Reading recipe text

**Times and amounts written the way cookbooks write them**
- Trigger: code that reads a time, amount or instruction from recipe text (the intake, restructuring, the planner's time reading).
- Check: fraction characters ("1½ to 2½ hours"), ranges ("8 to 12 min"), and a past-tense mention ("the melted butter") versus an instruction ("Melt the butter").
- From: 8f96601 ("1½ hours" was read as half an hour).

## The Worker

**A failure at startup is kept**
- Trigger: the Worker sets something up once and reuses it (Better Auth, a client, a cache at module level).
- Check: if setting it up fails, the next request tries again instead of reusing the failed copy.
- From: 0c1cdc6 (sign-in stayed broken after the tables were made, until Cloudflare restarted the Worker).

**Sites refusing in their own way**
- Trigger: `/api/fetch` changes how it reads another site's answer.
- Check: every status a site uses to refuse automated requests (403, and 402 from Serious Eats) gets the "copy the text instead" message, not "try again later".
- From: eb13f9d.

## Styles

**A stylesheet rule beats `hidden`**
- Trigger: a rule that sets `display` on an element the page shows and hides with `hidden`.
- Check: the element really disappears when hidden.
- From: 3089448 (the menu card's search box showed). `style.css` already has four separate `[hidden]` patches for this.

**CSS containers cut off counters**
- Trigger: `container-type` on a list, or on anything around numbered steps or lettered ingredients.
- Check: numbering still carries on across groups (1–4, not 1–2, 1–2).
- From: 4b4a24a.

## Scripts

**Paths with "\" on Windows**
- Trigger: a script that lists files or compares paths.
- Check: paths use "/" on every system.
- From: 4e66540 (the link checker skipped recipe photos and four tests failed on Windows).

## Browser tests

**A test that only passes on Linux**
- Trigger: a test that clicks and then checks focus, or moves the cursor with Home or End.
- Check: focus is checked from the keyboard; the cursor is moved with arrow keys. (Safari and WebKit on a Mac don't focus a clicked button or checkbox; Home doesn't move the cursor in a Mac textarea.)
- From: ee2b9c8, 84f8aab.

**The test clock moves before the page is ready**
- Trigger: a test that reloads or navigates, then moves the test clock (`runFor`).
- Check: it waits for the visible state a person would see (the timer back on screen) before letting time pass.
- From: c620590 (a flaky timer test).

**A button name inside another's**
- Trigger: a new `getByRole(..., { name })` where the name is part of another control's name ("Move" and "Move up").
- Check: `exact: true`.
- From: docs/specs/editor-redesign.md, "Things learned the hard way".
