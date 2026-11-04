# Testing how the lineup is shown

`views.mjs` plans two real lineups with the planner (`assets/planner.mjs`) and
the real recipes, and writes out what the lineup would show, three ways, plus
each recipe's card as written:

- **A, step by step** (`*.detailed.md`): every step of every recipe in one
  order, as lineup cook mode does now.
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

The three were tested by six dry-run cooks (one per lineup and presentation)
and compared; the results are in `results.md` (summary, with caveats) and `results.json` (every report).
