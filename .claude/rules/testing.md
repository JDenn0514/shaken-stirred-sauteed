# Testing

- `npm test` runs everything: `npm run check` (the quick checks: lint with Oxlint, broken links, the recipes, and `npm run test:unit`, the recipe and link checker tests on Node's built-in runner) and `npm run test:e2e` (browser tests, Playwright driving the installed Google Chrome, then Playwright's WebKit for Safari; `--project=chrome` or `--project=webkit` runs just one).
- `npm run check` also runs as a git pre-push hook (`.githooks/pre-push`, turned on by `npm install`). Don't skip it with `--no-verify` to get a push through; fix what it finds.
- Run `npm test` before saying a change to the site's code is done, and before committing one. If anything fails, show the output; don't call it done.
- Adding or editing a recipe's JSON doesn't need new tests; `node scripts/build-index.mjs` is the check for that.

## Write the test first

- For a new feature or a change in behaviour in the site's JavaScript, HTML or `scripts/`, use the `mattpocock-skills:tdd` skill: write a failing test, watch it fail for the right reason, then write the code.
- For a bug, first write a test that reproduces it and fails.
- The welcome page only has the accessibility scan. When changing it, start by testing the behaviour you're about to touch.

## What a good test looks like here

- Test what a visitor sees and does: roles, labels, visible text, the URL. Avoid internal function names and styling classes, so tests survive redesigns.
- Browser tests import `test` and `expect` from `tests/e2e/fixtures.mjs`, not from `@playwright/test`. The fixture blocks every request that isn't to the local test server and serves the fixed test recipes.
- Browser tests use the test recipes in `tests/e2e/fixtures.mjs`, never the real ones, so adding a recipe never breaks a test. Add a test recipe when a test needs a new case.
- Checker tests go through `tests/helpers/build-index.mjs`, which runs the real build script on throwaway recipes. Link checker tests go through `tests/helpers/check-links.mjs` the same way.
- Lint findings: fix the code. Only switch a rule off in `.oxlintrc.json` if it fights the codebase's style rather than catching mistakes, and say why in a comment there.
- The current recipe step has `aria-current="step"`, and tests check that. A step's "done" state is only shown by styling today, so `tests/e2e/recipe-page.spec.mjs` checks the `done` class. When done steps expose that state to assistive tech, switch those tests to it.
- `tests/e2e/accessibility.spec.mjs` scans each page in light and dark mode. When adding a page or a new state of one (an open panel, a new mode), add it to `PAGES`. Fix what the scan finds rather than turning a check off. Colour fixes are design decisions, so show the user what failed before changing colours.
- When a test you didn't expect to fail fails, decide whether the code or the test is wrong. The README describes how the site should behave. Never weaken or delete a test just to get it passing. If behaviour is meant to change, say which test changed and why.

## Not tested on purpose

Screenshot comparisons (the design still changes often), offline mode (the service worker only runs over HTTPS), the print layout and "Keep screen on".
