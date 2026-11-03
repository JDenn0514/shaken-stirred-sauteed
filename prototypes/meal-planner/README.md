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

## Layout mockups (Lineup)

`lineup-prototype.html` at the repo root, with `prototypes/lineup-ui/`. It shows three layouts (A: one long page, B: step by step, C: menu card), each on eight screens: the lineup page empty, searching and ready; the recipe page before and after adding; the recipes page; and cook mode on a step and in a gap. Switch layouts and screens from the bar at the bottom, or the URL hash (`#b-ready`). Run `python3 -m http.server 8000` in the repo and open `/lineup-prototype.html`. It uses the site's real stylesheet and recipe list; nothing behind the buttons works. (Published at https://claude.ai/artifact/4qmYGSPQcdKCuEqQ5HAe3i, private to Jacob.)

### Round 2

`lineup-prototype-v2.html` (script `prototypes/lineup-ui/lineup-ui-v2.js`), published at the same link as round 1. It's one combined layout from Jacob's picks:

- **Empty lineup page:** A's, saying "Let's make something".
- **Search:** C's compact rows and type tabs, with "Back to your lineup" at the top.
- **Ready to cook:** C's menu card.
- **Recipe page:** A's "+ Add to lineup" button. The lineup link sits in the row with the back link, not in the header, and the top of the page doesn't change once the recipe is added.
- **Browsing:** B's tape marker.
- **Cook mode:** A's, with "Next step".
- **Waits:** a "Wait about 12 minutes" step, with a ring that empties and a Start timer button.

Options remain for two open questions: how sub-recipes sit on the menu card (three options), and what tapping "In your lineup" does (two options).

### Round 3

`lineup-prototype-v3.html` (script `prototypes/lineup-ui/lineup-ui-v3.js`), published at the same link. Jacob's answers on sub-recipes:

- **Optional parts aren't added automatically.** A "Goes with" dropdown offers them.
- **Required parts are added for you,** like the syrup for blueberry whipped cream and the garlic paste for the potatoes. Each is "Make it" or "Already made".
- **Already-made parts stay listed,** because they still go into the dish.
- **A component can be a dish on its own.**

The round also covers waits that ring until you press Stop (two options for what Stop does), and another dish's timer ringing in the middle of a step.
