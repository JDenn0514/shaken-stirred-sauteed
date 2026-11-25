# Ideas for later

Projects that came up while designing something else. None of them is planned yet. When one starts, it gets its own spec in `docs/specs/`.

## Recipe import tool

2026-11-03 · from the cook mode design (`docs/specs/cook-mode-design.md`, where it's a planned separate project) and the lineup design (`docs/specs/meal-planner-design.md`)

A tool that turns a recipe from a web page or a photo into the site's recipe JSON, ready for Jacob to review.

**What it reads:**

- **Web pages:** most recipe sites embed the recipe as structured data (schema.org `Recipe` in JSON-LD): name, yield, times, ingredients and steps. The recipe card's notes usually aren't in that data and have to be read from the page. That's how the ribeye and whipped cream recipes were added by hand.
- **Photos:** a cookbook page or a handwritten card.
- **What you tell it:** your own recipes, like the blueberry syrup and blueberry whipped cream, worked out in conversation.

**What it writes, beyond copying the recipe:**

- **The source's steps, as written,** reworded in the site's style. Its order is kept, so "as written" means what the source said.
- **Waits:** timing hidden in step text ("beat for 3 to 4 minutes") moves into `wait`, so cook mode gives it a timer. A tip like "let the steak sit out 30 minutes" can become a step of its own with a wait, so cook mode times it and a meal can start it early.
- **Step ingredients:** `uses` links from each step to its ingredients, including a step's own share of a split ingredient.
- **Prep:** `prep` marks on steps that can be done before any cooking, `"just before"` where doing it early would hurt the dish, and added `prepOnly` steps for prep hidden in ingredient lines ("garlic, minced"). That lets the recipe show prep first or as written.
- **Planning data:** hands-on minutes, waits that need you there, oven, broiler, burner, grill or microwave use, the point after which the dish keeps, and how it's served.
- **Linked recipes:** an ingredient that's a recipe on the site ("garlic paste", "lemon curd") links to it, and an optional ingredient is marked `optional`. Required links are nested recipes, which come with the dish; optional ones are connected recipes, added on their own (see the lineup spec). One the source makes elsewhere ("steak seasoning, see recipe") is flagged, so Jacob can decide whether to add it.
- **Tags** from `recipes/vocabulary.json`. A recipe that belongs in two sections (blueberry syrup in Cocktails and Baking) can only have one `category` today; see "A recipe in more than one section" below.

**Rules it should follow:**

- **Say what it guessed.** Estimated times, cues and tags it filled in are listed for review, never passed off as the source's. When the cook doesn't know a time ("until the sugar dissolved"), it writes an "About" estimate and says so.
- **Credit the source** in `source`, and don't copy a source's text word for word.
- **Run the recipe checker** (`node scripts/build-index.mjs`) before handing it over.
- **Note:** fetching a site needs it allowed in the cloud environment's network settings. The same sites worked from the command line before the web-fetch tool picked up the change.

## A recipe in more than one section

2026-11-10 · from Jacob, answering the editor review (`docs/specs/editor-redesign.md`, decision 6)

Blueberry syrup goes in pancakes (Cooking), on cakes (Baking) and in drinks (Cocktails), but a recipe has one `category` today, so it shows in one section only.

**Things to work out:**

- **Home and guest sections:** one section stays the recipe's own (its colours, drawing and page), and it's listed in the others too. Or it has no single home.
- **Tags:** each section has its own tags in `recipes/vocabulary.json`, so a recipe in two sections may need tags from both.
- **What changes:** the recipe format (`category` as a list, or a new field such as `alsoIn`), the checker, `recipes/index.json`, the section pages and filters, and the editor's section control (decision 6 in the editor review, built so it can grow from one section to several).
- **Components:** most recipes that belong in several sections are components (syrups, sauces, curds). Linking from other recipes may already cover some of the need.

## Step controls you can find in the editor

2026-11-09 · from adding the 50-clove garlic soup through the intake

The editor (`edit.html`, and `edit.html?new` from the intake) can already add, remove, move, split and join steps, but you can't tell. The controls only show once you tap a step's text, and nothing says the text can be tapped: it looks like a dotted underline, not a button. Adding the garlic soup, its step 2 ("Cook garlic 5 minutes in butter. Onion 2 minutes, potato 1 minute then add stock…") needed splitting, and it looked like there was no way to add a step between two others or delete one.

**What it could change:**

- **Show that a step can be edited:** an "Edit" button on each step, or a hint at the top of the steps, not only the dotted underline.
- **Add a step in the middle:** "Add step" only adds at the end today (`add` in `assets/edit-model.mjs`), and then you move it up one place at a time. An "Add a step after this" button would be quicker.
- **Remove without opening the step**, perhaps, if it's easy to undo.
- **Where the wait goes when splitting:** "Split here" gives the step's wait, cue and equipment to the second part (`SECOND` in `assets/edit-model.mjs`). That's right for "Stir in the flour, then bake 20 minutes", but wrong when the time is in the first part, as with the soup's "Cook garlic 5 minutes". The wait could go to whichever part has that time in its text, the way the intake works out which sentence a step's wait belongs to, or the editor could ask.
- **A step with several timed parts** ("Onion 2 minutes, potato 1 minute") could be offered as a split from the start, the way the intake already asks about a second wait in a step and splits the step there.

## Scaling a recipe

2026-11-10 · from Jacob

A size choice at the top of the recipe page: **1x** (the default), **2x**, **3x** and **Custom**. Picking one changes the amount of every ingredient to match.

**Things to work out:**

- **Which amounts can scale:** `grams`, `ml` and `qty` scale. A `qty` is text ("3/4 cup", "1 1/2 tsp"), so it has to be read as a number and written back as a kitchen fraction ("1 1/2 cups", not "1.5 cups"). A plain-string ingredient ("Salt to taste") can't be read, so it stays as written, perhaps with a mark saying so.
- **Custom:** a number like 1.5 or 0.5, or "how many servings" when the recipe's `yield` has a number in it ("Serves 6", "Makes 24 cookies").
- **What else changes:** the `yield` line, and a step's share of an ingredient in cook mode (`uses` with `"amount": "100 g"`). Shares like "half" or "the rest" stay as they are.
- **What doesn't scale on its own:** times, pan size, eggs (2.5 eggs), and spices or salt, which often shouldn't go up as fast as the rest. The page could say so when the size isn't 1x, rather than guess.
- **Where it goes:** whether cook mode and the lineup pick up the size from the recipe page, or have their own. A lineup cooking a double batch is the case that needs it.
- **Remembered or not:** whether the size resets to 1x each time the recipe opens.

## Metric and imperial amounts

2026-11-11 · from Jacob, while choosing the recipe format rules

Every ingredient carries both a metric and an imperial amount, and you choose which one the site shows. Today a recipe gives one measure, or both in two places: the metric number in `grams` or `ml`, and the US one as text in `qty` (`{ "grams": 300, "qty": "10.5 oz", "item": "Yellow noodles" }`, shown as "300 g · 10.5 oz").

**A format Jacob suggested:** both amounts nested in `qty`, each a number with its unit:

```json
{ "qty": { "g": 300, "oz": 10.5 }, "item": "Yellow noodles" }
```

**Things to work out:**

- **Amounts that aren't a unit pair:** "to taste", "2 cloves", "1 large", "1 can (28 oz)". Either `qty` stays text for those, or it becomes an object with fields such as `count` or `text`.
- **Converting the recipes:** amounts already in `grams`/`ml` move over mechanically. The others need converting, and cups to grams depends on the ingredient (a cup of flour and a cup of sugar weigh different amounts), so those need a table per ingredient or a person to check them.
- **What reads `qty` today:** the recipe page, cook mode, the editor, search, the recipe checker and the random recipes the recipe laws test with. Each would change.
- **The choice itself:** a switch on the recipe page, or the "Units" setting on the settings page (below).
- **Scaling** (above) wants the same thing, amounts as numbers, so the two could share a format.

## Your own notes on a recipe

2026-11-10 · from Jacob

A button on the recipe page, such as "Add a note", that lets you write your own notes on a recipe: what you changed, what to do differently next time, who liked it. They show on the recipe each time you open it, beside the recipe's own `notes` but marked as yours, and can be edited or deleted.

**Things to work out:**

- **Where they're saved:** on the device in `localStorage` is the easy start, but a note written on a phone won't show on a laptop, and clearing the browser loses it. That's the same question as the settings page's "Multiple users" below: notes belong to a person, so they need to be kept in one place that could later be saved per person.
- **Kept with the recipe, or not:** a note that's good for everyone could be copied into the recipe's `notes` with the editor instead.
- **Where they show:** in their own section on the recipe page, and maybe in cook mode, since that's when you'd want to remember "use less salt".
- **Notes on a step,** not only the whole recipe, could come later.

## Settings page

2026-11-03 · from the lineup design (`docs/specs/meal-planner-design.md`)

A page that holds your cooking preferences so you don't pick them every time. The first one is **prep first**: the lineup's "Prep everything first" or "Fastest", which also decides whether a single recipe shows its steps prep first or as written. Until this page exists, the lineup page and the recipe page's order toggle remember that choice themselves.

Other settings that could move here:

- **Theme.** It's saved today as `theme`, by `assets/theme.js`.
- **Your pace,** if the planner learns how fast you cook.
- **Cooking setup:** number of burners, ovens and so on.
- **Units:** grams or cups first.

**Saved where:** the theme is kept on the device in `localStorage`, and settings could start there too. **Multiple users** is what would change that. If the site ever plans for more than one person (each with their own pace, preferences and saved meals), settings need to belong to a person, not a device. That means some kind of account or profile, and somewhere to store it beyond the browser. That decision belongs to the multi-user project. A settings page on the device first doesn't block it, as long as the settings are kept in one place that could later be saved per person.

## Multi-user

2026-11-01 · from the recipe editor design (`docs/specs/recipe-editor-design.md`, where it's under "Later")

Accounts for friends and family, so each person can add their own recipes and keep their own things on the site. Today only Jacob can sign in and edit; visitors see the site without an account.

**What's already in place:** sign-in with GitHub through Better Auth in the Worker, with its tables in D1 (Cloudflare's database). Better Auth can add Google or email sign-in for others. The editor is built to be reused, with only saving swapped: from "commit to the repo" to "save to my account" in D1. D1 only holds sign-in data today.

**Decided** on 2026-11-21 (the open questions parked on 2026-11-01). The spec is `docs/specs/multi-user-design.md`, built on `docs/specs/multi-user-security.md`.

- **Audience:** an invite-only beta first, built to the standard a public launch needs (limits per person, complete deletion, the ownership laws). Opening sign-ups is its own project (below).
- **Each person has their own private cookbook** in D1, starting empty. Nobody else sees it.
- **"Add to my cookbook"** on one of Jacob's recipes makes a copy the person owns and can edit. It doesn't follow Jacob's later edits. Recipes it links to are copied with it, so the lineup still works.
- **Credit:** a copy keeps the recipe's real `source`. A copy of one of Jacob's originals gets `{ "name": "Jacob Dennen's recipe, Shaken, Stirred & Sautéed", "url": <its page> }`. Copying anyone's original credits them the same way, once recipes can be shared.
- **Same rules as Jacob's recipes:** the same recipe checker and tag vocabulary, and a linked recipe can only be one in the person's own cookbook.
- **Jacob's recipes stay in git** as the public site, unchanged for visitors. Jacob signs in with GitHub and edits them as now, with no separate cookbook in D1.
- **Signed in:** the home and recipes pages show the person's cookbook, with Jacob's one tap away. The recipe page, cook mode, scaling and the lineup work on their recipes. **The biggest piece of work:** every page loads recipes from static files today, so they need to load a person's recipes from the Worker.
- **The editor:** all of it, including import from a web page, photo or PDF. Page fetching and the AI step have daily limits per person. The photo or PDF a friend imports from isn't kept, only the recipe text.
- **Sign-in:** Google for everyone but Jacob. GitHub sign-in is Jacob's alone and is never offered to anyone else, since it goes through the GitHub App that can write to the repo.
- **Invites:** a list of email addresses in D1, with an "Invite" form only Jacob sees. Someone not on the list is told the site is invite-only, and nothing about them is kept.
- **Limits, on Cloudflare's free plan:** to start, 500 recipes, 100 saves, 30 page fetches and 10 AI tidies a day for each person, tuned during the beta. A limit that's reached says to try again tomorrow; nothing else breaks.
- **Leaving:** "Download my recipes" (a file of them in the recipe format) and "Delete my account" (type to confirm), which removes everything of theirs from D1.
- **Offline:** a person's own recipes need a connection to open, so they aren't left on a shared device after signing out. Cook mode keeps working if the connection drops once a recipe is open. Jacob's recipes work offline as now.
- **Beta feedback:** testers text Jacob. The feedback feature (below) comes soon after.
- **The Worker is written in TypeScript** from the start of this project (Wrangler runs it with no build step for the site). The site's pages stay plain JavaScript. The first step converts today's Worker and its tests (`worker/src/`, `worker/test/`, about 2,150 lines) on their own, with no change in behaviour, so the multi-user code is TypeScript from its first line. The Worker shares the recipe checker with the site (`assets/recipe-checks.js`), which stays JavaScript.

**What waits for it**, and should be kept somewhere that can later move to a person's account:

- **Settings** (above): prep first, theme, pace, cooking setup, units.
- **Your own notes on a recipe** (above).
- **Saved lineups,** and maybe the size you last scaled a recipe to.
- **Feedback and bug reports** (below).

**What comes after it:** the five projects below, roughly in that order. Feedback first, then opening sign-ups, then sharing by link, a demo before signing up, and public cookbooks.

## Opening sign-ups

2026-11-21 · from the multi-user design (above)

Letting anyone make an account, after the invite-only beta. Most of what it needs is built for the beta already (limits, deletion, the ownership laws); what's left:

- **Remove the invite list,** or keep it as a way to skip a waiting list.
- **A bot check on sign-up:** Cloudflare Turnstile (free).
- **A short privacy note:** what's kept about a person, for how long, and how to delete it.
- **Sign-in without Google:** email links ("magic links"), which need an email-sending service and their own limits on how many are sent. Email sign-in mustn't say which addresses have accounts (security rule 10).
- **Passkeys,** as a quick and phishing-proof way back in, added after signing in once with Google or an email link, so losing a device doesn't lose the account. Better Auth has a passkey plugin.
- **Limits per person** set for strangers, which may be lower than friends needed.
- **Not passwords:** the site would hold password hashes worth stealing, need guessing limits, and need email for resets anyway.

## Sharing a recipe by link

2026-11-21 · from the multi-user design (above)

A person shares one recipe from their private cookbook with a link. Anyone with the link sees it read-only, and a signed-in person can "Add to my cookbook".

**Things to work out:** whether a link can be turned off (and stops working at once), whether it shows the owner's name, and that one person's recipe shown to another is text only, never HTML (security rule 6), which is the first time that matters. A copy of a shared original credits its author with a link.

## A demo before signing up

2026-11-21 · from the multi-user design (above)

A page where a visitor can try the site before having an account: open a few recipes, cook one, and maybe add one or two of their own, kept only on their device.

**Goes with it:** moving Jacob's recipes from git into D1, so every cookbook, his included, is stored and shown the same way, with one way to save. The recipe checker, the build's index and the tests that read `recipes/` would change with it.

## Public cookbooks and following

2026-11-21 · from the multi-user design (above). The last of the sharing projects, after sharing by link.

Each person's cookbook can be public or private. Others can look at public ones, follow them or save them for ideas, and add recipes from them to their own.

**Things to work out:** profile pages and their addresses, what following shows (new recipes, a feed), finding people, and what strangers' public content needs: reporting, removing, and blocking. This is when moderation starts to matter.

## Feedback and bug reports

2026-11-10 · from Jacob, for when the multi-user version is built. 2026-11-21: the first project once the beta starts, before opening sign-ups.

A way for people using the site to send feedback or report a bug, without leaving the site or needing a GitHub account: a "Send feedback" link in the footer, and maybe "Something wrong with this recipe?" on each recipe page.

**Things to work out:**

- **Feedback, bug reports, or both:** one form with a choice ("Something's broken", "An idea", "A recipe problem"), or separate ones.
- **What it fills in for you:** the page and recipe it was sent from, the browser and device, and who sent it if they're signed in, so a report like "the timer didn't start" can be followed up. The person sees what's sent before sending it.
- **Where reports go:** a GitHub issue on this repo, opened by the Worker (the GitHub App would need permission to open issues), keeps them next to the code. A table in D1 keeps them private. Either way, the person sending one doesn't connect to anything themselves.
- **Who can send one:** signed-in people only keeps out spam. Anyone, with a limit per day, is easier for visitors.
- **Hearing back:** whether the sender can see when a report is fixed, and whether Jacob gets told when one comes in.
- **Privacy:** don't send recipe notes, settings or anything else personal unless the person adds it.

## An equipment list

2026-11-12 · from Jacob, while the editor's facts form was built (build step 18 in `docs/specs/editor-redesign.md`)

A recipe's facts box has one line for what it's cooked in: the `pan` field, shown as "Equipment" ("Medium saucepan", "9 in tart pan"). Some recipes need more than one thing: a stand mixer, a tart pan and a thermometer.

**What it could change:**

- **A list of equipment** in the recipe format, shown as its own short list on the recipe page (perhaps beside Before you start), editable in place like notes.
- **Its name needs care:** the lineup planner already calls a step's oven, burner, grill and microwave its "equipment" (`docs/specs/meal-planner-design.md`), and the checker's warning says "no equipment field". The new list would need another name in the file, or those would need rewording.
- **The `pan` line** could become the list's first entry, so nothing is said twice.

## A build step, TypeScript and React

2026-11-17 · from Jacob, after reading how OpenClaw cut its CI time (vincent.build/openclaw-ci-cost-reduction)

Today the site has no build step and no dependencies: the files in the repo are the files the browser runs. This idea adds a build step, so the site could be written in TypeScript, use React for its pages, and pull in other libraries from npm.

**What it would buy:**

- **TypeScript:** mistakes like typos, a wrong argument shape or a forgotten `null` caught before the code runs. It doesn't make the site faster (TypeScript is turned back into JavaScript), and it would replace very few tests: the tests here check behaviour (which recipes match, the planner laws, focus, cook mode), not types.
- **React:** the editor and cook mode redraw a lot of the page as you work. Components could make that code easier to grow, if it gets hard to manage by hand.
- **Other libraries:** anything from npm (a date or fraction library, drag and drop, a UI kit), bundled into the site.
- **Smaller files,** minified and bundled.

**What it would cost:**

- **The files you edit aren't the files that run.** Errors point at built code unless source maps are set up, and every change needs a rebuild or a watcher.
- **More to keep working:** a bundler (such as Vite), its config and its updates, and the libraries' updates.
- **Everything has to point at the built output:** the browser tests, the link checker, the service worker's list of files to cache, and how the site is published. Each is a place to test one thing and ship another.
- **Easy to forget,** like `recipes/index.json` today, which is why CI checks it's up to date.
- **A big move:** switching the pages to React means rewriting them, not converting them. CI would get slower, not faster, by the time the build and type check take.

**Smaller steps that get part of the way:**

- **Type checking without a build:** `// @ts-check` and JSDoc comments in the existing `.js`/`.mjs` files, checked with `tsc --noEmit` as part of `npm run check`.
- **TypeScript for `scripts/`, `tests/` and the Worker only:** Node runs `.ts` files directly now, and the Worker's tooling (Wrangler) already handles TypeScript, so those need no build step for the site.

**Things to work out:**

- **What's actually hurting:** whether the editor and cook mode code have grown hard to change, or a library is needed that can't be loaded as a plain module. Without one of those, the cost may outweigh the gain.
- **All at once or bit by bit:** a bundler can serve plain JavaScript and TypeScript side by side, so pages could move over one at a time.
- **The tests:** the browser tests mostly test what a visitor sees, so they should survive a rewrite, and they'd be how to check one.
