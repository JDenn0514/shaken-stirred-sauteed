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
7. **A doc uses a word the glossary avoids.** Specs, ADRs, the README and comments say Owner, Member, Cookbook, Copy and the rest as `GLOSSARY.md` defines them, not a word it lists under _Avoid_ (an "editor" for the owner, "shared recipes" for the public recipes). A new term the change relies on goes into `GLOSSARY.md`, and a hard-to-reverse decision gets an ADR in `docs/adr/`.

### When the diff touches the Worker, sign-in or what's saved

Check each of these; a miss is **Important**:

- **Every route asks who's signed in before doing anything,** and refuses with 401 when no one is. A new route is also added to the access laws (`worker/test/access-laws.test.js`); that test fails until it is.
- **Each person only reaches their own things.** Every D1 query that reads, changes or deletes something a person owns is limited to that person (`WHERE user_id = ?`, with the id from the session, never from the request).
- **Nothing a request sends decides who it's for:** a user id, owner or role in the body, URL or a header is ignored, not trusted.
- **Changes only come from the site's own pages** (the `Origin` check `/api/save` has), and only by POST.
- **What's published:** a new top-level file or folder is either meant to be on the web or is in `.assetsignore`.
- **What goes into a page from a recipe or an imported web page** goes through `esc()` or `safeURL`, never straight into `innerHTML`.
- **A second, security-only look:** run Trail of Bits' `/differential-review:diff-review` on the PR, with its report written under `~/security-audit-skill/shaken-stirred-sauteed/`, and answer what it finds like any other Important finding.

Findings from a security audit (the `security-audit` skill) stay outside this repo, which is public: in its default folder, `~/security-audit-skill/`. Each one fixed here gets a test that failed before the fix.

Then read the triggers in `docs/review-checklist.md`, bugs this repo has had before, and run the check for each trigger the diff matches. Say which items fired.

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
