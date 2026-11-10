# Testing how the lineup is shown

`views.mjs` plans two real lineups with the planner (`assets/planner.mjs`) and
the real recipes, and writes out what the lineup would show, four ways, plus
each recipe's card as written (with its pan and heat):

- **A, step by step** (`*.detailed.md`): every step of every recipe in one
  order, as lineup cook mode does now, with each step's "done when" cue and
  the timers already running (no clock times).
- **D, step by step with phase headings** (`*.detailed-headed.md`): the same,
  with the phases below as headings along the way, to show where you are.
- **B, phases** (`*.phases.md`): the meal in phases (the prep, then a new phase
  wherever a long wait starts: something goes in the oven, rises or chills).
  Within a phase the cook works from the recipe cards in any order.
- **C, phases with steps** (`*.phases-steps.md`): the same phases, with each
  phase's steps in order one tap away.

The lineups are the steak dinner (ribeye, asparagus, applesauce, hasselback
potatoes with garlic paste) and the pavlova with lemon curd and blueberry
whipped cream (the meringue made ahead).

```sh
node tools/lineup-test/views.mjs OUT_DIR
```

The first run tested A (without cues or timers), B and C with six dry-run cooks
(one per lineup and presentation); the results are in `results.md` (summary,
with caveats) and `results.json` (every report). The second run tested A and D
with eight cooks told to follow the screen literally (two per lineup and
presentation): `results-2.md` and `results-2.json`.
