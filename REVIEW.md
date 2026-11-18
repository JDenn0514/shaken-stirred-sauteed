# Reviewing a change

What matters in this repo, for anyone reviewing a diff (a person, `/code-review`, or a subagent). PRs here usually merge once CI passes, so this review is often the only one.

## What failure looks like here

Look hardest for these, in this order:

1. **Lost work.** The editor saves over someone else's change, drops a field it has no control for, loses an unsaved draft, or deletes a recipe another one uses.
2. **The Worker lets in what it shouldn't.** Anyone without push access can save; `/api/fetch` reaches a private or local address (after a redirect too) or works signed out; a cookie or token leaks; sign-in sends you somewhere outside the site.
3. **The cook loses their place.** Cook mode or the menu skips or repeats a step, a timer stops or rings wrong, progress isn't shared with the recipe page, or the lineup plan breaks a rule in `docs/specs/meal-planner-design.md`.
4. **A recipe shows wrong.** Wrong amounts or missing steps or ingredients, or the recipe checker accepts a recipe the page can't draw.
5. **It stops working for someone.** It can't be reached by keyboard, a control has no label, focus gets lost, the contrast fails, or it breaks in Safari or at phone width.
6. **The code and the README disagree.** One of them is wrong; say which you think it is.

Tests: flag a test that was weakened or deleted to get a run passing, a browser test that checks a rule belonging in a unit-tested module, and a browser test that uses the real recipes. `.claude/rules/testing.md` has the rest.

## Leave out

- What a recipe says: `recipes/*.json` content is the recipe checker's job. `recipes/index.json` is generated.
- `assets/vendor/`, `style-guides/`, `source-pdfs/`, `tests/samples/`, `package-lock.json`.
- Formatting and naming, which lint and taste own.

## Each finding

- Name the file and line, and the inputs or steps that make it go wrong. If you can't point to the line, it's a question, not a finding.
- Tag it **Important** (it breaks something above), **Nit** (works, could be better: three at most) or **Pre-existing** (wrong before this change; not held against it).
- Say whether it's one instance of a pattern, so every instance gets fixed.

Start the summary with the count: "2 Important, 1 Nit." When there's nothing to fix, say "Nothing to fix" and stop.
