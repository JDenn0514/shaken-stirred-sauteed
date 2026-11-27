---
paths:
  - "worker/**"
  - "wrangler.jsonc"
  - "package-lock.json"
  - "scripts/check-deps.mjs"
---

# Working on the Worker, sign-in or what's saved

- The rules this code holds to are in `docs/specs/multi-user-security.md`: who's asking comes only from the session, each person reaches only their own things, changes only by POST from the site's own pages, every route asks who's signed in first. Read it before changing a route, a D1 query or sign-in.
- A new route goes in the access laws' `ROUTES` (the access-laws test in `worker/test/`); anything a person owns in D1 gets a law that nobody else reaches it.
- Before the PR: `REVIEW.md`'s security section, including Trail of Bits' `/differential-review:diff-review`.
- Changing the Worker's dependencies: `npm run check` fails until `supply-chain-risk-auditor` has looked at them; its message says how.
- Every security report (the `security-audit` skill, Trail of Bits' plugins) goes under `~/security-audit-skill/shaken-stirred-sauteed/`, never in this repo, which is public.
