# Lineups from code-only recipe data

From `tools/lineup-test/code-only.mjs`. Planned times, all on the day (nothing made ahead).

## What it shows (re-run 2026-11-04, after the planner fixes from the many-lineups check)

- **Waits are what matter.** A step with no time plans as instant. Without the waits that aren't in the recipe's text, the seven meals plan about 9.5 hours shorter in all than they really take (16 hr 38 planned, 26 hr 09 real), and hot dishes sit 68 minutes too long. Code-only plans of the pavlova, the baking day and the lemon curd come out about a third of their real length.
- **The intake's one question helps, but doesn't cover every missing time.** Answering "how long?" for steps that bake, rise, chill or cool takes the pavlova from 1 hr 32 to 3 hr 15 (reviewed: 4 hr 32) and the baking day from 2 hr 07 to 3 hr 22 (6 hr 44). The rest are waits the question doesn't catch, such as egg whites coming to room temperature, a dough resting, or a curd chilling in a step the code split differently. The planner's own `unknown` check (rule 15) catches more. (The test fills an answer only when it can match the code's step to a reviewed one, so it may undercount what a person would answer.)
- **Serving and sitting times matter for freshness, not length.** Without `serve` and `sits`, a dish counts as hot, sitting up to 10 minutes (baking and components keep). The meals plan only 15 minutes longer in all, but hot dishes sit 101 minutes too long, since dishes that can sit 5 minutes are planned as if they could sit 10. (The first run showed three times as long: a planner bug, since fixed.)
- **Everything else costs little.** Without hands-on times, the meals take 14 minutes longer and hot dishes sit 16 too long; without watch marks, 18 minutes longer, 12 sitting and 16 more on the heat; without `during`, 15 minutes longer; without equipment marks, they plan 22 minutes short and leave food on the heat 15 minutes more. Prep marks change the order, not the outcome.
- **A planner problem it found, now fixed:** the wedding soup with homemade acini di pepe made the acini twice. (Here the acini is made on the day, with its optional overnight drying, which is why the reviewed wedding soup takes 18 hours.)


| Meal | Reviewed | Code-only | + answers |
|---|---|---|---|
| Steak dinner | 1 hr 57 | 1 hr 51 | 1 hr 51 |
| Pavlova | 4 hr 32 | 1 hr 32 | 3 hr 15 |
| Carne asada | 6 hr 58 | 7 hr 04 | 7 hr 04 |
| Sheet-pan shawarma | 57 min | 50 min | 50 min |
| Wedding soup | 18 hr 03 | 1 hr 54 | 1 hr 54 |
| Congee | 48 min | 45 min | 45 min |
| Lu rou fan | 2 hr 02 | 1 hr 59 | 1 hr 59 |
| Baking day | 6 hr 44 | 2 hr 07 | 3 hr 22 |

Single recipes, planned on their own (40):

- Code-only: 23 of 40 within about a quarter of the reviewed time. Far shorter: homemade-acini-di-pepe 1 hr 22 vs 17 hr 21; pavlova 26 min vs 4 hr 32; italian-wedding-soup-with-acini-di-pepe 1 hr 54 vs 18 hr 03; dark-chocolate-cremeux 40 min vs 4 hr 26; babkallah 1 hr 11 vs 6 hr 24; grenadine 15 min vs 41 min; lemon-curd 49 min vs 2 hr 09; minty-lime-bars 1 hr 09 vs 2 hr 60; zombie 20 min vs 45 min; israeli-salad 12 min vs 18 min; pan-fried-broccolini-lemon-dressed 12 min vs 17 min; grilled-corn-salad-with-avocado 22 min vs 31 min. Far longer: garlic-paste 21 min vs 14 min; green-tahini-sauce 7 min vs 4 min; painkiller 8 min vs 3 min; tahini-yogurt-sauce 10 min vs 5 min; whipped-cream 7 min vs 5 min.
- + answers: 28 of 40 within about a quarter of the reviewed time. Far shorter: homemade-acini-di-pepe 1 hr 22 vs 17 hr 21; italian-wedding-soup-with-acini-di-pepe 1 hr 54 vs 18 hr 03; babkallah 2 hr 10 vs 6 hr 24; lemon-curd 49 min vs 2 hr 09; pavlova 2 hr 26 vs 4 hr 32; israeli-salad 12 min vs 18 min; pan-fried-broccolini-lemon-dressed 12 min vs 17 min. Far longer: garlic-paste 21 min vs 14 min; green-tahini-sauce 7 min vs 4 min; painkiller 8 min vs 3 min; tahini-yogurt-sauce 10 min vs 5 min; whipped-cream 7 min vs 5 min.

## What each field costs

Each field taken out of the reviewed recipes on its own. The plan made without it is then followed with the real (reviewed) data, summed over seven meals (not the wedding soup, see the results): how much longer the meal really takes than the reference plan followed the same way, how long hot dishes sit past their limit, and how long food is left on the heat or in the oven waiting for its next step. The reference itself, followed this way, is shown first.

| Taken out | Meals that fail to plan | Planned time (sum) | Really takes | Hot dishes sit too long | Left on the heat |
|---|---|---|---|---|---|
| nothing (reference) | 0 | 23 hr 57 | 23 hr 56 | 0 min | 8 min |
| waits not in the text | 0 | 16 hr 38 | 26 hr 09 | 68 min | 8 min |
| prep marks | 0 | 23 hr 43 | 23 hr 42 | 0 min | 8 min |
| hands-on times | 0 | 23 hr 22 | 24 hr 10 | 16 min | 13 min |
| watch marks | 0 | 24 hr 02 | 24 hr 14 | 12 min | 24 min |
| during marks | 0 | 24 hr 11 | 24 hr 11 | 0 min | 16 min |
| equipment (oven, burner, microwave) | 0 | 23 hr 34 | 23 hr 34 | 0 min | 23 min |
| serve and sitting times | 0 | 24 hr 12 | 24 hr 11 | 101 min | 8 min |
