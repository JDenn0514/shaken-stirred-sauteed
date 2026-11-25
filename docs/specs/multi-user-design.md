# Multi-user: design

2026-11-23 · Jacob Dennen, with Claude. Decided in an interview on 2026-11-21 (summarised in `docs/ideas.md`, "Multi-user"). Built to the rules in `docs/specs/multi-user-security.md`.

## Problem Statement

Only Jacob can sign in. Friends and family can read and cook his recipes, but they can't keep their own: no recipes of theirs, nothing from a recipe website they found, no lineup built from what they actually cook. The editor, the intake, cook mode and the lineup were all built for one person's recipes, kept as files in the repo and published to everyone. Someone who wanted the site for their own cooking would need a copy of the whole project.

## Solution

Invited friends and family get an account and a **cookbook** of their own: private, starting empty, kept in the Worker's database (D1). They sign in with Google. They fill their cookbook with the same tools Jacob uses (import from a web page, photo or PDF, or write a recipe from scratch) or by tapping **Add to my cookbook** on one of Jacob's recipes, which makes a copy they own. Their recipes open on the same recipe page, cook in the same cook mode and plan in the same lineup as Jacob's.

Jacob's recipes stay where they are: files in the repo, published as the public site, which looks and works for visitors exactly as today. Jacob keeps signing in with GitHub and editing them as now.

It's an **invite-only beta**, built to the standard a public launch needs: limits for each person, complete account deletion, and laws that check nobody reaches anyone else's recipes. Opening sign-ups to anyone is a later project (`docs/ideas.md`, "Opening sign-ups").

## Names

- **Visitor:** not signed in.
- **Member:** a signed-in person other than Jacob, with a cookbook.
- **Owner:** Jacob. Signs in with GitHub, edits the public recipes, invites members.
- **Public recipes:** Jacob's recipes, the files in `recipes/`, shown to everyone.
- **Cookbook:** a member's own recipes, in D1, seen only by them.
- **Copy:** a recipe in a member's cookbook made from a public recipe with "Add to my cookbook".
- **Invite list:** the email addresses allowed to sign in with Google.

## User Stories

### Visitors

1. As a visitor, I want the site to look and work exactly as it does today, so that nothing I use goes behind a sign-in.
2. As a visitor, I want to read, cook and plan with Jacob's recipes without an account, so that I can use the site straight away.
3. As a visitor, I want Jacob's recipes to keep working offline once I've opened them, so that a weak kitchen connection doesn't stop me.
4. As a visitor who isn't invited, I want "Sign in with Google" to tell me plainly that the site is invite-only for now, so that I know why I can't get in.
5. As a visitor who isn't invited, I want nothing about me kept after I try to sign in, so that trying costs me no privacy.
6. As a visitor, I want the sign-in message to be the same whether or not my address was ever invited, so that nobody can use it to find out who has an account.

### Signing in and out

7. As an invited member, I want to sign in with my Google account, so that I don't need another password.
8. As an invited member, I want my first sign-in to create my account and an empty cookbook, so that there's nothing to set up.
9. As a member, I want to stay signed in on my phone between visits, so that I'm not signing in every time I cook.
10. As a member, I want "Sign out" in the footer of every page, as today, so that I can leave a shared device clean.
11. As a member signing out, I want my cookbook's recipes, my unsaved drafts and my lineup forgotten on that device, so that the next person to use it doesn't see them.
12. As a member, I want sign-in to send me back to the page I was on, so that I can carry on.
13. As the owner, I want to keep signing in with GitHub as now, so that editing the public recipes doesn't change.
14. As the owner, I want GitHub sign-in offered to nobody else, so that the GitHub App that can write to the repo stays mine alone.
15. As the owner, I want a Google sign-in with my address refused, never joined to me, so that accounts are never joined by email.

### Invites

16. As the owner, I want an "Invite" form that only I can see, so that I can let someone in by their email address.
17. As the owner, I want to see who's invited and whether they've signed in yet, so that I know who's using the beta.
18. As the owner, I want to take someone off the invite list, confirmed by typing, so that I can end their access; their account and cookbook are deleted on their next request, as with Delete my account.
19. As the owner, I want inviting the same address twice to do nothing new, so that I can't make a mess of the list.
20. As an invited person, I want my invite to work with the Google account for that address however I type its capitals, so that a small difference doesn't lock me out.
21. As an invited person, I want sign-in to accept only an address Google has verified, so that nobody can claim my invite with an unverified address.

### My cookbook

22. As a member, I want the home and recipes pages to show my cookbook when I'm signed in, so that the site is about my cooking.
23. As a member, I want an empty cookbook to say what to do first (add a recipe, or browse Jacob's), so that I'm not faced with a blank page.
24. As a member, I want search, sections, filters and sorting to work on my cookbook as they do on Jacob's recipes, so that I find my recipes the same way.
25. As a member, I want to switch to Jacob's recipes in one tap, and back, so that I can browse them for ideas.
26. As a member, I want my recipes to open on the same recipe page, with scaling, notes and the source, so that they look as good as Jacob's.
27. As a member, I want my recipe's address to be one I can bookmark, so that I can go straight back to it.
28. As a member, I want an address for someone else's recipe to look the same as one that doesn't exist, so that nobody can tell what's in my cookbook by guessing.
29. As a member, I want my recipes to need a connection to open, but cook mode to keep working once a recipe is open, so that a dropped signal mid-cook doesn't matter.
30. As a member, I want a clear message when my cookbook can't be reached (offline, signed out, or the day's allowance used up), so that I know what's wrong and when it'll work.

### Adding and editing my recipes

31. As a member, I want "Add recipe" to take a recipe website's address, a PDF or text from a photo, as it does for Jacob, so that I can bring in recipes from anywhere.
32. As a member, I want the intake's "Continue in the editor" to open the recipe in the editor, saving to my cookbook, so that the whole flow works for me.
33. As a member, I want to start a recipe from scratch in the editor, so that I can write down my own.
34. As a member, I want Save to put the recipe in my cookbook at once, so that it's there straight away (not a minute later, as Jacob's are).
35. As a member, I want **Edit** on each of my recipes, so that I can change them.
36. As a member, I want to delete one of my recipes by typing its name to confirm, as Jacob does, so that I don't delete one by accident.
37. As a member, I want a recipe another of mine links to kept from being deleted, so that my lineup doesn't break.
38. As a member, I want the editor to tell me if I changed the same recipe on another device since I opened it, so that I don't overwrite my own changes.
39. As a member, I want my recipes checked by the same recipe checker as Jacob's, with the same messages, so that what I save always works in cook mode and the lineup.
40. As a member, I want to choose tags from the same list as Jacob's, so that filters work across both.
41. As a member, I want a linked ingredient ("made from another recipe") to offer only recipes in my cookbook, so that every link leads somewhere I can open.
42. As a member, I want the photo or PDF I import from never to be stored, only the recipe's text, so that nothing of mine is kept that I didn't mean to save.
43. As a member, I want my unsaved draft kept on the device while I work, as Jacob's is, so that a closed tab doesn't lose it.

### Add to my cookbook

44. As a member, I want **Add to my cookbook** on each of Jacob's recipes, so that I can keep the ones I like.
45. As a member, I want the copy to be mine to change, so that I can make it my way.
46. As a member, I want my copy to stay as it was when Jacob changes his, so that my changes are never undone.
47. As a member, I want the copy to keep the recipe's real source, so that credit goes where it's due.
48. As a member, I want a copy of one of Jacob's own recipes credited "Jacob Dennen's recipe, Shaken, Stirred & Sautéed", with a link to it, so that it's honest about where it came from.
49. As a member, I want recipes a copied recipe links to (a sauce, a dough) copied with it, so that it works in cook mode and the lineup.
50. As a member, I want a linked recipe I've already copied reused rather than copied twice, so that my cookbook doesn't fill up with duplicates.
51. As a member, I want "Add to my cookbook" on a recipe I've already added to say so and open my copy, so that I don't make a second one by mistake.
52. As a member, I want a copy whose name clashes with a different recipe of mine saved under a new name, so that neither is lost.
53. As a member, I want to be told when adding would go over my recipe limit, with nothing half-copied, so that my cookbook stays whole.

### Cooking and the lineup

54. As a member, I want cook mode to work on my recipes exactly as on Jacob's, so that cooking from my cookbook is just as easy.
55. As a member, I want the lineup to plan a meal from my recipes, so that I can cook several of mine together.
56. As a member, I want the lineup to pick from my cookbook while I'm signed in, so that it's never mixing up my copy and Jacob's recipe of the same name.
57. As a member, I want my lineup kept on my device as today, so that it's there when I come back.

### Limits

58. As a member, I want to know how many recipes I can keep (500 to start), so that I'm not surprised.
59. As a member, I want a limit I've reached for the day (100 saves, 30 web pages fetched, 10 AI tidies) to say "try again tomorrow" without breaking anything else, so that I can keep cooking.
60. As a member, I want what I was working on kept when a save is refused for a limit, so that I can save it tomorrow.
61. As the owner, I want one person's use never to use up everyone's share of Cloudflare's free allowance, so that the site stays up for everyone.
62. As the owner, I want a feature that hits Cloudflare's own daily limit to pause until midnight UTC with a clear message, rather than fail with an error, so that nobody thinks the site is broken.
63. As the owner, I want the limits to be easy to change during the beta, so that I can tune them to real use.

### Leaving

64. As a member, I want **Download my recipes** to give me a file of all my recipes in the site's recipe format, so that I can keep them or take them elsewhere.
65. As a member, I want **Delete my account**, confirmed by typing a phrase, so that I can leave completely.
66. As a member deleting my account, I want everything of mine removed from the database (account, sessions, recipes, limits used, invite), so that nothing is left behind.
67. As a member deleting my account, I want to be signed out and my device forgotten, as with signing out, so that I leave nothing on the device either.
68. As the owner, I want what's kept after an account is deleted written down (nothing, today), so that the privacy note can say it truthfully later.

### Keeping it safe

69. As a member, I want nobody else, including other members, to see or change my recipes, so that my cookbook is private.
70. As a member, I want who I am to come only from my session, never from anything a page sends, so that nobody can act as me by editing a request.
71. As the owner, I want the public recipes still changed only by me, so that members can't touch the public site.
72. As the owner, I want every change to come only from the site's own pages by POST, as saving does now, so that another site can't change anything.
73. As the owner, I want branch previews and local runs never to reach the live database or its secret, so that untested code can't touch members' data.
74. As the owner, I want a full security audit before the beta opens, so that problems are found before friends' data is in it.

### The Worker in TypeScript

75. As the owner, I want the Worker converted to TypeScript before any multi-user code is written, with no change in behaviour, so that the new code is checked from its first line.
76. As the owner, I want the type check to run in `npm run check` and the pre-push hook, so that a type error is caught like a lint error.

## Implementation Decisions

### The Worker becomes TypeScript first

- The first step converts today's Worker and its tests to TypeScript with no change in behaviour: the existing Worker tests, converted, are the proof. Wrangler and the Worker's test runner run TypeScript directly, so the site still has no build step. The site's pages stay plain JavaScript.
- The recipe checker stays one JavaScript file shared by the site, the build script and the Worker. The Worker imports it as it is, with type declarations for what it uses.
- A type check (no output files) joins `npm run check`.

### Who's who

- The owner is the GitHub account in the existing allowlist of GitHub account IDs. That list, and GitHub sign-in, stay exactly as they are.
- Members sign in with Google, added as a second sign-in provider in Better Auth. Better Auth's account linking stays off, so a Google account is never joined to the owner's GitHub account, whatever its email.
- A Google sign-in is let in only when Google says the address is verified and it's on the invite list, compared in lower case. The check runs in Better Auth's user-creation hook (`databaseHooks.user.create.before`), so an uninvited sign-in leaves no row. Step 2 first confirms that hook runs for a social sign-in; if it doesn't, Google falls back to what GitHub does. GitHub's check stays as it is: it runs after the callback (`onlyListed` in `worker/src/index.js`) and deletes the rows Better Auth already wrote.
- A Google sign-in with the owner's email is refused: the `user` table's email is unique and account linking is off, so Better Auth won't make a second user or join the two.
- Every refused sign-in (not invited, unverified, the owner's email on Google, a GitHub account not on the list) gets the same message: "This site is invite-only for now."
- Google's way back (`GET /api/auth/callback/google`) joins GitHub's on the short list of Better Auth routes the Worker lets through, and in `ROUTES` and `PUBLIC` in `worker/test/access-laws.test.js`.
- A member taken off the invite list has everything of theirs deleted on their next request (the same deletes as Delete my account), the way an account taken off the GitHub allowlist is today. Removing an invite is confirmed by typing on the invite form, which says it deletes their recipes.
- `isAllowed` (`worker/src/auth.js`) today lets in only users whose every account is a listed GitHub account, so as it stands it would delete every member. It becomes: the owner (on the GitHub list) or a member whose email is on the invite list. `removeUser` gains the new tables.
- "Who's signed in" (`/api/me`) answers `{ name, role }`, where `role` is `owner` or `member` (signed out stays a 401). Only the owner's answer asks GitHub, and adds `canEdit` (push permission) as today; a member has no GitHub token and never reaches GitHub. Pages decide what to show from it; the Worker decides what's allowed from the session.

### What's stored (new D1 tables, by migration)

- **Invites:** email (lower case, unique), when invited. Whether they've signed in comes from the user table.
- **Recipes:** owner (user id), slug, the recipe as JSON, its index entry (what the recipes page lists, made by the same code that builds `recipes/index.json` for one recipe), a version number that goes up on every save, the public recipe it was copied from (if any), and when it was created and changed. Unique on owner and slug, with an index on owner, so every read is limited to one person and never scans the table.
- **Usage:** user id, day (UTC), kind (save, fetch, AI), count. One row per person per kind per day. Old days are removed by a daily clean-up.
- The cleanup is one Cron Trigger (the free plan allows five), which also removes expired sessions and sign-in checks.
- All of a person's rows are found by their user id, so deleting an account is a fixed list of deletes, run as one batch.
- The tables go in the existing D1 database, `shaken-stirred-sauteed-auth`. D1 can't rename a database, so it keeps the name; step 3 updates the comment in `wrangler.jsonc` to say it holds cookbooks too.

### The cookbook API (new Worker routes, all signed-in only)

- **List my cookbook:** the index entries of all my recipes, in the same shape as `recipes/index.json`, so the recipes page's existing list rules (`recipe-list.mjs`) work on it unchanged.
- **Open one of my recipes:** the recipe and its version. Someone else's recipe, and one that doesn't exist, both answer 404.
- **Save one of my recipes (POST):** slug, recipe and the version it was opened at (none for a new one). The Worker runs the recipe checker and refuses what the build would refuse, with the checker's own messages; refuses a link to a recipe not in the cookbook; refuses a save made against an older version ("changed on another device"); and counts it against the daily save limit and the recipe limit.
- **Delete one of my recipes (POST):** slug and version; refused while another of my recipes links to it.
- **Add to my cookbook (POST):** a public recipe's slug. The Worker reads the public recipe and the ones it links to from the site's own files (not from anything the page sends), then copies them in one batch:
  - A public recipe already copied (found by "copied from") isn't copied again; links point to the existing copy. Adding a recipe already in the cookbook answers with the existing copy's slug.
  - A slug taken by a different recipe of mine gets a numbered slug, and links in the copy are rewritten to match.
  - The copy's `source` is the public recipe's `source`; if it has none, `{ "name": "Jacob Dennen's recipe, Shaken, Stirred & Sautéed", "url": <the public recipe's page> }`.
  - All or nothing: over the recipe limit, nothing is copied.
- **Download my recipes:** every recipe of mine, as one JSON file: slug to recipe, in the repo's recipe format.
- **Delete my account (POST):** with the typed confirmation phrase in the body. Deletes everything listed above, then the session, and answers with a cleared sign-in cookie.
- **Invites (owner only):** list, add and remove. A member asking answers 404.
- Every POST checks `Origin`, as `/api/save` does. Every route takes the user id from the session only.
- A limit that's reached answers 429 with which limit and when it resets. D1's own "daily limit exceeded" error is turned into the same answer, never a 500: it's caught before the Worker's top-level `catch`, which today turns every error into 500 "Sign-in isn't working" and restarts Better Auth.
- `/api/fetch` stays signed-in only and gains the per-member daily limit. The owner has no limits.
- The "Tidy up with AI" step isn't built yet. When it is, it gets the per-member daily limit from the start.
- **CPU time:** the free plan allows 10 ms of CPU per request. Saving and Add to my cookbook run the recipe checker, so the build checks the CPU time of a real save of the largest real recipe, and of a copy with links, before launch.

### Limits (starting values, kept in one place in the Worker's config)

| Per member | Limit |
|---|---|
| Recipes in a cookbook | 500 |
| Saves a day (including Add to my cookbook and deletes) | 100 |
| Web pages fetched a day | 30 |
| AI tidies a day | 10 |
| Recipe size | the size of the largest real recipe, with room to spare |

Days are UTC, matching Cloudflare's own reset.

### The pages

- Pages load recipes through one small module that knows where a recipe comes from: the public files when signed out (or browsing Jacob's), the cookbook API when a member is signed in. The pages' drawing code takes recipes as data and doesn't care where they came from. The recipe page, the recipes page, the home page, cook mode, the lineup, the editor and the intake all go through it.
- A member's recipe has its own address, telling it apart from a public recipe with the same slug, so a copy and its original never collide in a bookmark or in the lineup.
- The recipes page and home page show "My cookbook" when a member is signed in, with a switch to Jacob's recipes. A public recipe shows **Add to my cookbook** to a signed-in member.
- The editor and intake save through the cookbook API for a member and through `/api/save` (GitHub) for the owner. The editor's saving part was built to be swapped like this (`docs/specs/recipe-editor-design.md`). For a member, the editor's linked-recipe picker offers only their cookbook.
- The lineup, signed in as a member, picks from their cookbook. The lineup on the device is forgotten on sign-out, along with the drafts it already forgets.
- The service worker never stores answers from `/api/`. A member's recipe open on the page stays in memory, so cook mode keeps going without a connection.
- A new **Account** page (signed in only): Download my recipes and Delete my account for members; the invite list for the owner. It's added to the accessibility scan's pages.
- Nothing a member wrote is ever put into a page as HTML (security rule 6). Their recipes go through the same escaping as Jacob's, under the Content-Security-Policy already in place.

### Settled elsewhere and unchanged

- Jacob's recipes stay files in the repo, saved by committing to main, published as static files.
- Hosting stays one Worker on Cloudflare's free plan, with the site's files served as they are.

## Testing Decisions

- **Two places to test, both existing:** the Worker's tests (Vitest in Cloudflare's real runtime with a local D1) for everything the server does, and the browser tests through `tests/e2e/fixtures.mjs` for what a person sees. No new test seam.
- **Test what a person or a request sees:** answers, status codes, what's in the cookbook afterwards, what's on the page. Not internal functions or table layouts.
- **Worker tests, through real HTTP requests:**
  - Google sign-in against a fake Google, alongside the existing fake GitHub: invited, not invited (no row left, same message), unverified address, capitals in the address, taken off the list (nothing of theirs left), a Google account with the owner's email refused (no row added, nothing joined, same message).
  - Each cookbook route: list, open, save (checker refusals with their messages, version clash, links outside the cookbook), delete (linked recipe kept).
  - Add to my cookbook: a recipe with no links, with nested and connected links, a linked recipe already copied, a slug clash, a second add of the same recipe, the credit with and without a `source`, and going over the recipe limit (nothing copied).
  - Limits: each one refused at its value and reset the next day; D1's own daily-limit error answered as a 429.
  - Download (every recipe, in the recipe format) and Delete my account (nothing of theirs left in any table, security rule 8).
  - Invites: owner only, adding twice, removing signs the person out.
- **Laws (`worker/test/access-laws.test.js` and the end of `save.test.js`):** every new route goes in `ROUTES`. A new ownership law: two random members and random requests across every cookbook route, and neither ever sees or changes the other's recipes, whose answers look the same as for a recipe that doesn't exist (security rule 2). The existing "only an editor changes main" laws gain members as one more kind of person who never changes main. Before trusting the new law, break the owner check for a moment and watch it fail.
- **The contract between the Worker and the pages' fake:** one shared file of example answers, one for each cookbook route the pages use (including a limit reached). A Worker contract test makes each request for real and checks its answer has the same shape as the example. The browser tests' fake cookbook answers with those same examples. A change to the Worker's answers fails its contract test until the example changes, and then the browser tests run against the new shape.
- **Browser tests, one per control:** the recipes and home pages showing my cookbook and the switch to Jacob's, an empty cookbook's first steps, Add to my cookbook (and "already added"), the editor and intake saving to my cookbook, a member's recipe page and cook mode, cook mode carrying on when the connection drops, the lineup picking from my cookbook, a limit's message, sign-out forgetting the lineup, and the Account page's buttons. Rules about what a list shows stay in `tests/unit/recipe-list.test.mjs`.
- **The accessibility scan** gains the Account page (member and owner) and the empty cookbook, in light and dark.
- **The TypeScript conversion** is checked by today's Worker tests passing unchanged and the type check passing in `npm run check`.
- **Prior art:** `worker/test/owner-only.test.js` (allowlist, no rows left), `save.test.js` (saving, version clashes, the checker's messages, laws), `access-laws.test.js` (route laws), `fetch.test.js` with `fake-sites.js` (a fake outside service), `tests/e2e/sign-in.spec.mjs` (faking signed in), and `planner-laws.test.mjs` (laws with a replayable seed).
- **Not tested on purpose,** as elsewhere: screenshots, offline mode (beyond cook mode keeping a recipe it has open), print.

## Out of Scope

- Anyone signing up without an invite; Turnstile; a privacy note; email-link sign-in; passkeys (`docs/ideas.md`, "Opening sign-ups").
- GitHub sign-in for anyone but the owner, ever.
- Sharing a recipe by link, and public cookbooks with following (their own projects).
- Moving Jacob's recipes into D1, and the demo before signing up.
- Notes on Jacob's recipes, settings that follow a person across devices, saved lineups in the account, the last scaled size.
- Feedback and bug reports (the first project after the beta opens; beta testers text Jacob).
- Storing photos or PDFs for members, and recipe photos of any kind.
- Offline use of a member's recipes beyond the one open in cook mode.
- The "Tidy up with AI" step itself (only its limit is decided here).
- A paid Cloudflare plan.

## Further Notes

### Cloudflare's free plan (checked 2026-11-21)

| | Free plan | For this project |
|---|---|---|
| Worker requests | 100,000 a day; static files are free and don't count | Only `/api/` runs the Worker |
| CPU time | 10 ms a request | The tightest limit: check saving and copying (above) |
| Outgoing requests | 50 a request, 1,000 to Cloudflare's services | Plenty |
| D1 | 5 million rows read and 100,000 written a day; 500 MB a database, 5 GB an account; since 2026-09-01, queries fail once a daily limit is hit, until midnight UTC | About 100,000 recipes at ~5 KB each; reads stay small with the owner index |
| Workers AI | 10,000 Neurons a day for the whole account; some large models now need the paid plan | Shared by everyone: the per-member AI limit matters |
| Cron Triggers | 5 an account | One for the daily clean-up |

### Build order

Each step is its own PR, merged when CI passes, and keeps the site working for visitors and the owner.

1. The Worker in TypeScript, no change in behaviour.
2. Invites and Google sign-in, with the role in "who's signed in", and the invite list (Worker only, managed by hand until step 9).
3. The cookbook API: tables, routes, limits, the ownership law, the contract examples.
4. The pages read from my cookbook: the loading module, recipes and home pages, the recipe page and cook mode.
5. The editor and intake save to my cookbook.
6. Add to my cookbook.
7. The lineup on my cookbook.
8. The Account page: Download my recipes and Delete my account.
9. The owner's invite form on the Account page.
10. Before the beta opens: confirm local runs and the dashboard can't reach the live database (rule 9; previews already can't, since PR #98 gave them no database, settings or secrets, checked 2026-11-20), measure CPU time on real saves, a full `security-audit` run repeated until it finds nothing new, and the README brought up to date.
