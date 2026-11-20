# Multi-user: the security rules

2026-11-19 · written before the multi-user project starts (`docs/ideas.md`, "Multi-user"), so its design is built to these rules rather than checked against them afterwards.

Today GitHub decides who can change the site: saving commits with the signed-in person's own GitHub token, and only someone who can push gets through. Once people keep their own recipes, notes and settings in D1, **the Worker's own code decides**, on every request. The rules below are what it must hold to. Each says how it's checked, so it isn't only a sentence.

## Who's involved

- **Visitors:** not signed in. They see the public site.
- **Signed-in people:** friends and family, each with their own things.
- **Editors:** today only Jacob, who can change the shared recipes on main.
- **Someone with a stolen session:** treated as that person, so a session must be easy to end and must not reach more than that person could.

## The rules

1. **Who's asking comes from the session, nothing else.** A user id, owner, role or email in the request body, the address or a header is ignored. *Checked by:* the `REVIEW.md` checklist.
2. **Each person's things are reached only by them.** Every D1 query that reads, changes or deletes something a person owns is limited to that person (`WHERE user_id = ?`, with the id from the session), including lists, counts, search and export. Someone else's thing answers 404, the same as one that doesn't exist, so ids can't be probed. *Checked by:* an ownership law in `worker/test/` for each table a person owns: two random people, random requests, and neither ever sees or changes the other's rows.
3. **The shared recipes change only by an editor,** however the library question below is answered. *Checked by:* the laws at the end of `worker/test/save.test.js`.
4. **Changes only come from the site's own pages, by POST,** with the `Origin` check `/api/save` has. *Checked by:* the same laws, extended to each new route that changes something.
5. **Every route asks who's signed in first,** and a visitor gets 401 from all but sign-in's own. *Checked by:* `worker/test/access-laws.test.js`, which fails when a route the code names isn't in its list.
6. **What people write is shown as text, never as HTML.** Once one person's recipe is shown to another, a missed `esc()` lets one account act as another. A Content-Security-Policy (`script-src 'self'`) goes in before the first shared recipe. *Checked by:* the checklist, and a test that the header is served.
7. **One account can't use up everyone's share.** Limits per person on saves, recipe size, `/api/fetch` and the AI step, so the free plan's daily allowance isn't one person's to spend. *Checked by:* an example test for each limit.
8. **Leaving is complete.** Deleting an account deletes its sessions and everything it owns; what's kept, if anything, is written down. *Checked by:* an example test that nothing of theirs is left in D1.
9. **Branch previews and local runs never touch the live database or its secret.** *Checked by:* `wrangler.jsonc` and the Cloudflare dashboard, confirmed before launch.
10. **Sessions stay as they are:** HttpOnly, Secure, `SameSite=Lax` cookies, and tokens encrypted at rest. A new way to sign in (Google, email) mustn't weaken them, and email sign-in must not say which addresses have accounts.

## How the open questions change this

- **One shared library, or each person's own copies:** with one library, rule 3 carries most of the weight, and rule 2 only covers notes and settings. With copies, rule 2 covers recipes too, and the ownership law is the main check.
- **How people sign in:** email links and passwords bring their own limits (rate of sign-in attempts, emails sent) under rule 7.
- **Audience:** friends and family let sign-in be limited to known accounts. Opening it to the public makes rules 7 and 8 matter more, and needs a privacy note.

## Checking the whole

- **Every PR** that touches the Worker, sign-in or what's saved goes through the security section of `REVIEW.md`.
- **Before launch:** a full run of the `security-audit` skill, repeated until a run finds nothing new, with a different model checking its findings. Its reports stay outside this repo, which is public.
- **Each confirmed finding** gets a test that fails before its fix.
