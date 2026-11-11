# The recipe editor: what's missing, and how to make it easy and pretty

2026-11-10 · Jacob Dennen, with Claude

Jacob, this report pulls together six reviews of the editor: a field-by-field map, the design docs and git history, a hands-on walkthrough on phone and laptop, a visual audit, an accessibility audit, and a check for anything the others missed. It gives one direction, not three competing ones. Where the reviewers disagreed, I picked one answer and say why. Where only you can decide, the question is in section 7.

The screenshots named below (`vis-*.png`, `walk-*.png`) were taken during the review and weren't kept in the repo. Line numbers are as of commit 29c7a3f.

---

## 1. The short version

- **The idea is right. Keep it.** You fix the recipe on the real recipe sheet, not on a form. That is the editor's best feature. Everything below builds on it.
- **It loses your typing.** Text in an open form is silently thrown away if you tap another line, press Escape or press Save. Save can even say "Published" without the text you just typed. This gets fixed first, straight after the agreed Edit button.
- **Some edits break other parts of the recipe.** Renaming an ingredient ("Whole milk" to "Milk") breaks every step that uses it and turns Save off. Split gives the wait to the wrong half. Step numbers in messages don't match the numbers on the sheet.
- **Big parts of the recipe can't be edited at all.** That covers notes (all 41 recipes have them), Before you start (15 recipes), the times the page prints, category, and the baking and cocktail facts. You'd still need the JSON for these.
- **Details is a wall.** For Babkallah it is 17,000px of checkboxes, mostly one checkbox per ingredient per step. Each step's lineup settings should open inside the step instead.
- **There's no safety net.** There's no Undo, no "unsaved" sign, Save scrolls out of sight, and nothing shows what changed. One sticky bar should fix all four: recipe name, "Unsaved changes", Undo, Save.
- **On the looks side,** the editor should look like the sheet with a pencil layer on top, not an admin panel stuck under it. Fix the four places where it visibly breaks the sheet. Use the full sheet width on a laptop. Make the open line look like cook mode's "Now" step. Give errors their own colour, so they stop looking like a baking cue.
- **Build it in small pieces.** There are about 20 small pull requests, smallest and safest first. Section 6 has the order.

---

## 2. What's working and should stay

- **The preview is the real page.** The editor draws the recipe with `recipe-view.js`, the same code the site uses (`assets/edit.mjs:201-206`). Fraunces title, the facts box with lime tape, numbered step boxes, wait and cue lines, the drawing: they all match.
- **You edit in place.** Tap a line, its form opens where the line was, and Done puts focus back on that line (`edit.mjs:694-697`).
- **The checks are the build's checks.** Errors come from the same `recipe-checks.js` the build uses. Save stays off while there are errors and says how many (`edit.mjs:180-181`). Errors sit next to the line they're about and are tied to it for screen readers (`edit.mjs:355-368`).
- **To-dos with one-tap fixes.** "Step 1 doesn't use the burner" comes with a fix button (`edit.mjs:228-239`). This pattern should spread to every to-do.
- **Nothing gets dropped.** Fields the editor has no control for are kept as they are, in their original order (`edit-model.mjs:8-10`). That must never change.
- **Pick lists, never typing,** for tags and linked recipes (`edit.mjs:462-485`). The serve and sits fallbacks are shown in plain words ("Not set: hot, up to 10 min", `edit.mjs:431-434`).
- **The draft is kept in the browser** on every change and offered back with "Bring back my changes" / "Discard them" (`edit.mjs:92-99`, `:169-176`).
- **Delete is safe.** You type the name to delete, and Delete is off while another recipe links to this one, which it names (`edit.mjs:535-597`).
- **Join works well.** It merges uses without duplicates (`edit-model.mjs`, `mergeSteps`).
- **The original sits beside the editor** on a laptop when importing, and "Show the original" opens it on a phone.
- **The words are good.** They're in the Field Guide voice: "Bring back my changes", "Published. The site updates in a minute or two.", "These help the lineup plan a meal. They don't stop you saving."
- **Dark mode and focus.** Dark mode covers everything, and the 2px focus ring (lime in dark mode) is clear. The WCAG 2.1 AA scan passes in every editor state.
- **The basics.** Strict CSP, no framework, no build step, no drafts on the server, and editing the title never renames the file.

---

## 3. What's missing

### A. Things that lose work or quietly break the recipe (fix first)

- **Typing is lost when you switch, press Escape or save.**
  - Tapping another line (`edit.mjs:721-727`) and Escape (`:700-707`) close the form without keeping what's in it.
  - Save (`:615-629`) sends the recipe without the open form's text but still says "Published" (screenshot `walk-phone-19-save-with-open-form.png`).
  - **Why it matters:** you think you fixed an amount, and you didn't.
- **Focus jumps to nowhere in Details.**
  - Type in "Hands-on time" or "Source" and tap the next field: the page redraws and focus lands on the page itself (`edit.mjs:810-857`, `:154`).
  - On a phone, the keyboard closes and you have to tap again.
- **Renaming or removing an ingredient breaks its steps.**
  - `updateIngredient` (`edit-model.mjs:96-107`) doesn't update the steps' "uses". Save then turns off with `step 1 uses "Whole milk", which isn't one of the ingredients`.
  - The only fix today is deep in Details.
  - Two ingredients can share a name across groups (two "Sugar"s), so the fix has to follow the same matching rule the checker uses.
- **Restoring an old draft can undo newer changes.**
  - The draft doesn't remember which version of the recipe it started from (`edit.mjs:97`).
  - Example: leave a draft on your phone, then edit and save on the laptop. Back on the phone, "Bring back my changes" plus Save quietly reverts the laptop's edits, and no conflict warning fires.
- **An abandoned "Add ingredient" or "Add step" leaves a blank entry.**
  - `add()` puts an empty entry in the recipe straight away (`edit-model.mjs:227-233`).
  - Cancel it, and the checker complains "every ingredient needs text" with nothing on the sheet to tap. Save is off and you can't see why.
- **Split goes wrong.**
  - The form opens with the cursor at the start, so "Split here" does nothing and the form just closes (`edit-model.mjs:181`, `edit.mjs:801`).
  - When it does split, the wait, cue and burner always go to the second half (`SECOND`, `edit-model.mjs:171`). That's wrong for your garlic soup: "Cook garlic 5 minutes…" (`docs/ideas.md:45-46`).
- **Step numbers don't match.**
  - The sheet restarts numbering in each group: Crust 1–2, Filling 1–4. The live page counts 1–6 (`vis-edit-rest-light-1280.png` vs `vis-recipe-light-1280.png`). The editor never copies what `recipe.js:44-45` does.
  - Messages count steps in file order (`recipe-checks.js:67-69`), so on Babkallah "step 1" is the step the sheet shows as **5**. This affects the 31 recipes with added prep steps.

### B. Parts of the recipe you can't edit yet

| What | How many recipes | Where it shows | Why it matters |
|---|---|---|---|
| **Notes** (tips, and grouped tips) | 41 of 41 | page, cook mode's "All done" (`cook.js:204`) | Every recipe has them. Copying a good note in is also how ideas.md:63-74 expects personal notes to graduate. |
| **Before you start** | 15 | page, cook mode intro (`cook.js:140`), lineup gather (`menu-cook.mjs:84`) | You see it on the sheet but can't tap it. It's a plain list (no groups). |
| **Times as printed** (`times`, e.g. "Rise · 1 to 2 hr") | 35 | the facts box | Details offers minutes (`time`) instead. All 41 recipes have `time.total`, which overrides prep + cook, so editing Prep changes nothing you can see. "Rest" is never shown. |
| **Category** | 41 | section, colours, which tags are offered (`edit.mjs:465`) | A recipe filed in the wrong section can't be moved (`FIELDS`, `edit-model.mjs:52`). |
| **Baking facts**: pan, oven heat | 9 | facts box | Static text. |
| **Cocktail facts**: glass, ice, garnish, method, keeps, ABV, standard drinks | 2–3 each | facts box; standard drinks drives the strength filter; glass drives the drawing | You can't fix the strength filter. |
| **A step's `during`** ("happens while the step before waits") | 6 steps | the lineup (`planner.mjs:128, 200-206`) | The planner relies on it. It's a yes/no, not "step N". |
| **"Doesn't wait"** (`wait: false`) | – | lineup | Only the intake can set it. |
| **Millilitres** on a cooking or baking ingredient | – | ingredients | Only shown for cocktails, or if ml is already set (`edit.mjs:276`). |
| **Plain-text ingredient → amount + name** | 0 today | – | Needed one day for scaling (`ideas.md:56`). |
| **Origin, nutrition** | 8, 13 | facts | Fine to leave as "kept, not edited". |
| **Image** | 0 | hero, card | Defer. Note it so nobody thinks it's forgotten. |

### C. Missing ways to work

- **Add in the middle.**
  - "Add step" and "Add ingredient" only add at the end (`edit-model.mjs:227-233`), then you tap Move up again and again. Moving Stock to the top of 6 took 5 taps.
  - Move up at the top stays enabled and does nothing.
  - The agreed "Add a step after this" fixes the main case.
- **You can't tell lines are tappable.** The only cue is a dotted underline (`style.css:1414-1418`). That's the garlic soup story (`ideas.md:36-42`).
- **Undo.** There's none: no button, and Ctrl+Z does nothing. Remove happens at once, with no way back.
- **A sign that you have unsaved changes, and a look at what changed.**
  - The bar never says "unsaved". Save stays on with nothing changed: two taps sent two saves, both "Published".
  - The draft offer only gives a date, not what changed.
- **Save in reach.** The bar isn't sticky (`style.css:1399`). On a long recipe on a phone, Save was 4,500px away with a step open and 33,000px away with Details open.
- **Problems and to-dos in a cook's words, with a way to get to the fix.**
  - Messages use file words: `"wait" must be a time, like "10 min", or false` and `"source.url" must start with https://`.
  - Some to-dos have no fix button: "no key ingredients tagged", "no total time".
  - Errors about a step's oven or hands-on time sit on the step, but the field that fixes them is in Details.
- **Start from scratch.** It's planned (`edit.html?new=<category>`, plan.md:30, design.md:155). Today `edit.html?new` without an import shows "Nothing to finish" (`edit.mjs:892-899`).
- **Checking against the original on a phone.**
  - The original only opens at the very top of the page, so checking step 9's amounts means scrolling thousands of px up and back down.
  - Amounts from a photo get one general sentence, "Check every amount", not a tick per amount. Yet the design's own anti-goal is "a wrong amount slips in unnoticed" (design.md:38).
- **Paste more lines** after leaving the intake. Say you find a missed ingredient block: today you type it line by line.
- **Quick wait choices on a phone.** Waits are all typing. Chips like "5 min", "10 to 15 min" and "1 hr" under the field would save typing and match the Field Guide's "waits are ranges".
- **Pickers that fit.**
  - Key ingredients is 46 checkboxes with no search, and nothing says "pick 1–4".
  - The drawing picker lists raw names like "nick-nora" with no picture (`edit.mjs:426`).
- **Preview links that leave the editor.** "← Cooking", the tag chips, the card and the intake's "Made by …" link all navigate away mid-edit. In the home-screen app there's no back button.

---

## 4. The design direction

**The one idea:** the editor is the recipe sheet with a naturalist's pencil on it. At rest it is the live page. Open a line and it becomes the "Now" panel from cook mode, in the sheet's own type. Everything the visitor doesn't see gets tucked away neatly, not stacked as a wall underneath.

### At rest

- **The sheet at full size.**
  - On a laptop, remove the editor's 760px cap (`style.css:1398`), so the sheet renders at the recipe page's 1080px with its 5/7 split.
  - Today the sheet is squeezed to 696px. The ingredient column is about 225px and wraps "115 g · 8 Tbsp Butter / melted", while about 270px of empty board sits on each side (`vis-edit-rest-light-1280.png`).
  - Line up the bar, the strips and the sheet on one edge (they're 32px apart today).
- **The sheet looks exactly like the live page.** Four fixes, all confirmed in a live render:
  1. Numbering runs 1–6 across groups. Set `counterReset` from `data-start` in `decorate()`, as `recipe.js:44-45` does.
  2. Group headings stay the uppercase mono "CRUST". Add `text-transform: inherit` to `.edit-part`.
  3. The recipe page's hover box no longer outlines whole steps (`style.css:1016`).
  4. Ingredients keep their a./b. lettering and hairlines at rest. Today the part button replaces the label they hang on. The open ingredient form loses the stray italic "b." on every field (`vis-x-ingform-390.png`).
- **How you know a line can be edited: one scheme for touch, one for mouse.**
  - **Each step and ingredient gets a small visible "Edit" button** at the right of the line: a pencil glyph plus the word, in the mono caption style, `--muted`, at least 44px tall. This is the agreed change. It works on a phone with no hover, and it says "Edit step 3" to a screen reader.
  - The line's own text stays tappable too.
  - Dotted underlines go, except the title's, which stays as the one always-on cue.
  - With a mouse (`@media (hover:hover)`), hovering a line gives it a soft `--section-wash` background with a 4px radius, fading in over 150ms.
  - One mono caption under the bar on first visits: "Tap any line to change it. Nothing is published until you Save."
  - Not chosen, and why:
    - a 44px "⋯" menu on every row, which squeezes the ingredient column and adds 30–50 tab stops;
    - insert seams and drag handles, which fight scrolling on touch, don't exist without hover, and are hard to test.
- **The card preview stays where the spec puts it, first** (design.md:150). It gets smaller:
  - drop its meaningless "No. 01" (`style.css:544-545`);
  - on a phone, show it compact (a smaller card, or folded under "How it looks in the list"). Ask first; see section 7.
- **Problems stay visible; to-dos fold.**
  - While Save is off, the Problems list stays on show, because the design wants the reason in view (design.md:173).
  - To do and the intake's "Things to check" fold into one strip under the bar: "3 things to check ▸".
  - Today a 300px To do box pushes the recipe's title down to about 690px on a phone (`vis-edit-rest-fold-light-390.png`).
- **The preview's links do nothing in the editor:** `tabindex=-1`, `aria-disabled`, and clicks prevented. They **must keep their real `href`.** The section colours come from a CSS rule that reads "← Cooking"'s href (`style.css:185-210`). Rewrite it to `#` and the page loses its colours.

### The sticky bar

- Make `.edit-bar` sticky just under the site header at every width, with `background: var(--section-paper)` and a 2px family-ink rule under it.
  - The header's height varies, so measure it once and set a `--header-h` property from JS. Inline styles aren't allowed by the CSP, but setting a property through the DOM is fine.
  - Lower the sticky ingredients column (`style.css:927`) and the sticky original (`:1483`) by the bar's height too.
- **What's in it:**
  - The recipe title in Fraunces in the family ink, with a mono caption "Editing · Baking", instead of "EDITING recipes/lemon-bars.json". The file name stays only for new recipes ("Will be saved as soft-milk-rolls"). Note that tests check this text, so they're updated in the same change.
  - "Unsaved changes" or "No changes".
  - Undo and Redo, once built.
  - Save.
- **Save uses the family fill**, like "Start baking" (`.cook-start`, `style.css:1028-1031`), not ink black.
  - In dark mode that means no more cream pills (`vis-edit-step-dark-1280.png`).
  - Disabled Save gets a dashed outline and the reason right beside it ("2 problems ▸"), not just a fade to half opacity.
  - Save is off when nothing changed, but only for an existing recipe with no restored draft and no failed save.
- **The status line** ("Saving…", "Published. … See X on the site", "Removed step 4.") becomes one lasting element outside the redrawn area. Screen readers then actually announce it. Today it's rebuilt on every redraw (`edit.mjs:181`).
- **Phone and keyboard:**
  - With the keyboard up on an 844px phone, only about 400px is visible, and the header plus the bar would eat about 125px of it.
  - So while a field in an open form has focus, hide the site header on phones and keep only the slim bar.
  - There's no bottom-fixed bar on phones: it fights the iOS keyboard.

### While editing a line

- **The open line becomes the "Now" panel.**
  - Put the panel style on the line itself: `.steps li:has(> .edit-form)`, reusing `.steps li.current` (`style.css:829-838`). That means a `--section-wash` fill, a family-ink border, and the number box filled in.
  - A mono "Editing" tag sits where cook mode says "Now".
  - Ingredient rows get the same treatment.
  - Today the open form is a grey box inside a family-tinted sheet.
- **The fields keep the sheet's type.**
  - Labels become mono catalogue captions like the facts box labels: .72rem, uppercase, letter-spaced, muted.
  - The title input is Fraunces in the family ink, so editing the title still looks like the title. The `<h1>` stays in the page, visually hidden, with the form after it. Today it is deleted, which fails the heading check.
  - The step text grows as you type.
  - Wait and Cue carry the same clock and tick glyphs as the lines they make.
  - **Every input is at least 16px.** Today they're 15.2px (`style.css:1447-1449`), so the iPhone zooms in on every tap into a field.
- **The buttons, in one row:**
  - Left: **Done** (family fill) and **Cancel**. Cancel throws the changes away, like Escape does today, but now you can see it. Cancel on a just-added empty line removes the line.
  - Middle:
    - "Add a step after this" / "Add an ingredient after this";
    - Move up and Move down (off at the ends);
    - "Move to…" (a list of positions under their group names);
    - Split and Join.
  - Right, after a divider: **Remove**, in the error colour's outline. It's never next to Done. It works at once, and Undo brings the line back.
  - The six equal pills that wrap into three or four rows on a phone go away (`vis-x-stepform-390.png`).
- **Moving in prep-first order.** When the sheet shows prep first, moves would act on an order you can't see. So the move buttons are replaced by "Switch to As written to reorder".
- **A step's lineup settings open inside the step.** This needs your OK, because the spec says "in Details, per step" (design.md:152, 162).
  - Below Step, Wait and Cue there's a fold-out, "For the lineup". It's closed by default, and its summary says what's set: "Burner · 5 min hands-on · uses 3".
  - It opens by itself when the step has a lineup error or to-do. That way an oven or hands-on error lands where you can fix it.
  - Inside:
    - **Uses** as chips grouped under the ingredient group names ("CRUST", "FILLING"), so the two "Sugar"s can be told apart. These are still real checkboxes underneath. Ticked ones come first, then ones the step's text mentions. Nothing is hidden or ticked for you.
    - "Amount for this step" appears only next to a ticked chip.
    - Equipment (burner, oven with temperature, grill, microwave) in a compact grid.
    - Hands-on time and Prep side by side.
    - "Needs you the whole wait", only when there's a wait.
    - "It doesn't wait".
    - "Happens during the step before's wait", offered only when it's allowed, with the reason when it isn't.
    - "Keeps as long as you like after this step" as one checkbox. Ticking it clears it from any other step (`setHolds`, `edit-model.mjs:154`). It replaces the radio group spread across 14 fieldsets.
  - Details then drops from 17,000px to a short page for Babkallah.
- **Notes, Before you start and the facts box** open in place the same way.
  - Each note and each Before-you-start item is a line with Edit.
  - Quiet ghost rows invite you in when a section is empty: a dashed family-ink outline, muted text, "No notes yet. Add one". Nothing is written into the recipe until you type.
  - Tapping the facts box opens a "Facts" form:
    - yield;
    - the printed times as label and value rows ("Rise · 1 to 2 hr"), with add, remove and reorder;
    - under them, "For filters and the lineup: Total 40 min". The minutes live here, with a hint when Total is less than the parts add up to;
    - for baking: pan and oven heat;
    - for cocktails: glass ("Sets the drawing"), ice, garnish, method, keeps, ABV and standard drinks ("Sets the strength filter").
- **Motion.**
  - A 150ms wash fades in on the opened line.
  - A brief wash flash shows on a line after it's moved, added, split, joined or undone. After a Remove, the flash goes on its neighbour.
  - The site's reduced-motion rule (`style.css:1103-1104`) already turns all of this off.

### Details becomes short and tidy

- With the per-step settings gone, Details holds only what the page doesn't show: Kind, Tags, Drawing, Source, Date added, Serving and Can sit.
- Restyle it like the sheet:
  - its heading like a section heading, with a mono caption "Not on the page" and a chevron instead of the browser's ▶;
  - each group as a specimen-label box like `.facts` (family border, wash header strip), instead of browser fieldsets with legends on the border (`vis-edit-details-light-390.png`);
  - `accent-color: var(--section)`, so checkboxes match the family;
  - selects at a sensible width, not stretched to 698px.
- **Tags:** a filter box on Key ingredients, picked chips first, and a counter, "2 of 1–4 picked".
- **Drawing:** a grid of the 29 drawings as small pictures with plain names ("Nick & Nora"), with "Picked for you" first.

### Phone vs laptop

- **Phone (under 600px):**
  - one column with 16px gutters;
  - the sticky slim bar, with the site header hidden while you type;
  - the open line in place, scrolled just into view;
  - Details folded after the sheet.
  - **The original** on an imported recipe: a "Show the original" button in the bar opens it as a sheet over the page, so you don't scroll to the top. Later, a "Show this step in the original" link highlights the matching lines, since the intake already knows which sentences made which step.
- **Tablet and small laptop (600–1439px):** the sheet at the live page's width, with Details below it.
- **Wide laptop (1440px and up), if you agree:**
  - a 320px sticky rail beside the full 1080px sheet, holding Details, the to-do list and "What's changed";
  - for an imported recipe, the original keeps the rail. Below 1440px the sheet and the rail don't both fit, so it stays one column.
  - Leave the intake page's own layout alone; it shares those styles.

### Colour for problems (show you before changing)

- **Errors get their own colour, outside the three family inks.**
  - Today errors use the baking orange (`style.css:1408, 1425, 1427, 1434, 1494`). On a baking recipe an error under a step looks exactly like the "✓ Pale gold at the edges" cue (`vis-edit-error-step-light-390.png`).
  - Starting values to judge: a deep raspberry, `#a8123f` on `#fbeff2` in light mode and `#ff8fae` on `#33191f` in dark.
- **Errors also get a small flag glyph**, drawn the same way as the clock and tick, so colour isn't the only sign.
- **A step with an error gets a 3px raspberry bar down its left edge,** so you can spot it while scrolling.

---

## 5. Accessibility and phone fixes

These were found with axe (including the newer WCAG 2.2 checks) and by driving the editor with the keyboard and at 390px wide.

- **Focus loss in Details** (high). See 3A: tapping or tabbing to the next field drops focus and closes the phone keyboard.
- **Escape on the group rename and new-group forms** leaves focus on nothing. Send it back to the group heading or the "Add a group" button, as Done already does (`edit.mjs:695-696`).
- **Tap targets that are too small:**
  - group headings are 17px tall and fail the WCAG 2.2 size check;
  - the yield button is 10×25px;
  - buttons are 40px tall;
  - checkboxes are 13px.
  - Make the small ones at least 44px on touch screens. Only the small ones, so the sheet's rhythm doesn't change.
- **Say that lines are editable.**
  - Today the yield is announced as "4, button".
  - Add `aria-description="Edit"`. Put it next to the existing error links in `aria-describedby`, don't replace them.
  - Don't put "Edit" into the button's name: tests find lines by their text.
- **Name the form:** "Edit step 3", and "Done with step 3".
- **Announce changes** through the one lasting status line: "Removed step 4", "Step 5 moved to 2", "Joined steps 3 and 4".
- **Keyboard:**
  - **Skip links:** to the recipe, to Problems, to Save. Today it takes 20 Tabs to reach step 2, and 83 to reach Details.
  - **Shortcuts:**
    - Cmd/Ctrl+S saves (after keeping the open form);
    - Cmd/Ctrl+Enter is Done, including in the step text;
    - Escape is Cancel;
    - Cmd/Ctrl+Z is Undo when you're not in a text field.
- **Phone keyboard hints:**
  - `enterkeyhint="done"` on single-line fields;
  - `autocapitalize="off"` on Wait, Hands-on and Amount;
  - accept "350°F", "350 F" and "175 °C" in oven fields and store them as 350F / 175C, instead of failing the check (`recipe-checks.js:92`).
- **16px inputs** so the iPhone stops zooming (see section 4). Add a test that checks the computed font size.
- **Offline.** An imported recipe opens offline from the browser draft but only fails at Save. Show "Offline: can't save yet" in the bar instead.
- **Accessibility scan.** Every new state goes into `PAGES` in `tests/e2e/accessibility.spec.mjs`, in light and dark, as each piece lands. Before turning on the WCAG 2.2 checks for the whole site, run them once and list anything new for you.

---

## 6. Build order

Each item is one candidate pull request. S is about a day or less, M a few days, L a week or more. Each one starts with a failing test, per the testing rules. Browser tests check what you see (roles, labels, text) and use the keyboard to check where focus lands.

A step is marked **Done** once its pull request is merged.

1. **Done** (#44, 2026-11-10). **(S) Edit button on each step, plus "Add a step after this".** This is the change already agreed.
   - Model: `add(recipe, key, {after: n})` inserts into the same group as step n (`edit-model.mjs:227-233`). It gets unit tests, including across groups and on an imported recipe (the new step needs an intake id).
   - UI: a visible "Edit" button on each step line (named "Edit step 3"), and "Add a step after this" in the open step form.
   - Browser test: add after step 2 of 4 and see it as step 3.
2. **Done** (#45, 2026-11-10). **(S) Ingredients get the same.** An "Edit" button on each ingredient, "Add an ingredient after this", and the form focuses the field for the part you tapped (amount or name).
3. **Done** (#46, 2026-11-10). **(M) Never lose typing.**
   - Keep the open form's text when you tap another line, and before Save.
   - Add a visible Cancel. Cancel on a just-added empty line removes it.
   - Escape focus on group forms.
   - Write the open form into the browser draft as you type, so a reload brings it back.
   - Make the preview links inert, keeping their `href`.
   - Tests:
     - switch lines and the text is kept;
     - Save with a form open sends the open text;
     - the sign-in-expired (401) case keeps it too.
4. **Done** (#48, 2026-11-11). **(S) Fix the focus jump in Details.** Test: Tab from "Hands-on time" lands on the next field.
5. **Done** (#49, 2026-11-11). **(S) Make the editor look like the sheet again.**
   - Numbering 1–n across groups.
   - Uppercase group headings.
   - No hover box.
   - Lettering at rest, and the clean ingredient form.
   - 16px inputs.
   - Full-width sheet on laptops (drop the 760px cap).
6. **(S–M) Renaming or removing an ingredient carries through to its steps.**
   - Use the checker's own matching rule (name plus group when names repeat).
   - Group renames update uses too.
   - Status: "Also updated steps 1 and 3".
   - Unit tests: a rename, duplicate names across groups, remove, group rename, and an imported recipe's "check this amount" flag still attaching.
7. **(M) The sticky bar.**
   - Title and section caption; "Unsaved changes" / "No changes".
   - Family-fill Save, off when nothing changed (not for new recipes, restored drafts or after a conflict).
   - A lasting status line that keeps the "See X on the site" link.
   - Cmd/Ctrl+S.
   - Hide the site header while typing on a phone.
   - Update the tests that check the bar's text.
8. **(S) Drafts remember which version they started from.** If the site's version changed since, say so before "Bring back my changes", and don't silently overwrite.
9. **(M) Undo and Redo.**
   - Snapshots of the recipe and, for imported recipes, the intake review.
   - Capped at 50 and cleared on Save.
   - Buttons in the bar; Cmd/Ctrl+Z outside text fields.
   - Undo closes any open form and focuses the restored line.
   - No timed pop-ups.
10. **(S) One step number in every message.** Rewrite "step N" in errors, to-dos and Details to the number shown on the sheet. For an added prep step while "As written" is showing, name it by its first words, with a button to show prep first.
11. **(M) Split done right.**
    - The cursor starts at the end.
    - "Split here" says "Put the cursor where the new step starts" instead of failing silently.
    - The wait, cue and "needs you" go with the half whose text contains that time.
    - Equipment goes with the wait; holds and preheat stay on one half.
    - Uses stay on the first half, with a "Check what step 3 uses" note. No guessing.
    - Unit test with the garlic soup step.
12. **(M) Notes and Before you start, editable in place.** Notes allow groups; Before you start never does. Ghost "Add a note" rows.
13. **(S, after you choose colours) The error colour and flag.**
14. **(M) Problems and to-dos in a cook's words, with "Go to" buttons.**
    - A wording table with a unit test that runs every checker message through it, so a wording change in the checker fails loudly.
    - Fix buttons for "no key ingredients tagged" and "no total time".
    - To-dos fold into the strip; Problems stay visible.
15. **(M) Moving lines.** Move up and down are off at the ends, plus "Move to…", and the prep-first rule ("Switch to As written to reorder").
16. **(L, after your OK) A step's lineup settings inside the step.**
    - Move the Details tests to the step form with the same labels.
    - Re-point the "Set step N's equipment" to-do to open the step.
    - Update design.md:152/162 in the same change.
    - On an imported recipe, the intake's own "Needs you there" and "Done while an earlier step waits" checks win while they're live, so nothing shows twice.
17. **(M) The Facts form**, part 1: yield, printed times and the minutes, with the mismatch hint.
18. **(M) The Facts form**, part 2: baking and cocktail facts.
19. **(M) Small step fields.** "It doesn't wait", "During", oven temperatures in any common form, and "Add ml" on any ingredient.
20. **(M) Category and Kind.**
    - Category goes in the About form. Before switching, it lists the tags that will be dropped. Undo works. The page recolours live.
    - Kind no longer deletes an explicit `"kind": "dish"`, so 27 files don't change for nothing.
21. **(M) Start from scratch.**
    - `edit.html?new=cooking|baking|cocktails` opens a blank sheet with its own draft key (never `sss:intake`, which would clash with an import in progress).
    - Empty fields are left out of the JSON.
    - Bare `?new` with nothing waiting offers "Bring one in" or the three sections, with the family drawing.
22. **(M) Pickers.** The tag filter with the "1–4" counter, and the drawing grid with plain names.
23. **(M) Details restyled** as specimen labels (CSS only, after 16).
24. **(M) "What's changed".**
    - A read-only list from the bar's change state: "Butter: 100 g → 115 g", "Removed: Thyme", "Tags: + lemon", with numbers that changed first.
    - Also shown in the draft offer.
    - It never blocks Save unless you choose that in section 7.
25. **(M) Checking imports on a phone.**
    - The original opens over the page from the bar.
    - A "Checked" tick next to each amount on an imported recipe, cleared when the amount is edited.
26. **(M) Keyboard and screen reader polish.** Skip links, shortcut help, 44px targets, and the WCAG 2.2 checks for editor pages.
27. **(S) Motion.** The open-line fade and the moved-line flash.
28. **(M) Extras.** Wait chips on phones, "Paste lines" on Ingredients, Steps and Notes, and turning a plain-text ingredient into amount plus name.
29. **(M–L, after your OK) The wide-laptop side rail.**

Deferred: the hero image control, "Tidy up with AI" (slice 8), and the intake's "Couldn't place" list. That last one needs the intake to keep its stray lines first.

---

## 7. Decisions

Jacob answered the open questions on 2026-11-10.

1. **A step's lineup settings move into the step,** in a folded "For the lineup" panel (build step 16). The spec's "in Details, per step" (design.md:152, 162) is updated in that change.
2. **Errors get the raspberry colour and the flag** (build step 13). The contrast numbers are shown before the colours change.
3. **The card preview is compact on a phone,** not full size and not folded away.
4. **The Edit button shows the pencil and the word "Edit"** where there's room, and only the pencil where there isn't (a narrow screen, or a narrow ingredient column). Screen readers hear "Edit step 3" either way.
5. **The side rail on wide screens (1440px and up) is a yes, but later** (build step 29). For an imported recipe, the original keeps the rail.
6. **A saved recipe can move to another section,** with a warning that lists the tags it would lose (build step 20). Jacob also asked whether a recipe should be able to be in **more than one section** (blueberry syrup in Cooking, Baking and Cocktails). That's a bigger change to the recipe format, the index and the section pages, so it's in `docs/ideas.md` as its own idea. Moving between sections should be built so it can later become picking several.
7. **"What's changed" shows before Save only when an amount, time or temperature changed.** Other edits save in one tap, with the list one tap away (build step 24).
8. **On the first Save of an import, a gentle reminder** names the amounts not yet ticked "Checked". It never blocks (build step 25).
9. **The site header hides on a phone while you type** in an open form (build step 7).
10. **When splitting, the wait goes with the half whose text has that time,** else the second half. Steps with several times also offer **"Split at each time"** (build step 11).
11. **`"kind": "dish"` stays as each file has it.** Saving never removes it (build step 20).
12. **No photo control yet.** It waits for the step-images project.
