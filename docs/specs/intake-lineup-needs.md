# What the lineup needs from the intake

For the recipe intake (`tools/intake/`, built in its own session). This says
which planning fields matter to the lineup planner, how much, and therefore
what the intake should ask a person, what it should show for a person to
confirm, and what it can fill in quietly. The fields themselves are in the
README, "Planning a lineup"; how the planner uses them is in
`meal-planner-design.md`.

Recipes come from anyone, often incomplete, and no language model fixes them
(Jacob's decision). So the intake asks the person for the few things that
matter, and the lineup copes with the rest.

## The evidence

From `tools/lineup-test/code-only.mjs` (results in `results-code-only.md`, on
the `restructure-experiment` branch; re-run after the planner fixes of
2026-11-04). Eight meals were planned from the
reviewed recipes, then from the same recipes as code alone restructures their
text. Then each field was taken out of the reviewed recipes on its own, and the
plans made without it were followed with the real data.

| Taken out | What it costs, over seven meals |
|---|---|
| Waits the recipe's text doesn't give | Plans about 9.5 hours short in all; hot dishes sit 68 minutes too long. The pavlova plans as 1 hr 32 instead of 4 hr 32 |
| Serving and sitting times | Only 15 minutes longer, but hot dishes sit 101 minutes too long: dishes that can sit 5 minutes are planned as if they could sit 10 |
| Hands-on times | 14 minutes longer; hot dishes sit 16 minutes too long. The planner's guess is close |
| Watch marks | 18 minutes longer; 12 minutes sitting, 16 more on the heat |
| `during` | 15 minutes longer |
| Oven, burner and microwave marks | Plans 22 minutes short; 15 more minutes on the heat |
| Prep marks | Changes the order, not the outcome |

## Ask the person

These two are worth a question every time they're missing.

**1. A time for every step that waits.** A step with no wait plans as if it
took none. That covers a bake, rise, chill, rest or marinade, anything left
somewhere warm, and any step that goes in the oven.

- **Use the planner to find them:** `planLineup({ dishes: [{ slug }] }, { [slug]: draft }).unknown`
  lists every such step (`kind: "wait"`, with `step`, its index), using the
  same rule the lineup page uses. One rule in one place, so the intake and the
  lineup never disagree. It finds about 90% of the missing waiting time in
  recipes as code restructures them, and nothing in the 40 reviewed ones.
- **Pre-fill the answer** from `suggest` when there is one (a time in the
  step's text that isn't in its `wait`).
- **A wait in a step that waits for something else** ("Bake until deep
  golden. Then let them cool on a rack, at least 15 minutes.", whose `wait` is
  the cooling) is reported with `sentence`, the one that waits uncounted.
  Answering splits the step after that sentence. The step's own wait is the
  sentence whose time it is; when no sentence gives that time, nothing is said.
- **"It doesn't wait"** is saved as `wait: false`, so the lineup doesn't ask
  again. A sentence in a step that waits can't be saved that way yet: said not
  to wait, it's asked again on the lineup page.
- **Optional steps are a known gap.** The acini di pepe's "Use fresh, or
  leave… to dry, 8 to 24 hr" isn't reported, because a step can't yet be
  marked optional. Leave such a wait out rather than guess.

**2. How the dish is served, and how long it can sit.** `serve` (`"hot"`,
`"soon"` or `"keeps"`) and `sits` ("10 min"). This is about freshness more
than time: without it, the plans barely change length, but a steak that
should be eaten within 5 minutes may be planned to sit 10.

- `unknown` lists a dish with no serving time (`kind: "serve"`, with the
  `assumed` default: hot, sitting up to 10 minutes).
- Components, baking and cocktails have safe defaults (they keep, or a
  cocktail is served within 5 minutes) and aren't listed. Still worth
  confirming for baking that's eaten warm.
- Three choices with an example each would do: "Hot (eat within a few
  minutes)", "Soon (fine for half an hour)", "Keeps".

## Show for the person to confirm

Code gets these mostly right (`tools/restructure/README.md`: 84 to 98%) and
they cost little when wrong. Show the guess and let the person change it; don't
ask a question.

- **Split steps** (marked `review: "split"`), including what to do when a
  timer ends ("Stir it all around again", "Pull the pan out"), now split into
  its own step so the lineup can show it when the timer rings.
- **Watch marks:** whether a wait needs you there (searing, whisking a curd).
- **Prep marks:** done ahead, or "just before" (cut apples, salting a steak).
- **`during`:** a step done while an earlier one waits ("Meanwhile, fry the
  pork").
- **Make-ahead point (`holds`):** where the dish keeps (the cooled meringue).
- **Linked recipes:** an ingredient linked to a recipe by name, and for a
  required one whether it's usually bought or already made (`alreadyMade`);
  the lineup starts it on that.

## Fill in quietly

- **Hands-on times:** estimated from the text and the recipe's active time.
  The planner's own guess is close too.
- **Oven, burner, microwave and grill marks**, read from the step. A step that
  takes the dish out of the oven gets `oven: false`; the lineup keeps the oven
  for it until then.

## Flags the intake already has that help the lineup

- `time`: a bake, rise, chill or cool with no time. Overlaps with `unknown`
  above; `unknown` is the fuller check (oven steps, rises left somewhere warm).
- `storage`: a make-ahead lineup ends where the dish is stored.
- `total-time`: a stated total well short of what the steps add up to usually
  means a missing wait.
- `no-amount`: for the page's shopping list, not the planner.

## Not needed from the intake

- **Clock times or a target serving time:** the lineup doesn't use them.
- **Phases or landmarks:** the lineup works them out (if the design keeps
  them).
- **Anything about other recipes in a lineup:** the planner handles how dishes
  fit together.
