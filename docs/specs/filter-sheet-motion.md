# Slide the recipes page's filter sheet in and out

- **Status**: Done
- **Commit**: adc237a (`assets/style.css` had uncommitted editor step 27 edits when this was written. None of them touch the lines below, but start from a branch cut from `main` after step 27 merges.)
- **Severity**: MEDIUM
- **Category**: Missed opportunities (Physicality & origin, Accessibility)
- **Estimated scope**: 2 files. About 35 lines of CSS in `assets/style.css` and 1 line in `tests/e2e/accessibility.spec.mjs`. No JavaScript changes.

## Problem

On `recipes.html`, tapping a filter button (Cuisine, Ingredients…) opens an option panel. On a phone (narrower than 720px) it's a bottom sheet over a dimmed backdrop. On wider screens it's a dropdown under its button. Today the panel and its backdrop only flip the `hidden` attribute, so they appear and disappear in a single frame. A bottom sheet with no slide doesn't read as a sheet, and the dropdown has no visible tie to the button that opened it.

The JavaScript only toggles `hidden`, and it stays that way:

```js
/* assets/home.mjs:77 — current */
function openSheet(key) {
  openDim = key;
  els.sheet.hidden = els.backdrop.hidden = false;
  document.body.classList.add("sheet-open");
  render();
  placeSheet();
  els.sheetDone.focus({ preventScroll: true });
}
function closeSheet() {
  if (!openDim) return;
  const key = openDim;
  openDim = null;
  els.sheet.hidden = els.backdrop.hidden = true;
  ...
}
```

The markup is in `recipes.html:47-48`: `<div class="backdrop" id="backdrop" hidden>` and `<div class="sheet" id="sheet" role="dialog" ... hidden>`.

The CSS:

```css
/* assets/style.css:459-470 — current */
/* Option panel: a bottom sheet on phones, a dropdown under its button on wider screens. */
.backdrop { position: fixed; inset: 0; z-index: 20; background: var(--scrim); }
.sheet {
  position: fixed; z-index: 21; left: 0; right: 0; bottom: 0;
  max-height: 75vh; display: flex; flex-direction: column;
  background: var(--surface); border-radius: 14px 14px 0 0;
  border-top: 4px solid var(--section);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
.sheet[hidden], .backdrop[hidden] { display: none; }
```

```css
/* assets/style.css:506-514 — current */
@media (min-width: 720px) {
  .backdrop { background: transparent; }
  .sheet {
    position: absolute; left: 0; right: auto; bottom: auto; top: 100%;
    width: min(420px, 100%); max-height: 60vh;
    padding: 0;
    border: 1px solid var(--section); border-top-width: 4px; border-radius: var(--radius-ctl);
  }
  body.sheet-open { overflow: auto; }
}
```

```css
/* assets/style.css:1113-1116 — current */
/* ===== Motion ===== */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
}
```

The site has no easing tokens. Every transition uses plain `ease`.

## Target

**Phone (below 720px):**
- The sheet slides up from the bottom edge, `translateY(100%)` to `none`, over `320ms` with the drawer curve.
- The backdrop fades in from `opacity: 0` over `200ms` with ease-out.
- On close, both go back the way they came: the sheet slides down off the same edge and the backdrop fades out.

**Wider screens (720px and up):**
- The dropdown grows from its top-left corner, under its button: `scale(0.97)` with `opacity: 0` to settled, over `160ms` with ease-out.
- It reverses the same way on close.
- The backdrop there is transparent and only catches clicks outside, so it doesn't animate. It goes away at once.

**Both:**
- Entry uses `@starting-style`. Exit keeps the element shown until its transition ends, via `transition-behavior: allow-discrete` on `display`. No JavaScript changes.
- While closing, neither the sheet nor the backdrop catches taps (`pointer-events: none` on `[hidden]`). A tap right after Done must reach the page, not a backdrop that's fading out.
- Reopening a filter while the sheet is still closing reverses from wherever it is. Transitions retarget on their own. Don't use keyframes.
- **Reduced motion:** no movement. The sheet and backdrop only fade, `200ms` with ease-out.

Exact values (from the Emil Kowalski motion catalog; don't round or approximate):

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

## Repo conventions to follow

- Tokens live in the single `:root` block at the top of `assets/style.css` (lines ~80–141), grouped under short `/* Heading */` comments: `/* Shape */`, `/* Type */`, `/* Glyphs ... */`. Add a `/* Motion */` group the same way, between `/* Type */` and `/* Glyphs */`. The dark-mode block doesn't redefine shape or type tokens, so these don't need a dark copy either.
- Comments explain *why*, in plain sentences, for example `/* Done lines: a clear strike in the family ink, over readable graphite. */`. Write the new comments in that voice.
- Existing transitions are written like `transition: border-color .15s ease;`. Write the new ones in `ms` as given here. Don't rewrite other transitions.
- Reduced motion has one home: the `@media (prefers-reduced-motion: reduce)` block under `/* ===== Motion ===== */` (line ~1114). Put the sheet's override there, after the `*` rule.

## Steps

1. **Add the tokens.** In `assets/style.css`, inside `:root`, directly after the `/* Type */` group (after the line `--soft: "SOFT" 100, "WONK" 0;`), insert:

   ```css

     /* Motion: strong curves, so things start fast and settle softly.
        ease-out for things arriving or leaving, ease-in-out for things
        moving on screen, drawer for sheets that slide in from an edge. */
     --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
     --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
     --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
   ```

2. **Phone sheet and backdrop.** In `assets/style.css`, replace lines 460–470 (from `.backdrop { position: fixed; ...` through `.sheet[hidden], .backdrop[hidden] { display: none; }`) with the block below. The `.sheet` rule stays the same except for the last two lines added inside it.

   ```css
   .backdrop {
     position: fixed; inset: 0; z-index: 20; background: var(--scrim);
     transition: opacity 200ms var(--ease-out), display 200ms allow-discrete;
   }
   .sheet {
     position: fixed; z-index: 21; left: 0; right: 0; bottom: 0;
     max-height: 75vh; display: flex; flex-direction: column;
     background: var(--surface); border-radius: 14px 14px 0 0;
     border-top: 4px solid var(--section);
     padding-bottom: env(safe-area-inset-bottom);
     padding-left: env(safe-area-inset-left);
     padding-right: env(safe-area-inset-right);
     transition: transform 320ms var(--ease-drawer), display 320ms allow-discrete;
   }
   /* Closed: gone, but only once it has slid away. Closing never catches a tap
      meant for the page underneath. */
   .sheet[hidden], .backdrop[hidden] { display: none; pointer-events: none; }
   .sheet[hidden] { transform: translateY(100%); }
   .backdrop[hidden] { opacity: 0; }
   /* Opening: the sheet rises from the bottom edge and the backdrop fades in. */
   @starting-style {
     .sheet:not([hidden]) { transform: translateY(100%); }
     .backdrop:not([hidden]) { opacity: 0; }
   }
   ```

3. **Dropdown on wider screens.** In the `@media (min-width: 720px)` block (currently lines 506–514), change `.backdrop { background: transparent; }` to:

   ```css
     .backdrop { background: transparent; transition: none; }
   ```

   Then, inside the same `.sheet { ... }` rule, after `border: 1px solid var(--section); border-top-width: 4px; border-radius: var(--radius-ctl);`, add:

   ```css
       transform-origin: top left;
       transition: transform 160ms var(--ease-out), opacity 160ms var(--ease-out), display 160ms allow-discrete;
   ```

   Then, still inside that media block and after the `.sheet { ... }` rule, before `body.sheet-open { overflow: auto; }`, add:

   ```css
     /* A dropdown grows from its button's corner instead of sliding up. */
     .sheet[hidden] { transform: scale(0.97); opacity: 0; }
     @starting-style { .sheet:not([hidden]) { transform: scale(0.97); opacity: 0; } }
   ```

4. **Reduced motion.** In the `@media (prefers-reduced-motion: reduce)` block (line ~1114), after the existing `*, *::before, *::after { ... }` line, add:

   ```css
     /* The filter sheet still fades, so it doesn't blink in and out, but never moves. */
     .sheet, .backdrop { transition: opacity 200ms var(--ease-out), display 200ms allow-discrete !important; }
     .sheet, .sheet[hidden] { transform: none; }
     .sheet[hidden] { opacity: 0; }
     @starting-style { .sheet:not([hidden]) { opacity: 0; } }
   ```

   This `!important` beats the `*` rule's `!important` because `.sheet` is more specific than `*`.

5. **Let the accessibility scan wait for the fade.** `tests/e2e/accessibility.spec.mjs` runs with `reducedMotion: "reduce"`, so the sheet now fades in over 200ms. Playwright treats an `opacity: 0` element as visible, so axe could check colour contrast mid-fade and report a false failure. In the `PAGES` entry `"index page with a filter open"` (line ~20), replace:

   ```js
       await expect(page.getByRole("dialog", { name: "Cuisine" })).toBeVisible();
   ```

   with:

   ```js
       const sheet = page.getByRole("dialog", { name: "Cuisine" });
       await expect(sheet).toBeVisible();
       // Scan the panel once it has faded in, not halfway.
       await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
   ```

   This doesn't weaken the scan. It scans the settled panel, for the same reason the file already turns on reduced motion.

## Boundaries

- Do NOT touch `assets/home.mjs`, `recipes.html` or any other page. This is CSS only, apart from step 5.
- Do NOT add motion to anything else: not the filter buttons, chips, cards or other popovers. Other ideas get their own plans.
- Do NOT change any existing transition values or the `*` reduced-motion rule.
- Do NOT use `@keyframes`. Transitions are what make close-then-reopen retarget smoothly.
- Do NOT add dependencies.
- Don't add a browser test for the motion itself. `.claude/rules/testing.md` keeps visual and timing checks out of the suite, and Playwright's click waits out the exit anyway. The feel check below covers it.
- If any "current" excerpt above doesn't match the file (drift since `adc237a`), STOP and report instead of improvising.

## Verification

- **Mechanical**:
  - `npx playwright test index-page accessibility --project=chrome`, then the same with `--project=webkit`. All pass.
  - Then `npm run test:all`. This is a layout and timing change, and Safari's support for `@starting-style` and `allow-discrete` is newer, so the WebKit run counts. All pass.
  - Don't start a browser run while another one is running on this Mac. If port 8123 is taken, use `TEST_PORT=8124` and report what holds it.
- **Feel check** (in a browser at phone width, 375×812, and at desktop width):
  - Phone: tap Cuisine. The sheet rises from the bottom edge and the backdrop darkens at the same time. Nothing scales or fades in from the centre.
  - Phone: tap Done. The sheet slides back down the same edge, not up and not just vanishing. Tap a recipe card right after Done: the tap opens the card and isn't swallowed by the fading backdrop.
  - Phone: tap Cuisine, then tap the backdrop as soon as the sheet starts rising. It reverses from where it is, with no jump back to the start.
  - Desktop: click Cuisine. The panel grows from its top-left corner, just under the button. Click a far-right filter whose panel gets pushed left to stay on screen: the corner origin still looks right (if it looks wrong, report it rather than fixing it).
  - Desktop: picking options inside the open panel (it redraws its contents) must not replay the entrance.
  - In DevTools' Animations panel, set playback to 10%. The sheet's motion starts fast and eases into place, never slow at first. The exit lasts 320ms on a phone and 160ms on desktop.
  - In DevTools' Rendering panel, emulate `prefers-reduced-motion: reduce`. The sheet and backdrop fade in and out with no movement at any width.
  - Check both light and dark mode: the backdrop's scrim fades in both.
- **Done when**: the browser runs above pass in Chrome and WebKit, and every feel-check item holds at both widths.
