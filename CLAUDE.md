# Shaken, Stirred & Sautéed

A phone-first recipe site: plain HTML, CSS and JavaScript modules with no build step, recipes as JSON in `recipes/`, and a Cloudflare Worker (`worker/`) for signing in, saving and fetching recipe pages. The README is the spec for how the site behaves; designs for bigger features are in `docs/specs/`. How to test is in `.claude/rules/testing.md`.

## Done means evidence

- A change is done when you can show it working: the test output, and for anything a visitor sees, the `verify` skill's screenshot and notes. Say what wasn't checked and why.
- When the same check still fails after three attempts at a fix, stop and tell me what fails, what you tried, and what you think is wrong. A fourth guess usually makes it worse.
- Before opening a PR, have a subagent with fresh context review the diff against `REVIEW.md`, and fix or answer each Important finding.

## Checks over sentences

When a rule can be checked by a machine, write the check (a lint rule, a test, a hook) rather than a sentence here, and let its error message explain the fix. Written rules are for judgement calls. When a mistake shows up a second time, turn it into a check.

Checks that run on their own, so you know where a block comes from:

- When you end a turn with changes, a hook runs lint, the link checker and the recipe checker, and hands back what fails.
- Pushing with `--no-verify` is blocked: fix what the pre-push checks find.
- A browser test run stops if another one is already running on this Mac. Wait for it; it may be another session's.

## Agent skills

### Issue tracker

GitHub Issues on this repo, through `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five defaults: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.
