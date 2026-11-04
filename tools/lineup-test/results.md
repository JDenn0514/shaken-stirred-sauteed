# Lineup presentation test: results

Six dry-run cooks (one per meal and presentation, each blind to the others) followed what the screen showed, with the recipe cards, and filled in the same report; a seventh compared the reports. Run on 2026-11-04 with the views from `views.mjs`. Raw reports: `results.json`.

## Scores

| Presentation | Score (1-10) | Steak dinner | Pavlova |
|---|---|---|---|
| A: every step of every recipe in one order, one step at a time | 5 | About 1 hr 57 min to 2 hr against 1 hr 55 min, the closest to the promise. But that held only because the tester pulled the asparagus off-script when its timer rang; followed literally, the asparagus roasts about 26 min. 46 lookups (the most), confidence 2. The end of the meal (steps 31-34) is a juggle: timers ring for steps that aren't on screen, the oven goes to broil with the potatoes still in, the potatoes are 'served hot' before the asparagus broil, and slicing the steak is never a step. | Day before about 4 hr 20 min against 3 hr 50 min (the gap is the room-temperature wait for the whites). On the day about 2 hr 20 min against 2 hr 15 min, so the literal order roughly delivers the promised time. 38 lookups, confidence 3. The one-step screen drops every 'done when' cue and the equipment lists, so the tester went back to the cards at each critical moment. The 'Nothing needs you' waits don't match the screen's own 1-hr timers. The whipped cream is made before the curd is cold and is left out with no chilling note. |
| B: the meal in phases; within each phase you work from the recipe cards in the order you choose | 3 | About 2 hr 37 min against 1 hr 55 min, the worst result. The tester followed the phases literally, so the 30-min steak sit-out became its own phase after the 40-min bake. That kept the potatoes in the oven about 88-90 min against 55-60 and added about 30 min of dead time. Phase 5 took about 27 min, not 18. 31 lookups, confidence 2. The tester had to guess when to put the asparagus in, when to start the steak pan and how to share the oven. | Day before about 4 hr 15 min against 3 hr 50 min. On the day about 2 hr 15 min, but only because the tester broke the phase order: curd first, and both into the fridge together. Followed literally, Phases 4 and 5 run the two fridge hours back to back (about 3 hr 25 min), and the curd sits in melted ice for an hour. 28 lookups (the fewest), confidence 3. The 'any order' Phase 2 puts two stovetop recipes and one strainer together, with no advice on which goes first. |
| C: the meal in phases, with each phase's steps in order available one tap away | 4 | About 2 hr 00 min against 1 hr 55 min. That held only because the tester guessed that Phase 4 should start during the Phase 3 bake; nothing on the screen says so, and literally it would match B. Phase 5 took about 25 min, not 18. 40 lookups, confidence 2. Three timers (potato 40, steak 30, asparagus roast) end within about 2 min at the Phase 4/5 boundary. The ordered list in Phase 5 switches to broil while the potatoes are still baking. | Day before about 4 hr 20 min against 3 hr 50 min. On the day about 2 hr 35 min against 2 hr 15 min. The tester ran the two fridge hours together by choice; strictly in phase order it's about 3 hr 30 min. 40 lookups, confidence 3. The ordered steps drop the cards' doneness cues and equipment, like A. The syrup strain is placed between heating the juice and tempering, with no word to take the juice off the heat or rinse the strainer. |

Per tester:

| Meal | Presentation | Confidence (1-5) | Lookups | Two at once | Guesses | Missed |
|---|---|---|---|---|---|---|
| steak-dinner | A | 2 | 46 | 3 | 8 | 7 |
| steak-dinner | B | 2 | 31 | 3 | 7 | 7 |
| steak-dinner | C | 2 | 40 | 3 | 7 | 8 |
| pavlova | A | 3 | 38 | 4 | 8 | 8 |
| pavlova | B | 3 | 28 | 3 | 8 | 7 |
| pavlova | C | 3 | 40 | 4 | 10 | 8 |

## Recommendation

Build A's single ordered sequence as the core, and add the things all three lacked. First, a persistent panel of running timers and what's in the oven, with clock times and a target serving time, that re-plans when the cook is late. Second, the cards' doneness cues and equipment carried into each step. Phases can be kept as landmarks, naming what you're waiting on and gathering the prep, but not as gates: drop 'finish the phase before starting the next' and the heading durations that only add up if the phases overlap. Don't build B as it stands. Fix the plan and recipe data problems first, whichever presentation is chosen: most of the food damage (asparagus, the oven clash, lemons, yolks, the shell, fruit, the strainer) appeared in all three presentations.

### Why

A was the only presentation where following the order literally came close to the promised time in both meals: steak 1:57-2:00 against 1:55, pavlova day of 2:20 against 2:15. Its order made the steak sit-out and the two fridge hours overlap other work automatically.

B and C share the same phase layout, which I checked in the view files. Followed literally, those phases run timers one after another. The steak B tester did exactly that and got about 2:37, with potatoes about 90 min in the oven. Both pavlova phase testers worked out that a literal reading takes 3:25-3:30 and leaves the curd out an hour. Steak C, pavlova B and pavlova C hit their times only by guessing the overlaps or breaking the phase order, so their totals don't reflect what the screen says to do. Four testers hit this problem.

B did have the fewest lookups (31 and 28), because the cook reads the cards, where the doneness cues are. A and C's step text drops those cues, and the pavlova A and C testers both complained about it. That supports carrying the card cues into each step rather than choosing B.

Every tester (6 of 6) said that when 10 minutes late, no presentation shows what's running, what's due or what can slip. That's the biggest presentation gap, and it's shared by all three, so it's a feature to add rather than a reason to pick one. A's specific weakness, timers ringing for steps that aren't on screen and 'Nothing needs you' shown while things are due, is the same gap.

B and C testers liked the phase headings (what you're waiting on, all the prep gathered), and C testers liked the ordered list with recipe tags. That supports keeping phases as an overview on top of A's sequence, not as the way the cook steps through the meal.

Limits: one tester per presentation per meal, all dry runs. Confidence was 2 for every steak tester and 3 for every pavlova tester, so the steak data problems weigh on every presentation equally. Differences in outcome partly reflect individual testers' judgment, such as who guessed the overlaps.

## Problems with how the plan is shown, reported by more than one tester

- No view of running timers, clock times, slack or a target serving time, and no re-planning when the cook falls behind. All 6 testers said this in their 10-minutes-late answers; none of the three presentations has it.
- Phase layout (B and C): phases are cut at timer boundaries and shown as sequential ('finish the phase before starting the next'; heading durations that only add up to the total if phases overlap). Followed literally, the steak sit-out follows the 40-min bake (potatoes about 90 min in the oven, meal about 2:37), and the pavlova syrup and curd fridge hours run back to back (about 3 hr 25-30 min, curd out an extra hour). Hit by 4 testers (steak B, steak C, pavlova B, pavlova C). The C testers and the pavlova B tester avoided it only by guessing or breaking the order. In A, the same order makes these waits overlap.
- Phase layout (B and C): the step that answers a timer sits in a later phase than the timer (potato baste in Phase 5 after the 40-min timer ends in Phase 3; curd 'then refrigerate' in Phase 5 after its ice bath ends in Phase 3). 4 testers (steak B, steak C, pavlova B, pavlova C).
- Phase heading times are wrong or misleading: steak 'Phase 5 (18 min)' takes about 25-27 min, and 'Start cooking' contains no cooking. 2 testers (steak B, steak C).
- Step-by-step text (A and C) drops the cards' 'done when' cues (stiff glossy peaks, firm/dry/pale meringue, curd at 170°F, cream peak stages) and 'Before you start' equipment (thermometer, strainer over a bowl, jar, plastic wrap), sending the cook back to the cards at critical moments. 2 testers (pavlova A, pavlova C). The B testers read the cards directly and had the fewest lookups (31, 28).
- Phase lists without an order (B) leave the cook to work out the sequence within a phase: oven on first, butter melted before mixing, zest before card steps 1-2, when the asparagus goes in, when the steak pan goes on, and which stovetop recipe goes first. 2 testers (steak B, pavlova B).
- One-step-at-a-time (A): 'Nothing needs you' appears while something is due or overdue, or with a duration that disagrees with the screen's own timers (steak: after 'serve hot' while the steak needs slicing, and still shown when three things are overdue; pavlova: 40 and 16 min against 1-hr fridge timers). 2 testers (steak A, pavlova A).

## Problems in the plan or recipe data

| Testers | Problem | Suggested fix |
|---|---|---|
| 3 | Steak dinner: the asparagus 'Pull the pan and switch to broil' step (card step 5) is ordered after the whole steak, about 20-25 min after its 8-10 min roast timer ends. Followed literally, the asparagus roasts about 25-26 min; pulled at the timer, it sits and goes cold before the broil. | Keep asparagus card steps 4-5 together, or schedule the roast for the last minutes of the potato bake so the pull answers its own timer and the broil follows as soon as the oven is free. |
| 3 | Steak dinner: one oven, two uses. The plan switches the oven to broil while the hasselback potatoes are still in their 15-20 min second bake at 200°C. The hasselback card has no 'take them out' step (step 8 is only 'scatter parsley and serve'), and the potatoes are served before the asparagus broil. | Have the planner treat the oven as a shared resource. Add a 'remove the potatoes' action before the broil switch and order the finish as potatoes out, broil the asparagus, serve. The steak rest then also stops stretching to 10-12 min (steak B and C). |
| 3 | Steak dinner: asparagus card step 2 (oil, salt, arrange on the sheet) is scheduled in prep, about 47 min to 1.5 hr before roasting, so it weeps. | Schedule asparagus step 2 just before step 3 and the roast. |
| 3 | Asparagus card: the timer says 8-10 min but the text says thick spears need about 12. | Make the timer range match the text (for example 8-12 min), or drop the thick-spear line. |
| 3 | Garlic Paste makes about 3 tbsp from 8 cloves (about 15 min of critical-path prep), but the potatoes use 1 tsp. 'Use immediately, or oil and jar it' leaves the cook to decide what to do with the rest. | Scale the paste to what the meal uses, or say how much goes into the potatoes and to jar the rest. The card's own note suggests a microplane for small amounts. |
| 3 | Steak dinner: servings don't match (ribeye serves 1, potatoes 4, asparagus 8, applesauce about 3 cups) and nothing scales them to one meal. | Scale the lineup's recipes to one serving count, or at least flag the mismatch on the lineup. |
| 3 | Shared ingredients aren't totalled. The meal needs 1.5 lemons (asparagus uses a whole one, applesauce half), and 'Juice the half lemon' reads as a leftover half. Garlic is about 10 cloves across two recipes, peeled in two separate steps. | Give the lineup a combined shopping and prep total, and reword the applesauce prep (for example 'Juice half of a second lemon'). |
| 3 | Pavlova: 'let the whites come to room temperature' has no duration, and neither the screen total (3 hr 50 min) nor the card (4 hr) counts it. All three testers took about 4 hr 15-20 min. | Give the warm-up a duration (testers used about 20-30 min) and count it in the total. Optionally overlap it with the preheat. |
| 3 | Pavlova: nothing says to cover and refrigerate the 4 saved yolks overnight, or reminds the cook on the day that the curd's yolks are waiting. | Add a day-before step to cover and refrigerate the yolks, and a day-of prep line to take them out. |
| 3 | Pavlova: no step says where the cooled shell goes overnight. Only a card note says airtight at room temperature; left in the oven, it risks being preheated with the oven the next day. | Add a final day-before step: move the shell to an airtight container at room temperature. |
| 3 | Pavlova: the fruit for the topping is in no ingredient list, and all 8 oz of blueberries go into the syrup. 'Pile on cream, curd and fruit' gives no amounts, and the curd (2 cups) and syrup (about 1.5 cups, 3-4 tbsp used) make far more than the meal uses. | Add topping fruit with an amount to the pavlova ingredients and the lineup's shopping list. Say how much curd and cream go on top, and note the leftovers. |
| 3 | Blueberry Syrup step 4 'Let it cool' has no time or done-when cue, but the cream depends on the syrup being cold (warm syrup deflates it). | Give a cooling time or cue so the planner can schedule it, or cool the syrup in the curd's ice bath. |
| 3 | Pavlova day of: one fine-mesh strainer is used for the syrup and then the curd within minutes, with no rinse step. | Model shared equipment in the plan: add a rinse step between the two uses, or tell the cook to have two strainers ready. |
| 3 | Pavlova day of: butter for the curd is set out only about 20-40 min before use, so it isn't really soft (minor, since it melts into hot curd). | Move 'set the butter out' earlier, or drop 'to soften' since it goes into hot curd. |
| 2 | Pavlova day of: the plan puts the syrup strain between heating the lemon juice and tempering, so the juice keeps simmering and over-reduces. Both recipes say 'the saucepan' though two pans are needed. | Finish the syrup during the curd's 10-min zest rest, before the juice goes on, or add 'take the juice off the heat'. Name a second saucepan. |
| 2 | Steak: the instant-read thermometer (pull at 130°F) and the skillet aren't listed, and the butter, herbs and garlic for the baste aren't set out in prep. | Add the equipment to the ribeye card and the lineup's prep phase, and put the baste ingredients in the steak prep. |
| 2 | Garlic paste salt: the paste card says to subtract its salt from the dish, but the potato step still says to add salt and the plan doesn't adjust. | Carry the 'reduce salt' note into the potato step when the paste is used. |
| 3 | Hasselback reserved garlic butter: 'hold back half' is said only in prep, not repeated at the brush step. The reserve sits about 70-75 min and partly sets before the baste, with nothing about re-warming it. | Repeat 'brush on half, keep half' at the brush step, and add 're-warm the reserved butter if it has set' at the baste. |
| 2 | Applesauce step 5 'Mash ... and eat' appears about 35 min before the meal is served. | Drop 'and eat' when the step is used inside a lineup, or reword the card step. |
| 2 | The steak total understates the hands-on time: the hasselback card's 'Prep: 15 min' is unrealistic for scrubbing and slicing 8 potatoes, and the garlic paste has no time. | Correct the hasselback prep time and give the garlic paste an active time so the planner's estimates hold. |
| 2 | Parsley is chopped in prep and used about 90 min to 2.5 hr later, wilted. | Move chopping the parsley to the potato baste or the finish. |
| 2 | Lemon Curd tempering: pouring hot juice while whisking constantly, one cook, nothing holding the bowl. Both testers used a damp towel; the screen gives no tip. | Add a 'set the bowl on a damp towel' tip to the curd card's temper step. |

## Reported by one tester only (may be noise)

- Pavlova A: the curd (keeps 5 days) and the syrup could be made the day before during the meringue's 90-min bake, leaving about 10 min of work on the day.
- Pavlova A: the whipped cream is made before the curd finishes chilling and is left out 16-25 min with no instruction to refrigerate it; it should be whipped last.
- Pavlova A: cream of tartar is folded in at the end and the sugar goes in at 30 sec per half, which risks a less stable, gritty meringue.
- Pavlova A: preheat starts only about 10 min before the meringue goes in, so the oven may not be at 350°F.
- Steak A: the applesauce stir is buried at the end of timed step 21, and the card implies a lid ('Uncover away from your face') that no step mentions.
- Steak A: slicing the steak is never a step.
- Steak A: there's no time estimate for the flip-and-baste step (card step 5).
- Steak C: the applesauce steam caution is only in the card notes.
- Steak C: garlic is peeled in two separate steps (8 cloves, then 2) instead of once.
- Steak C: the garlic paste is past its sharpest by the potato baste.
- Steak B: the fixed 18-min potato timer replaces the card's 15-20 min 'until crisp' cue.
- Pavlova B: the day-of Phase 1 text has awkward punctuation ('...yolk.; also: ...').
- Pavlova B: the layer order at assembly (cream or curd first) isn't stated.
- Pavlova C: the ice bath is made about 25 min before it's needed and partly melts.
- Pavlova C: Blueberry Syrup steps 1-2 give no simmer time.
- Pavlova C: the '1 hr 55 min saved on the day' figure for making ahead isn't explained.
- Pavlova C: with a hand mixer, adding sugar in two parts while beating needs three hands.

## Suggested next tests

- After fixing the shared data problems (asparagus pull placement, oven sharing and a potato-removal step, 1.5 lemons, yolk and shell storage, topping fruit, syrup cooling time, strainer rinse), re-run all three presentations with testers told to follow the screen literally. That separates what the presentation does from what tester judgment rescues.
- Prototype A plus a running-timers/oven panel with clock times and a target serving time. Repeat the 10-minutes-late scenarios the testers used (steak sear slipping, slow apple peeling, the lemon juice over-simmering while the syrup is strained) to see whether the cook can recover from the screen.
- Test a version of A whose steps include the cards' doneness cues and equipment, and compare lookups against B's 31 and 28.
- Test phases-as-landmarks over A's sequence (no 'finish the phase first', no misleading phase durations) against B and C on the same two meals.
- Use more than one tester per meal and presentation; each cell had only one, so single-tester claims can't yet be told from noise.

## Caveats (added after the run)

- The test views were plain text, so testers had none of lineup cook mode as designed: running timers pinned at the top, a ringing timer showing its follow-up ("then baste them"), and re-planning on every Next step (docs/specs/meal-planner-design.md). Most "no view of running timers, no re-plan when late" complaints are about things the design already has.
- The step-by-step views left out each step's "done when" cue, which cook mode shows. The complaint that steps drop the cards' cues is about the test views, not the design.
- Clock times and a target serving time were left out on purpose: Jacob decided against clock times in the lineup.
- Checked after the run: the plan doesn't broil while the potatoes bake. Their timer ends at the minute the broil switch is planned, but no step says to take them out, so it reads as a clash. The asparagus problem is real: it finishes roasting about 17 minutes before it's pulled, because "Pull the pan" shares a step with switching to broil, which waits for the oven.

## Fixed since the run

- **Planner:** each step that starts cooking a hot dish is held back, not only its first (the asparagus now waits about 3 minutes out of the oven for the broiler, not 17 in it); and while food on a burner is nearly ready, nothing from another dish starts that would run past it (the curd's juice is tempered as soon as it simmers). `assets/planner.mjs`, spec rules 4 and 5.
- **Recipes:** the pavlova's egg-white warm-up (about 30 min), refrigerating the yolks, and a last step moving the shell to an airtight container; the hasselback "brush on half, keep half", warming the reserve, taking the potatoes out, and chopping the parsley at the end; the asparagus timer (8 to 12 min), pulling the pan when roasted, and seasoning just before roasting; the syrup's cooling time (about 10 min, an estimate); the curd's damp towel; the ribeye's thermometer; "and eat" off the applesauce.
- **Not a problem after all:** the ribeye's skillet is on its card (the "pan" field), which the test cards didn't print.
- **Left for later, as the design already says:** scaling recipes to one meal (the garlic paste, servings), a combined shopping list (1½ lemons, about 10 garlic cloves), sharing equipment between recipes (one strainer), and the pavlova's topping fruit amount ("to taste" on its card).
- **Not yet re-tested.** The next run should show step by step with done-when cues against step by step with phase headings, with testers told to follow the screen literally.
