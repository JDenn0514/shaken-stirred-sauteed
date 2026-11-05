# The planner's rules across many lineups

From `tools/lineup-test/invariants.mjs`, 2026-11-04. Every plan is checked
against what a good plan must never do. Run it after any planner change:

```sh
node tools/lineup-test/invariants.mjs                 # 248 lineups, reviewed recipes
node tools/lineup-test/invariants.mjs --code          # the same, as code alone restructures the recipes
node tools/lineup-test/invariants.mjs --random 1000   # 1,048 lineups
```

## First run: what it found, and what was fixed

| Problem | Lineups (of 248) | Cause | Fixed |
|---|---|---|---|
| Steak left in the pan 48 minutes; dishes ready after serving; long idle stretches | 13 | When not every hot dish could be fresh, the fallback picked a plan made for an earlier serve time, with the cook "at the table" mid-cook | Sitting times are loosened 5, 10, 20, 40, 80 minutes until a plan works |
| "No order works" (lime bars + pavlova) | 1 | Both dishes shared the oven at 350F, then each waited for the other to free it at its next setting | Dishes share the oven only if at most one changes its setting later |
| Oven still "at 350F" after a pavlova turned it off | (found fixing the above) | Only heating steps updated the oven's setting | Turning it down or off updates it too |
| Roast then meringue planned at 126 min, about 80 possible | (from step 1) | Turning the oven down was charged 15 minutes of heating | No heating time to turn it down, as the design says |
| Curd's juice simmering 4 minutes too long | 2 | A pot's next step could run past another pot being ready | The room applies between pots; when both are ready, the shorter step goes first |
| Food left on the heat waiting for a linked recipe | 24 | Mostly the check: it didn't pass "already made" as the page does | Check fixed |

## Now (1,048 lineups, reviewed and code-only recipes)

- Every lineup plans. Never two things at once, a step before its dish is
  ready, a linked recipe used before it's made, more than four burners, or the
  oven at two settings.
- **Food on the heat a few minutes past ready:** 20 of 1,048 lineups (4 with
  code-only recipes), 3 to 5 minutes, when two pots are ready at the same
  moment and one must wait, or a pot simmers on until serving. A cost of one
  cook, not a broken rule.
- **Hot dishes sitting past their limit:** 56 of 1,048 lineups, when not
  every hot dish can be fresh. Median 5 minutes over; the worst (66 to 80
  minutes) are two long oven dishes at different temperatures, such as
  hasselback potatoes and the havarti sandwich, where one oven means one must
  finish first. The plan should tell the cook when this happens (next: what the
  planner gives the page).
