# Meal planner prototype (throwaway)

This branch keeps a throwaway prototype as a record. It is never merged. The design it led to is in `docs/specs/meal-planner-design.md` on the main line of work.

**The question:** can a simple planner order the steps of several recipes for one cook well enough that Jacob would follow it? The planner fills each dish's waits with another dish's hands-on steps, keeps oven clashes apart, and works back from serve time.

**Verdict (2026-11-03): yes, with three additions** that the first version lacked:

1. Count the oven's or broiler's heat-up time when the very next step needs it hot.
2. When a dish would come out late, plan it (or whatever had the oven it waited for) to finish a little earlier, but only as long as that dish can sit.
3. Steps can mark the point after which a dish keeps (a cooled meringue), so only what comes after it is tied to serve time.

Jacob's calls after clicking through it:

- Applesauce during the potatoes' first bake, rather than first, is fine.
- When a dish holds the oven for hours (pavlova on the same day as dinner), ask the cook whether to make it ahead or do it all the same day.
- Dessert gets its own serve time after the main.
- Asparagus sitting about 8 minutes between roasting and broiling is fine.

## Files

- `meal-planner-prototype.html`: the page. Open it in a browser; it needs nothing else. (Published at https://claude.ai/artifact/PCsUtCK1ZNasUfNT1tNZ2e, private to Jacob.)
- `planner.js`: the planner itself, pure functions with no page code. This part is meant to be reused.
- `library.js`: the recipes in the meals, with the planning data filled in by hand (Claude's estimates).
- `run.cjs`: `node prototypes/meal-planner/run.cjs` prints the order for each meal.
