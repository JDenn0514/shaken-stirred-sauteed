# Domain Docs

How the engineering skills should use this repo's domain documentation. The repo has one context: `GLOSSARY.md` and `docs/adr/` at the root.

## Before exploring, read these

- **`GLOSSARY.md`**: the project's terms (Owner, Member, Cookbook, Copy and the rest), with the words to avoid.
- **`docs/adr/`**: read the ADRs that touch the area you're about to work in.
- **`docs/specs/`**: the design for the feature you're working on, if it has one.

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a proposal, a test name), use the term as `GLOSSARY.md` defines it, not a word it lists under _Avoid_ (`REVIEW.md`, item 7).

If the concept you need isn't in the glossary, either you're inventing language the project doesn't use (reconsider) or there's a real gap: add the term with the `mattpocock-skills:domain-modeling` skill.

## Flag ADR conflicts

If your output contradicts an ADR, say so rather than silently overriding it, for example:

> _Contradicts ADR 0002 (a copy is a snapshot), but worth reopening because…_
