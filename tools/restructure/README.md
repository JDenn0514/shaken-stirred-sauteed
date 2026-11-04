# Restructuring recipes with code alone

An experiment for the recipe intake: how much of the lineup planning data
(`docs/specs/meal-planner-design.md`, "Recipe data changes") can be worked out
from a recipe's text with plain code, no language model, so the intake stays
free to run.

`restructure.mjs` takes a recipe as written and:

- splits steps that combine several timed actions, keeping explanations and
  alternatives ("Or knead it in a stand mixer…") with the step they belong to;
- splits a "per side" time into one step per side, and a wait that holds two
  waits ("30 min ice bath, then about 1 hr fridge") into two steps;
- reads waits, oven settings, heating the oven, burner, grill and microwave
  from the step's actions (not its explanations), and guesses watched waits;
- marks prep (ahead of time, or "just before" for things that brown) and steps
  that run "during" an earlier wait;
- brings out prep hidden in ingredient lines ("garlic, minced") as added
  prep-only steps, skipping prep the recipe's own steps already do, things
  bought that way ("28 oz can diced tomatoes", "shredded parmesan") and
  alternatives in brackets;
- adds a heating step for an oven dish that has none;
- estimates hands-on minutes, scaled to the recipe's active time;
- marks optional ingredients and links ingredients to recipes by name;
- guesses how the dish is served.

## Scoring it

`score.mjs` runs it on the 40 recipes as they were before any planning data
(commit `e300174`) and compares each field with the data Jacob reviewed
(commit `4cb7a3c`):

```sh
node tools/restructure/score.mjs                       # recipes as written
node tools/restructure/score.mjs --plain               # plain text, as a new recipe arrives
node tools/restructure/score.mjs --plain --misses      # list every disagreement
node tools/restructure/score.mjs --plain --out DIR     # write the restructured recipes
```

`--plain` strips the waits, cues and step-ingredient links that the old recipes
already had, so it's the fair test for the intake.

## Results (plain text, 236 steps, 40 recipes)

| Field | First version | After fixing the rules |
|---|---|---|
| Split the same way (one step or several) | 95% | 97% |
| Wait (has one or not) | 87% | 87% |
| Oven setting | 96% | 98% |
| Heats the oven | 99% | 99% |
| Burner | 93% | 94% |
| Grill, microwave | 100% | 100% |
| Watched wait | 90% | 92% |
| During another step's wait | 98% | 99% |
| Prep mark (none, ahead, just before) | 82% | 84% |
| Heating steps added | 93% | 95% |
| Serve | 88% | 95% |
| Sits | 68% | 73% |
| Recipe links | 100% | 100% |
| Optional marks | 95% | 98% |
| Added prep: reviewed prep the code finds | 64% | 80% |
| Added prep: code's prep that's right | 94% | 89% |
| Hands-on minutes per step, median error | 1.1 min | 1.0 min |
| Hands-on total (reviewed: 598 min) | 721 min | 658 min |

The recipe links score flatters it: one rule reads "dry acini di pepe or orzo"
as the homemade acini di pepe, and matching by name will miss links in recipes
whose ingredient names don't match a recipe title.

## What code can't do

- **Times that aren't in the text.** 20 of the 83 waits in the old recipes were
  only in the `wait` field: "Bake the donuts.", the pavlova's 90-minute bake,
  the babkallah's rises. From plain text there's nothing to read, and the
  planner then plans the pavlova lineup far too short. The intake should ask
  for a time on any step that bakes, rises, chills or cools without one.
- **Judgement calls.** Whether prep can be done ahead or should be "just
  before", whether a wait needs watching, how long a dish can sit, and whether
  a linked recipe starts as "Already made". These stay around 75 to 90% however
  many rules are added, so the intake should show them for a person to confirm.
- **Same word, different ingredient.** The shawarma salad's red onion is diced
  in a step, so the code takes the roasting onion's wedges as already done.
- **Product or instruction.** "sliced dill pickles" is usually bought sliced;
  "chopped cilantro" is usually chopped at home. The rule (chop, dice, mince
  and slice before the name count as instructions) gets most of these right.
