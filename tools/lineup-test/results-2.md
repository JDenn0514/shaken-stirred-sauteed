# Lineup presentation test, second run: results

Eight dry-run cooks (two per meal and presentation, each blind to the others) followed the screen literally, with the recipe cards, and filled in the same report; a ninth compared the reports with each other and with the first run (`results.md`). Run on 2026-11-04 with the views from `views.mjs`, after the planner and recipe fixes from the first run. Raw reports: `results-2.json`.

- **A, step by step:** every step in one order, with done-when cues and the timers already running.
- **D, step by step with phase headings:** the same, with phase headings as landmarks.

## Scores

| Presentation | Score (1-10) | Steak dinner | Pavlova |
|---|---|---|---|
| A: every step of every recipe in one order, one step at a time, with done-when cues and the timers already running | 6 | Both testers took about 1 hr 55 min to 2 hr against the promised 1 hr 55 min. Lookups were 10 and 15 (46 in the first run) and confidence was 3 and 3 (2 before). Followed literally, the meal goes wrong at the end. The asparagus 'Pull the pan out' is lost on step 28, so the asparagus is still in the oven when it switches to broil. The applesauce stir on step 19 is lost the same way. The thermometer first appears at step 30. Step 32 says to 'serve hot' about 6-8 min before the rest of the meal is ready. The screen stops at the parmesan broil, with no step to take the asparagus out, slice the steak or plate up. 'The half lemon' doesn't exist. The oil smokes while you load the asparagus. | Day before: about 4 hr 15-30 min against 4 hr 25 min. On the day: about 2 hr 10-15 min against 2 hr 10 min. Lookups were 11 and 9 (38 in the first run) and confidence was 3 and 3. Followed literally, the blueberry syrup is never taken off the heat and simmers through the whole curd cook. The syrup is then strained through the strainer the curd just went through. The fruit is never prepared. The whipped cream sits out for about 13-15 min. On the day before, the oven only goes on after the 30-min wait for the whites. |
| D: the same step-by-step list, with phase headings (prep, then wherever something goes in the oven, rises or chills) as landmarks | 6 | About 1 hr 55 min to 2 hr 05 min, and about 2 hr, against 1 hr 55 min. Lookups were 12 and 11, and confidence was 3 and 3. Both testers hit the same literal failures as A: the lost asparagus pull and applesauce stir, the thermometer at step 30, the early 'serve hot', no serve step, the half lemon and the smoking pan. The headings didn't prevent any of them. Both testers said Phase 5 ('Hasselback Potatoes in the oven (18 min) — then serve') puts the whole crunch under a potato label. Its '18 min' matches no timer, and its 'then serve' clashes with the broil that follows. Both also said 'Start cooking' covers only slicing. | Day before: about 4 hr 20-30 min. On the day: about 2 hr 15-20 min, against 4 hr 25 min and 2 hr 10 min. Lookups were 11 and 12, and confidence was 3 and 3. Both testers hit the same failures as A: the syrup left simmering, the shared strainer, no fruit and the cream left out. Both said the headings helped on the day before (oven, cooling). On the day, the risky two-pan stretch sits under one heading, 'Start cooking', with no landmark inside it. 'Phase 4: Blueberry Syrup in the fridge (1 hr)' lasts about 16 min, which misleads. |

Per tester:

| Meal | Presentation | Run | Confidence (1-5) | Card lookups | Literal failures | Guesses | Missed |
|---|---|---|---|---|---|---|---|
| steak-dinner | A | 1 | 3 | 10 | 7 | 12 | 7 |
| steak-dinner | A | 2 | 3 | 15 | 8 | 9 | 8 |
| steak-dinner | D | 1 | 3 | 12 | 8 | 9 | 7 |
| steak-dinner | D | 2 | 3 | 11 | 8 | 12 | 7 |
| pavlova | A | 1 | 3 | 11 | 8 | 12 | 8 |
| pavlova | A | 2 | 3 | 9 | 6 | 11 | 7 |
| pavlova | D | 1 | 3 | 11 | 7 | 9 | 8 |
| pavlova | D | 2 | 3 | 12 | 6 | 10 | 7 |

## Recommendation

Keep step by step with done-when cues and running timers (A) as the core. Don't add the phase headings as they are now: D did no better than A on any measure. If landmarks are kept, cut them at the hands-on transitions and the serve, not at timer starts. In both meals, both groups asked for one before the final stretch (steak sear to broil; syrup plus curd on two burners), one at a free wait ('prepare the fruit') and a closing 'Serve / Plate up'. Drop the timer-length durations and rename 'Start cooking'.

Before the next run, fix these in order:
1. Show quantities, and a gather list built from the cards' 'Before you start' items, on the screen (8 of 8 testers; 9-15 lookups each).
2. Split after-timer actions into their own steps, or show them when the timer rings: the asparagus pull and the applesauce stir (4 of 4 steak). Add 'take the syrup off the heat' or keep syrup steps 2-3 together (4 of 4 pavlova).
3. End each meal with a serve step, and drop 'serve hot' from mid-meal steps.
4. Fix the plan order: asparagus in before the steak pan heats; whipped cream after the curd is cold; preheat during the whites wait.
5. Remove 'Nothing needs you' from hands-on or due moments, and round the 'min left' figures consistently (the contradictions all 8 testers saw are display rounding).
6. Fix the remaining data: asparagus text 8 to 12, 'Juice half of a second lemon', a cover step for the applesauce, fruit with an amount, a strainer rinse, and the yolks reminder on the day.

Then re-run with testers who follow the screen literally.

### Why

A and D show the identical step list; D only adds headings (confirmed by diffing the screen files). The 8 reports show no difference between them. Lookups were A 10/15/11/9 and D 12/11/11/12, every tester gave confidence 3, all totals were within about 10 min of the screen, and every major literal failure was hit by all 4 testers on each meal in both presentations. So the scores are equal (6 each). That is up from the first run's best of 5: lookups fell from 28-46 to 9-15, steak confidence rose from 2 to 3, the totals now match the screen, and every tester praised the cues and running-timer lines.

The heading verdict rests on the D testers' own words ('somewhat', 'a little', 'mixed'), on their consistent complaints about where the headings are cut and their durations, and on the A testers asking for landmarks at different places (busy stretches, serve).

Data claims were checked against views2. The cards confirm: the asparagus 8-10 against 12 against the 8-12 timer; the applesauce 'uncover' with no cover step; the ribeye 'Before you start' thermometer; 'Juice half the lemon' followed by 'Juice the half lemon'; the paste at 3 tbsp against 1 tsp; the Pavlova 'Total: 4 hr'; the curd note about 'leftover whites'; the syrup having no off-heat step; fruit 'to taste'.

To check the timer claims, I re-ran assets/planner.mjs with the views.mjs setup. Step times confirm the preheat at 35 min and the meringue in at 51 min, the ice bath about 26 min early, the potato butter mixed 69 min before the baste, and the cream finishing about 15 min before assembly. They also show that the 'min left' contradictions all 8 testers reported come from views.mjs about() rounding values of 20 min or more to the nearest 5. The plan itself is consistent: the potato and steak timers end 2 min apart, and the syrup's hour ends at step 18. So I listed that as a presentation problem and dropped the claims that it shows bad plan estimates, or that the syrup is added before its timer ends.

Comparing with results.md: the gate-style phases, the missing done-when cues, the oven clash, the early asparagus seasoning, the whites duration, yolk and shell storage, the syrup cooling time, the juice over-reduction and the damp towel are no longer reported. Several of the first run's one-tester claims are now reported by 3-4 testers (applesauce stir and lid, steak slicing, cream left out, late preheat, ice bath). Two fixes moved a problem rather than removing it: the parsley now lands at the busiest moment, and the curd fix leaves the syrup on the heat.

Limits: two testers per cell, all dry runs.

## Phase headings

The headings make no measurable difference, and as they are cut now they don't earn their place. All 8 testers hit the same literal failures in both presentations. Lookups were about the same (A: 10, 15, 11, 9; D: 12, 11, 11, 12), every tester gave confidence 3, and the totals were similar. The 4 D testers said the headings helped 'somewhat', 'a little' or gave a 'mixed' verdict. Prep, plus the long oven and chill headings, were useful anchors, especially on the pavlova's day before. But all 4 D testers said the headings mark wait starts and leave the riskiest stretch unmarked: the steak sear to broil under 'Hasselback Potatoes in the oven (18 min)', and syrup plus curd under 'Start cooking'. All 4 said the heading durations are timer lengths that mislead as phase lengths. 3 said 'Start cooking' is the wrong label, and 2 said '— then serve' clashes with the broil after it. The 4 A testers, who had no headings, asked for landmarks in exactly those places: before the final stretch ('stay in the kitchen', 'Stove: syrup and curd together'), at a free 40 min ('prepare the fruit'), and at a closing 'Serve / Plate up'. Several also wanted a gather list at prep. So landmarks are wanted, but at hands-on transitions and the serve, not at timer starts and without timer-length durations. Re-cut them that way or leave them out; as they are, they add a little at the waits and some confusion at the crunch.

## Where following the screen literally goes wrong

| Testers | Step | Problem | Suggested fix |
|---|---|---|---|
| 4 | Steak 28 then 31-34 (asparagus 'Roast ... Pull the pan out' with an 8-12 min timer) | 'Pull the pan out' is on the step you leave as soon as the timer starts. The timer rings during step 30 or 31, and step 31 says 'Nothing needs you for about 4 min. Up next: Hasselback Potatoes'. No later step pulls the asparagus, so it stays in through the potato removal and the switch to broil, and overcooks. | Split the pull into its own step at the timer's end, or show it when the asparagus timer rings. Don't show 'Nothing needs you' while a timer's follow-up is due. |
| 4 | Steak 19 (applesauce 'Microwave 7-8 minutes on high. Stir it all around again.') | The stir comes after the timer, but by then the screen is on step 20 or 21, and step 21 says only 'Microwave another 7-8 minutes'. Literally, the stir is skipped and the apples cook unevenly. | Split card step 3 into 'Microwave 7-8 min' and 'Stir it all around again', or show the stir when the timer rings. |
| 4 | Steak 30 (pull at 130F inside) | The thermometer first appears here. The ribeye card's 'Before you start: have an instant-read thermometer ready' never reaches the screen, so you go looking for one mid-baste or guess the doneness. | Carry each card's 'Before you start' items into the screen's prep (a gather list at step 1). |
| 4 | Steak 32 (take the potatoes out, chop the parsley, 'serve hot') | 'Serve hot' comes about 6-8 min before the asparagus is broiled and while the steak rests, so literally the potatoes go out alone. The parsley is chopped at the busiest moment. | Drop 'serve' from a recipe's last step inside a lineup and end the meal with one serve step. |
| 4 | Steak 34 (last step) / 31 ('Rest ... before slicing and serving') | The screen ends at 'broil 2 to 3 minutes'. No step takes the asparagus out from under the broiler, slices the steak, or plates the meal (and brings out the applesauce). | Add a closing step: asparagus out, slice the steak, plate everything. |
| 4 | Steak 13 (applesauce prep 'Juice the half lemon') | Step 11 has just used the whole lemon (half juiced, half in rings), so 'the half lemon' doesn't exist. A second lemon is never mentioned. | Reword it to 'Juice half of a second lemon' and total the shared ingredients (1.5 lemons). |
| 4 | Steak 26-29 (heat oil to smoking, pat and season, asparagus in the oven, steak in) | The oil reaches smoking point, then sits unattended while you season the steak and load the asparagus tray into the oven. Seasoning 'right before it goes in' is interrupted. | Schedule the asparagus into the oven before the pan goes on the heat. |
| 4 | Steak 8-9 (garlic paste 'Use immediately, or ... jar it'; potatoes 'Stir the oil, melted butter, garlic paste...') | The screen makes about 3 tbsp of paste, then says to use 'garlic paste' with no amount (the card says 1 tsp). Literally, all of it goes in, about 9 times too much garlic and salt. Step 8 offers a choice the plan has already made. | Show amounts on the screen and say 'use 1 tsp, jar the rest', or scale the paste to the meal. |
| 4 | Pavlova on the day, 5 then 6-13 (syrup 'Keep it at a simmer ... until the sugar has dissolved') | No step takes the syrup off the heat, and strain is 8 steps later. Literally, it simmers about 15-25 min through the curd cook and goes jammy or scorches. It has no timer, so the pinned timers don't show it either (D1, D2). | Add 'take it off the heat' to the syrup, or strain it straight after step 5 before the curd starts. |
| 4 | Pavlova on the day, 13 (strain the syrup through 'the fine-mesh strainer') | The same strainer was used for the curd two steps earlier and is coated in it. Nothing says to rinse it, or what to strain into. | Add a rinse step or a second strainer, and carry the syrup card's 'strainer over a bowl, clean jar' into prep. |
| 4 | Pavlova on the day, 20 ('pile on whipped cream, curd, and fruit') | Fruit is mentioned for the first time here. It is never bought, washed or prepared. The step also doesn't say to take the shell out of its container, or how much curd to use (3 testers also ask about the layer order). | Add a fruit prep step (and fruit on the shopping list), and say how much curd and cream go on and in what order. |
| 4 | Pavlova on the day, 19 then 20 ('Nothing needs you for about 13 min') | The finished whipped cream sits at room temperature for 13-15 min with no instruction to refrigerate it, and softens or weeps. | Whip the cream last, after the curd's fridge timer, or add 'refrigerate it'. |
| 4 | Pavlova day before, 1-4 (30-min whites timer with 'Nothing needs you', then line the sheet, heat the oven, whip) | Taken literally, either you wait out the 30 min and only then turn the oven on (it gets about 16 min and may not reach 350F; A1, A2, D1), or you tap through steps 2-3 and whip cold whites, because step 4 never says to wait for the timer (D1, D2). | Put the sheet and preheat inside the wait, and make the whipping step follow the whites timer. |
| 4 | Pavlova on the day, 1 (prep), 8-9 and 12 | On-the-day prep covers only zest, juice and butter. The curd card's thermometer, whisk, strainer and plastic wrap aren't set out, so you hunt for them mid-temper or mid-cook. | Carry the 'Before you start' items into the prep step. |
| 4 | Pavlova on the day, 17 ('Whip the cream ... to soft peaks' with 'Nothing needs you for about 3 min') | A hands-on step is marked 'Nothing needs you'. The cream is whipped while the syrup still has about 6 min in the fridge, then parked at soft peaks, and testers couldn't tell when to move on. | Start the cream after the syrup timer ends, and don't put 'Nothing needs you' under a hands-on step. |
| 4 | Pavlova day before, 9 ('keep the door shut', done when firm and dry to the touch) | Touching the shell, or watching for browning to rotate it, means opening or watching the oven, against 'keep the door shut' and 'Nothing needs you for about 1 hr 30 min'. | Say to check through the window and to touch only when the timer ends. |
| 3 | Pavlova on the day, 7 ('whisk the eggs, yolks and salt') | Nothing on the day says the 4 yolks are yesterday's, in the fridge, or that 3 whole eggs are also needed, so you hunt for them while the juice heats. | Add 'take out the saved yolks' to the on-the-day prep. |

## Problems with how the plan is shown, reported by more than one tester

- No quantities on the screen. Every measuring step needs a card lookup: 9-15 per tester, 8 of 8 testers. Literally, this makes 'garlic paste' mean the whole batch.
- The cards' 'Before you start' items never reach the screen: the ribeye thermometer, the curd's thermometer, strainer and plastic wrap, the syrup's strainer over a bowl and jar. 8 of 8 testers.
- Actions due when a timer ends sit on the step that starts that timer and vanish when you tap Next (applesauce stir, asparagus pull). 4 of 4 steak testers.
- 'Nothing needs you' appears while something is due or under a hands-on step: steak 31 with the asparagus about to ring; pavlova step 17 (whipping), day-before step 1 (steps 2-3 are hands-on) and step 9 (rotate if browning). 8 testers.
- The printed 'Timers running ... about N min left' figures look internally inconsistent: steak steps 20-22, pavlova 14 to 15, and pavlova 17 to 18 (D1, D2). 8 of 8 testers. Checked in tools/lineup-test/views.mjs: `about()` rounds anything 20 min or longer to the nearest 5 min and shows smaller values exactly. Recomputing from planner.mjs, the potato and steak timers end at a constant 2-min gap, and the syrup timer ends just as pavlova step 18 starts. So this is display rounding, not a planning error.
- When running late, the static 'timers running' and 'Nothing needs you for N min' lines go stale. Nothing says how far behind you are or what to do next. The pinned live timers help (several testers said so). 8 of 8 in the ten-minutes-late answers.
- It's unclear which end of a timer range (15-20, 8-12, 3-5, 5-10) the timer uses. 4 of 4 steak testers.
- Something on the heat with no timer (the blueberry syrup) doesn't show in the running timers. 2 testers (pavlova D1, D2).
- Phase headings (D only): durations are timer lengths, not phase lengths (steak Phase 5 '18 min' against 15-20, pavlova Phase 4 '1 hr' lasting about 16 min), 4 testers. 'Start cooking' labels a stretch with no cooking, 3 testers. The busiest stretch has no landmark, 4 testers. '— then serve' comes before the broil, 2 testers.

## Problems in the plan or recipe data

| Testers | Problem | Suggested fix |
|---|---|---|
| 4 | Steak: the asparagus card's step 4 bundles 'Roast ... Pull the pan out', and the applesauce card's step 3 bundles 'Microwave ... Stir it all around again', so the after-timer action has no step of its own. With the plan's order, the asparagus finishes about 7 min before the broil and sits in or out of the oven. | Split those card steps so the pull and the stir are separate steps the planner can place at the timer's end. |
| 4 | Steak: the plan has no closing serve step. The hasselback's last card step says 'serve hot' about 6-8 min before the asparagus broil, and the steak rest runs past its 5-10 min (about 12 min by the plan's times; A1, A2 and D2 report 11-15). D1 reports the rest stayed within 5-10. | Add a lineup-level 'slice the steak, plate everything' step, and drop 'serve' from a dish's last step inside a lineup. |
| 4 | Steak: the order heats the steak pan (26) and seasons the steak (27) before the asparagus goes in the oven (28), so the oil smokes unattended. | Have the planner put the asparagus in before the pan goes on, or not start a watched burner step right before an oven load. |
| 4 | The meal needs 1.5 lemons, but the applesauce prep says 'Juice the half lemon' after the asparagus prep has used a whole one. | Reword it to 'Juice half of a second lemon' and add a combined shopping list (already left for later). |
| 4 | Garlic Paste makes about 3 tbsp from 8 cloves (10-17 min of prep), but the potatoes use 1 tsp. Nothing scales it or says to jar the rest. | Scale the paste to the meal, or say 'use 1 tsp, jar the rest' (already left for later). |
| 4 | Servings don't match: ribeye serves 1, potatoes 4, asparagus 8, applesauce about 3 cups. | Scale to one serving count, or flag the mismatch (already left for later). |
| 4 | The asparagus card text says 'for 8 to 10 minutes' and then 'thick spears nearer 12 minutes', while the timer says 8 to 12. | Change the text to 8 to 12 to match the timer. |
| 4 | The applesauce card's notes say to 'Uncover away from your face', but no step says to cover the dish. | Add 'cover' to card step 2 or 3, or drop 'uncover'. |
| 4 | The parsley is chopped at step 32, the busiest moment. It was moved there to stop it wilting after the first run. | Chop it during an earlier 'nothing needs you' gap near the end (for example, the potato baste wait). |
| 3 | The garlic paste's salt isn't subtracted from the potato seasoning (that's only a card note). | Carry the 'reduce salt' note into the potato step when the paste is used. |
| 3 | The ribeye's butter and herbs (and the herbs' prep) have no prep step. Ribeye prep only peels garlic. | Add the baste ingredients to the ribeye prep. |
| 3 | The hasselback card's 'Prep: 15 min' is optimistic for scrubbing and slicing 8 potatoes (testers took 12-20 min to slice). The hands-on prep ran about 44-52 min. | Correct the hasselback prep time and give the garlic paste an active time. |
| 2 | Asparagus prep (step 11) juices half the lemon, and card step 3 (step 24) says 'Squeeze the juice of half the lemon' again. | Word one of them as 'pour the lemon juice over'. |
| 2 | Steak: nothing says to have a second oven rack free for the asparagus tray beside the potatoes. | Add the rack position or a second rack to the prep or the step. |
| 2 | Steak thickness isn't given anywhere, but the sear time (3-4 or 5 min) depends on it. | Give the steak's thickness in the ingredients. |
| 2 | The potato butter mixture is made at step 9, about 70 min before the baste, and sets. The screen's step 25 already says to warm it. | Mostly fixed. Optionally mix just before brushing. |
| 4 | Pavlova: Blueberry Syrup card step 2 has no 'remove from heat' and no duration, and the plan puts the whole curd cook between syrup steps 2 and 3. | Add 'take off the heat' to the card, or have the planner keep syrup steps 2-3 together (strain before the curd juice goes on). |
| 4 | Pavlova: one fine-mesh strainer is used for the curd (step 11) and the syrup (step 13) about 2-4 min apart, with no wash. | Model shared equipment: a rinse step or two strainers (already left for later). |
| 4 | Pavlova: the topping fruit has no prep step and no amount ('to taste'), and the syrup's berries are discarded. | Give the fruit an amount and a prep step, and put it on the shopping list. |
| 4 | Pavlova: the whipped cream is scheduled to finish about 15 min before the curd is cold, with no chill step. | Schedule the cream after the curd's fridge timer (the last thing before assembly). |
| 4 | Pavlova day before: the preheat (card step 1) is scheduled after the 30-min whites wait (step 3 at 35 min, meringue in at 51 min), not during it. | Start the preheat inside the wait so the oven is at 350F when the meringue is ready. |
| 4 | The Pavlova card still says 'Total: 4 hr' while the screen says about 4 hr 25 min, because the card leaves out the 30-min whites warm-up. | Update the card's total time to include the warm-up. |
| 4 | Pavlova: the curd and the amount of cream on top aren't given (the curd makes 2 cups, the syrup about 1.5 cups for 3-4 tbsp used), and the layer order isn't stated (3 testers). | Say how much curd and cream go on and in what order, and note the leftovers. |
| 3 | Pavlova: the ice bath is filled at step 3, about 26 min before the curd goes in, so some of the ice melts. | Fill the ice bath during the curd cook, or just before straining. |
| 3 | Pavlova on the day: nothing reminds you that the curd's 4 yolks are yesterday's saved yolks, or that 3 whole eggs are also needed. | Add 'take out the saved yolks' to the on-the-day prep. |
| 3 | Pavlova: the syrup gets only about 10 min of cooling plus 1 hr in the jar, and testers doubted it is fully 'cold' for the cream (the card warns that warm syrup deflates cream). Note: by the plan's times, the syrup does finish its 1-hr fridge timer before it is added at step 18. | Make the syrup earlier (or the day before) if 1 hr isn't reliably cold. |
| 2 | The Pavlova card folds the cream of tartar in at the end, after the sugar, which is unusual. | Check against the source. Usually it is beaten into the whites early. |
| 2 | The Lemon Curd card note 'Pavlova, once built: spend the 4 leftover whites on it' is backwards for this meal: the pavlova uses the whites and leaves the yolks. | Reword the note (the curd uses leftover yolks). |
| 2 | Pavlova: the curd butter is set out only about 25-30 min before use. | Set it out earlier, or drop 'to soften' since it goes into hot curd. |

## Against the first run

Gone:

- Phases as sequential gates (B, C), which ran the steak sit-out after the bake (about 2 hr 37 min) and the two pavlova fridge hours back to back. No tester reports this: headings are landmarks now, and all totals were within about 10 min of the screen.
- A step answering a timer that sits in a later phase. Not reported in this form, though see the after-timer actions under 'still there'.
- Step text dropping the cards' done-when cues. All testers now praise the done-when cues and 'stay with it' flags, and lookups fell from 28-46 to 9-15.
- No view of running timers at all. Testers now use the 'timers running' lines and pinned timers and say they help (the stale and late parts remain).
- Phase lists without an order (B) leaving the cook to sequence each phase.
- Steak: the oven switching to broil with the potatoes still in, and no potato-removal step. Step 32 now takes them out, and no tester reports a clash.
- Steak: asparagus oiled and salted in prep and weeping for an hour. It is now step 23, just before roasting.
- Steak: the asparagus left roasting about 17-26 min. It is now pulled on its own timer, though the pull is lost on screen (see 'still there').
- The pavlova egg-white warm-up having no duration. The screen now counts 30 min, and its 4 hr 25 min total matched the testers.
- Pavlova: no step to refrigerate the yolks overnight, or to box the shell. Both are on screen now, and no tester reports them.
- Blueberry Syrup 'let it cool' having no time. It now has 10 min.
- Pavlova: the syrup strain wedged between heating the lemon juice and tempering, with the juice over-reducing. The curd juice is now tempered straight away (though the syrup is now left on the heat instead).
- The hasselback 'hold back half' missing at the brush step, and no re-warm note. Both are on screen now.
- Applesauce 'Mash ... and eat'. No tester reports it.
- Parsley chopped in prep and wilting by serving. It is now chopped at the end (which brings a new complaint, see data problems).
- No damp-towel tip for tempering. It is in step 8, and testers credit it.
- The ribeye skillet not listed (the cards now print 'Heavy skillet').

Still reported:

- No sign of how late you are and no re-planning when behind. All 8 testers again said this in their ten-minutes-late answers; the static lines go stale. (Clock times were left out by decision.)
- 'Before you start' equipment missing from the screen: the thermometer (the ribeye card has it now, but the screen doesn't carry it), strainer, jar and plastic wrap. All 8 testers. In the first run this was 2 testers.
- 'Nothing needs you' shown while something is due or during hands-on work. Was 2 testers, now 8.
- Phase heading times misleading and 'Start cooking' containing no cooking. Was 2 testers, now 4 of the D testers.
- Steak: asparagus text '8 to 10' against 'thick nearer 12'. The timer is now 8-12, but the text wasn't changed (4 testers).
- Steak: no slice-the-steak or serve step, and potatoes 'served hot' before the asparagus broil. Was 1 tester for slicing; now 4 of 4.
- Steak: the asparagus pull. It is no longer delayed by the plan, but it is lost on screen because it sits on the roast step (4 of 4).
- Steak: 1.5 lemons and 'the half lemon' (4 of 4), garlic paste overproduction (4), mismatched servings (4), paste salt not subtracted (3). Each was left for later or not fixed.
- Steak: the thermometer and baste ingredients not in prep (now 4 and 3).
- Steak: hasselback prep time optimistic (3).
- Steak: applesauce stir buried in a timed step, and the lid implied but never mentioned. Was 1 tester; now 4 of 4 for each.
- Steak: no time for the flip-and-baste step (still 1 tester).
- Pavlova: no fruit for the topping and no amounts for curd and cream (4 of 4).
- Pavlova: one strainer for the curd and the syrup with no rinse (4 of 4).
- Pavlova: whipped cream made before the curd is cold and left out unchilled. Was 1 tester; now 4 of 4.
- Pavlova: preheat only after the whites wait. Was 1 tester; now 4.
- Pavlova: no on-the-day reminder to take out the saved yolks (3).
- Pavlova: butter softened too late (2).
- Pavlova: ice bath made about 25 min early. Was 1 tester; now 3.
- Pavlova: cream of tartar folded in at the end. Was 1 tester; now 2.
- Pavlova: curd and syrup could be made the day before (still 1 tester, A1).
- Pavlova: adding the sugar with a hand mixer needs three hands (still 1 tester, A1).
- Pavlova: layer order at assembly unstated. Was 1 tester; now 3.
- Pavlova: the card's 'Total: 4 hr' doesn't count the whites warm-up (the screen does now; 4 testers note the mismatch).

## Reported by one tester only (may be noise)

- Steak D2: step 20's 'Nothing needs you for about 6 min' sits on a step whose timer only starts when you tap Next. If you stay, the steak timer doesn't run. If you move on, you land on 'Microwave another...' while the first round is still going.
- Steak D1: the steak's 30-min sit-out really becomes about 37 min (35 by the plan's times), and the timer rings with nothing to do.
- Steak A2: leftover garlic paste is left on the counter, and the card says never to leave oil-covered garlic at room temperature.
- Steak A2: the ribeye flip-and-baste step has no time estimate.
- Steak A1: step 10 'Peel the garlic cloves, if using' reads as if step 1 already did them.
- Steak A1: 'Use immediately, or jar it' for the paste is unclear about which applies. (Steps 8-9 overall were reported by all 4 steak testers, as a literal failure.)
- Pavlova A2: step 16 'Then refrigerate it' follows two syrup steps, so 'it' is ambiguous. Only the tag says curd.
- Pavlova D1: step 16's 'Nothing needs you for about 40 min' has no timer ending at 40 min, so nothing says when to start the cream.
- Pavlova A1: the curd (keeps 5 days) and the syrup could be made the day before.
- Pavlova A1: adding the sugar with a hand mixer while beating needs three hands.
- Pavlova D1: the card's 'cold cream' reminder is missing from the screen.
- Pavlova D2: the screen's 'they keep 2 days' for the yolks isn't on the printed card. (It comes from the recipe's prep-only step, which the cards don't print.)
- Pavlova D1: the pavlova card lists the lemon curd as 'optional', but the screen builds the day around it.
- Dropped against the files, steak A1: 'the plan's timer bookkeeping is internally inconsistent, which suggests the step-duration estimates are off.' Recomputed from assets/planner.mjs, the potato and steak timers end 2 min apart throughout. The jumps come from the test view's about() rounding values of 20 min or more to the nearest 5. The inconsistency is real on screen (a presentation problem) but not in the plan.
- Dropped against the files, pavlova D1 and D2: the cream gets syrup before its 1-hr fridge timer ends, or the syrup timer vanishes with about 2 min left. By the plan's times, the syrup timer ends at 110.5 min, exactly when step 18 starts. Step 17's 'about 20 min' for the curd is a rounded 22. The doubt that 1 hr makes the syrup fully cold is kept as a data problem.
- Dropped against the files, D1 and D2: step 21 says 8 min while the potato timer drops only 6. The plan has steps 21 and 22 exactly 8 min apart (67 to 75), and the '20' at step 21 is a rounded 22.
- Partly contradicted, D1: 'warming the set basting butter' was easy to miss. The warm-it instruction is on screen at step 25 (D2's related claim about mixing it 70 min early is accurate).

