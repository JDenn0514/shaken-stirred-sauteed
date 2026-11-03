# Recipe editor: checks before planning

2026-11-03 · answers to "To check before planning" in [recipe-editor-design.md](recipe-editor-design.md)

**Decided after this was written (2026-11-03):** sign-in uses (b), bearer tokens with the one-time-token handoff. Originals aren't kept at all, so neither R2 nor KV is used, and the R2 and KV notes below no longer apply. The design spec has been updated to match.

Sources are primary only: Better Auth's source code, GitHub's and Cloudflare's own docs, and the Public Suffix List. This session's network blocked `docs.github.com`, `developers.cloudflare.com` and `webkit.org`, so GitHub's and Cloudflare's docs were read from the repos those sites are built from ([github/docs](https://github.com/github/docs) at commit `749d174`, 2026-11-03; [cloudflare/cloudflare-docs](https://github.com/cloudflare/cloudflare-docs) at commit `d986303`, 2026-11-03). Links below point to the live pages. Better Auth was read at [commit `0e75ddc`](https://github.com/better-auth/better-auth/tree/0e75ddcf36489aa3a191ea902a82d1892034dc74) (2026-11-01). The latest release on npm is `1.7.15`.

## Summary

**1. Better Auth with a GitHub App: yes, it works. Use Better Auth's built-in token refresh, but handle its failure case.**
- Better Auth stores the GitHub access token, the refresh token and both expiry times in its `account` table.
- Its `getAccessToken` call refreshes an expired token itself, using GitHub's refresh endpoint. We don't write the refresh.
- A GitHub App user token can commit through the Contents API and the Git Data API. It is limited to what *both* Jacob and the app can do, and only on repos where the app is installed.
- The default scopes Better Auth sends (`read:user user:email`) aren't needed. Turn them off with `disableDefaultScope: true`.
- It runs on Workers with the `nodejs_compat` flag. It talks to D1 directly through a D1 driver built into its Kysely adapter, so Drizzle isn't needed.
- Two things to handle in our code:
  - A failed refresh (for example two refreshes at once, since GitHub's refresh tokens work only once) can go unnoticed by Better Auth. The Worker should treat a 401 from GitHub as "sign in again".
  - Measure CPU time against the free plan's 10 ms limit.

**2. Sign-in from iPhone Safari: bearer tokens work, but not on their own. Recommendation: (b) bearer tokens plus a one-time-token handoff. (c), one origin on Cloudflare, is the fallback.**
- `github.io` and `workers.dev` are both on the Public Suffix List, so the site and the Worker are different sites.
- The `bearer` plugin lets the page send `Authorization: Bearer …` with no cookie. The catch is getting the token to the page after a redirect sign-in: the `set-auth-token` header is only readable on `fetch` responses.
- Sign-in also has to *start* with a full-page visit to the Worker, not a `fetch`. Otherwise Better Auth's sign-in check cookie (the OAuth "state" cookie) is blocked as a third-party cookie and the callback fails.
- Recommended handoff: Better Auth's `one-time-token` plugin plus a few lines of Worker code that put a 3-minute, single-use code in the redirect back to the site. The page swaps the code for a session token.
- Better Auth also has an experimental `oauthPopup` plugin built for this. It may break if github.com cuts the popup's link to the page (unconfirmed).
- (c) Serving the site and the API from one Worker on one `workers.dev` address makes everything first-party, and it is free. It is a hosting move, though: the site gets a new URL, and visitors lose their saved progress, which the browser keeps per address.

**3. Cloudflare free limits: plenty for this use. On the free plan, Workers, D1, KV and Workers AI stop with errors when a limit is hit; they don't bill. R2 is the exception: it has to be added as a subscription through a checkout, and use over the free amount is billed. Recommendation: keep originals in Workers KV (free, 1 GB, hard limits) instead of R2.**
- Workers: 100,000 requests a day, 10 ms CPU per request, 50 subrequests per request.
- D1: 5 million rows read and 100,000 rows written a day, 500 MB per database, 5 GB total.
- R2: 10 GB-month of storage, 1 million Class A and 10 million Class B operations a month, egress free.
- Workers AI: 10,000 Neurons a day. Llama 3.2 11B Vision costs 4,410 Neurons per million input tokens and 61,493 per million output tokens, so very roughly 70 to 120 Neurons per recipe.
- Unconfirmed: whether R2's checkout needs a card. Cloudflare's docs don't say.

---

## 1. Better Auth with a GitHub App

### Does the GitHub provider work with a GitHub App's sign-in?

Yes. GitHub Apps and OAuth apps use the same sign-in URLs (`/login/oauth/authorize` and `/login/oauth/access_token`) ([GitHub: generating a user access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)), and Better Auth's GitHub provider calls exactly those ([`github.ts`, lines 63–92](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/core/src/social-providers/github.ts#L63-L92)). Better Auth's own docs cover GitHub Apps. The one extra step they name: give the app the account permission **"Email addresses: Read-only"**, or sign-in fails with `email_not_found` ([Better Auth docs: GitHub](https://www.better-auth.com/docs/authentication/github), [source](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/docs/content/docs/authentication/github.mdx)). Better Auth reads the email from `/user/emails` when the profile has none ([`github.ts`, lines 152–171](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/core/src/social-providers/github.ts#L152-L171)).

Better Auth also sends PKCE (`code_challenge` / `code_verifier`), which GitHub supports and recommends for GitHub Apps ([GitHub: generating a user access token, web application flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-web-application-flow-to-generate-a-user-access-token)).

The GitHub App's "Callback URL" must be the Worker's callback, `https://<worker>/api/auth/callback/github`. GitHub refuses any other `redirect_uri` (`redirect_uri_mismatch`) ([same page, troubleshooting](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#redirect-uri-mismatch)).

### Are the access token and refresh token stored?

Yes.

- The `account` table has `accessToken`, `refreshToken`, `accessTokenExpiresAt` and `refreshTokenExpiresAt` columns ([`account.ts` schema](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/core/src/db/schema/account.ts#L10-L36)).
- The GitHub provider passes GitHub's whole token response to `getOAuth2Tokens`, which reads `refresh_token`, `expires_in` and `refresh_token_expires_in` ([`utils.ts`, lines 25–46](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/core/src/oauth2/utils.ts#L25-L46)).
- GitHub's response for an expiring token has `access_token` (`ghu_…`), `expires_in` (always 28800, 8 hours), `refresh_token` (`ghr_…`) and `refresh_token_expires_in` (always 15897600, 6 months) ([GitHub: refreshing user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens); response fields from [this reusable](https://github.com/github/docs/blob/main/data/reusables/apps/user-access-token-response-parameters.md)).
- Expiring tokens are on by default for new GitHub Apps. Leave "User-to-server token expiration" opted in (same page).
- Tokens are stored as plain text unless `account.encryptOAuthTokens: true` is set ([`init-options.ts`, line 1312 on](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/core/src/types/init-options.ts#L1312-L1325)). **Turn it on**: these tokens can commit to the repo.

### Does Better Auth refresh expired tokens itself?

Yes. The Worker calls `auth.api.getAccessToken({ body: { providerId: "github" }, headers })` (the `/get-access-token` endpoint). If the stored token expires within 5 seconds and there's a refresh token, Better Auth calls the provider's `refreshAccessToken`, saves the new access and refresh tokens, and returns the new one ([`account.ts` routes, `getValidAccessToken`, lines 640–754](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/better-auth/src/api/routes/account.ts#L640-L754)). The GitHub provider has a `refreshAccessToken` that posts `grant_type=refresh_token` with the client ID and secret to GitHub's token URL ([`github.ts`, lines 123–135](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/core/src/social-providers/github.ts#L123-L135); [`refresh-access-token.ts`](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/core/src/oauth2/refresh-access-token.ts#L122-L180)). That matches GitHub's documented refresh request ([GitHub: refreshing user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens#refreshing-a-user-access-token-with-a-refresh-token)).

Better Auth's own docs page says GitHub doesn't issue refresh tokens. That's true for OAuth apps only, not for GitHub Apps. The code handles both.

**Caveats, from reading the code (not tested):**

- **A refresh token works once.** "Once you use a refresh token, that refresh token and the old user access token will no longer work" ([GitHub](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens#about-user-access-tokens-that-expire)). Two requests that both find the token expired, such as two tabs or a save and a "View original", would both try to refresh. The second gets `bad_refresh_token` ([GitHub troubleshooting](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#bad-refresh-token)). Better Auth has no lock around this. One user at a time makes it rare, but possible.
- **A failed refresh may go unnoticed.** Better Auth's code-exchange step checks GitHub's answer for an `error` field ([`github.ts`, lines 116–119](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/core/src/social-providers/github.ts#L116-L119)), which suggests GitHub can send an error with a success status. The shared refresh function doesn't check for that field ([`refresh-access-token.ts`, lines 146–160](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/core/src/oauth2/refresh-access-token.ts#L146-L160)). So a failed refresh can come back as "no new token", and `getValidAccessToken` then falls back to the old, expired one. *Unconfirmed:* GitHub's docs don't state the HTTP status of these errors.
- **What to build:** one helper in the Worker that gets the token, calls GitHub, and on a `401` tells the editor "Your GitHub sign-in has expired, sign in again" rather than failing the save. Signing in again replaces the stored tokens; `updateAccountOnSignIn` is on by default ([`init-options.ts`, line 1208](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/core/src/types/init-options.ts#L1199-L1208)). A refresh token unused for 6 months also expires, so a sign-in after a long break is expected anyway.
- If the double-refresh case turns out to matter, the provider accepts a custom `refreshAccessToken` option ([`github.ts`, line 123](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/core/src/social-providers/github.ts#L123)), which could check for the error and retry from the database.

### Can the user token commit, with "Contents: read & write" and the app on this repo only?

Yes.

- "A GitHub App user access token only has permissions that both the user and the app have", and "can only access resources that both the user and app can access" ([GitHub: generating a user access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#about-user-access-tokens)). With the app installed only on this repo, the token reaches only this repo. Only Jacob has write access there, so anyone else who signs in can't commit. That matches the design's "only Jacob" reasoning.
- GitHub's permissions table puts all of these under the repository permission **"Contents"**, and all of them work with user tokens ([GitHub: permissions required for GitHub Apps, Contents](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps#repository-permissions-for-contents); data from [`user-to-server` permissions file](https://github.com/github/docs/tree/main/src/github-apps/data)):
  - Contents API: `PUT` and `DELETE /repos/{owner}/{repo}/contents/{path}` (write).
  - Git Data API: `POST …/git/blobs`, `POST …/git/trees`, `POST …/git/commits` and `PATCH …/git/refs/{ref}` (write), plus reads such as `GET …/git/ref/{ref}`.
- **Use the Git Data API, not the Contents API.** The design needs the recipe and `recipes/index.json` in one commit, and the Contents API makes one commit per file. The flow:
  1. Read the `main` ref.
  2. Create a tree with both files on top of it.
  3. Create a commit.
  4. Move `main` to it with `force: false`.

  GitHub refuses step 4 if `main` has moved since step 1, which gives "don't overwrite a change it didn't know about" for free ([GitHub REST: update a reference](https://docs.github.com/en/rest/git/refs#update-a-reference)).
- The permission data marks `PUT …/contents` and `PATCH …/git/refs` as sometimes needing an *extra* permission. That's **Workflows**, needed only for files in `.github/workflows/` (same table, "Workflows" section). The editor never touches those, so Contents alone is enough.

### Does Better Auth's default scope request cause problems?

Probably not, but turn it off anyway. Better Auth asks for `read:user user:email` unless `disableDefaultScope: true` is set ([`github.ts`, lines 76–79](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/core/src/social-providers/github.ts#L76-L79)). For GitHub Apps, GitHub says the `scope` parameter "does not control permissions" and that `offline_access` is the only supported value ([GitHub: generating a user access token, `scope` parameter](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-web-application-flow-to-generate-a-user-access-token)). GitHub always returns `scope` as an empty string for these tokens ([response fields](https://github.com/github/docs/blob/main/data/reusables/apps/user-access-token-response-parameters.md)).

GitHub doesn't say an unsupported scope causes an error, and Better Auth documents GitHub Apps working with the defaults. Still, `disableDefaultScope: true` sends nothing that GitHub calls unsupported. *To settle:* the first real sign-in.

### Workers runtime caveats

- **`nodejs_compat` flag:** Better Auth uses `AsyncLocalStorage`, so the Worker needs `compatibility_flags = ["nodejs_compat"]` (or `nodejs_als`) in its Wrangler config ([Better Auth installation, Cloudflare Workers tab](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/docs/content/docs/installation.mdx#L329-L363); [Hono integration](https://www.better-auth.com/docs/integrations/hono)).
- **D1 works directly:** pass the binding as `database: env.DB`. Better Auth's Kysely adapter has its own D1 driver, which recognises a D1 binding by its `batch`/`exec`/`prepare` methods ([`d1-sqlite-dialect.ts`](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/kysely-adapter/src/d1-sqlite-dialect.ts); [`dialect.ts`, lines 185–193](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/kysely-adapter/src/dialect.ts#L185-L193); [Better Auth docs: database, Cloudflare D1 example](https://www.better-auth.com/docs/concepts/database)). Neither Drizzle nor the community `kysely-d1` package is needed.
- **Creating the tables:** the CLI can't reach D1. Either run Better Auth's `getMigrations()` from a protected one-off Worker route, as its docs show (Kysely adapter only), or generate the SQL with the CLI and apply it with `wrangler d1 migrations` ([same docs page](https://www.better-auth.com/docs/concepts/database)).
- **No interactive transactions on D1**, only `batch()` ([`dialect.ts`, line 193](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/kysely-adapter/src/dialect.ts#L193)). Better Auth's 1.7 notes say this only blocks its SCIM plugin ([1.7 upgrade guide](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/docs/content/docs/guides/1-7-upgrade-guide.mdx#L566)), which this project doesn't use.
- **CPU time:** the free plan allows 10 ms of CPU per request. Waiting on `fetch` or D1 doesn't count. Cloudflare's own page says workloads that "handle authentication … typically use 10–20 ms" ([Workers limits, CPU time](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)). Going over now and then is tolerated ("some built-in flexibility"); going over steadily returns error 1102. We don't use password hashing, the costly part of most auth, so it's probably fine. *Unconfirmed:* measure the sign-in callback and a save with `wrangler tail` once the Worker exists.
- **Subrequests:** a save makes about 5–6 GitHub calls plus a few D1 queries, well under the free limit of 50 per request ([Workers limits, subrequests](https://developers.cloudflare.com/workers/platform/limits/#subrequests)).

---

## 2. Sign-in from iPhone Safari

### Are the site and the Worker different sites?

Yes. `github.io`, `workers.dev` and `pages.dev` are each entries on the Public Suffix List ([`public_suffix_list.dat`](https://github.com/publicsuffix/list/blob/main/public_suffix_list.dat): `pages.dev` and `workers.dev` in Cloudflare's section, `github.io` in GitHub's). So `jdenn0514.github.io` is a site of its own, and so is each `<account>.workers.dev`. Calls from the page to the Worker are cross-site.

Safari has blocked all third-party cookies by default since Safari 13.1 and iOS 13.4 ([WebKit blog: Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)). *Note:* webkit.org was blocked in this session, so this comes from the post's title and search summaries, not a full read. It's long-standing, well-known behaviour.

So a cookie on the Worker's domain won't be sent with the page's `fetch` calls on an iPhone, and won't be *set* by them either.

### What does the `bearer` plugin do?

It lets a request carry the session token as `Authorization: Bearer <token>` instead of a cookie. On the way in, it turns the header back into the session cookie internally. On the way out, any response that sets a session cookie also gets a `set-auth-token` header with the token, and it is added to `Access-Control-Expose-Headers` so cross-site JavaScript can read it ([`bearer/index.ts`](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/better-auth/src/plugins/bearer/index.ts); [Better Auth docs: Bearer](https://www.better-auth.com/docs/plugins/bearer)). Once the page has the token, every later call works on Safari with no cookies.

The docs' examples only cover email sign-in done with `fetch`, where the page reads `set-auth-token` from the response. **That doesn't work for GitHub sign-in on its own**, for two reasons:

1. **Getting the token back.** The callback from GitHub is a full-page redirect. The `set-auth-token` header is on that redirect response, but page JavaScript can't read headers on a navigation, only on a `fetch` response. So the page arrives back on `github.io` with no token.
2. **Starting sign-in.** Better Auth guards the GitHub round trip with a short-lived signed `state` cookie. It sets the cookie when sign-in starts and checks it on the callback. A `state_mismatch` error results when the cookie is missing ([`state.ts`, `generateGenericState` and `parseGenericState`](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/better-auth/src/state.ts#L87-L290)). If the page starts sign-in with a cross-site `fetch` to `POST /sign-in/social`, Safari drops that cookie and the callback fails. **Sign-in must start with a full-page visit to the Worker**, so the cookie is first-party. Better Auth's cookies default to `SameSite=Lax` ([`cookies/index.ts`, line 107](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/better-auth/src/cookies/index.ts#L107)), which is still sent on the GitHub-to-Worker redirect.

### How to hand the token back

**Recommended: full-page redirect with a one-time-token handoff.** Uses the stock `bearer` and `one-time-token` plugins, plus about 30 lines of Worker code.

1. The "Sign in" link points to a small Worker route, e.g. `GET /signin`. It calls `auth.api.signInSocial({ body: { provider: "github", callbackURL: "https://jdenn0514.github.io/shaken-stirred-sauteed/…" }, asResponse: true })` and returns that redirect to GitHub. The state cookie is set first-party.
2. GitHub sends Jacob back to the Worker's `/api/auth/callback/github`. Better Auth checks the state, stores the GitHub tokens, creates the session, and redirects to `callbackURL`. `callbackURL` must be on a trusted origin, so set `trustedOrigins: ["https://jdenn0514.github.io"]` ([Better Auth docs: options, `trustedOrigins`](https://www.better-auth.com/docs/reference/options#trustedorigins); [origin check](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/better-auth/src/api/middlewares/origin-check.ts)).
3. With `oneTimeToken({ setOttHeaderOnNewSession: true })`, any response that creates a session also carries a `set-ott` header holding a single-use code. The code lasts 3 minutes by default and is stored in D1 ([`one-time-token/index.ts`](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/better-auth/src/plugins/one-time-token/index.ts); [Better Auth docs: One-Time Token](https://www.better-auth.com/docs/plugins/one-time-token)). The Worker wraps the callback response: if it has `set-ott` and is redirecting to the trusted site, the Worker appends `#ott=<code>` to the redirect `Location`. A `#` fragment is never sent to any server or written to server logs.
4. The page reads the code from the fragment, removes it from the address bar with `history.replaceState`, and calls `POST /api/auth/one-time-token/verify` with it. That endpoint uses the code up (it "atomically burns" it) and sets the session cookie. Because of the `bearer` plugin, it also returns `set-auth-token`. The page keeps that token (e.g. in `localStorage`) and sends it as `Authorization: Bearer` from then on.
5. The Worker must send CORS headers for the site's origin. Better Auth doesn't do this itself; its Hono guide adds CORS middleware ([Better Auth docs: Hono, CORS](https://www.better-auth.com/docs/integrations/hono#cors)). The headers: allow `Authorization` and `Content-Type`, and expose `set-auth-token`.

*Unconfirmed (from reading the code):* that the `set-ott` header is set on the callback's redirect response, i.e. that the session is marked as new there. *To settle:* a small test once the GitHub App and the Worker exist. The fallback is just as small: point `callbackURL` at a Worker route instead. That route still has the session cookie, because it's a first-party navigation. It calls `auth.api.generateOneTimeToken` and redirects to the site with `#ott=…`.

**Alternative: Better Auth's `oauthPopup` plugin** (experimental, added in 1.6.x, [changelog](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/better-auth/CHANGELOG.md)). It solves exactly this case:
- A popup opens the Worker's `GET /oauth-popup/start`, so the state cookie is first-party.
- After GitHub, the Worker returns a small page that `postMessage`s the session token to the opening page, only if that page is on a trusted origin. Then it closes itself.
- It needs the `bearer` plugin ([README](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/better-auth/src/plugins/oauth-popup/README.md), [`index.ts`](https://github.com/better-auth/better-auth/blob/0e75ddcf36489aa3a191ea902a82d1892034dc74/packages/better-auth/src/plugins/oauth-popup/index.ts)).
- It ships in `better-auth@1.7.15` on npm.

Risks:
- It is marked "the API may change".
- Its own README says to prefer the redirect flow for a normal top-level app.
- It only works if the popup keeps its link back to the page (`window.opener`) after visiting github.com. If github.com sends a `Cross-Origin-Opener-Policy` header that cuts that link, the popup can't post the token back. *Unconfirmed:* this session couldn't load github.com's headers.
- On an iPhone the popup opens as a new tab.

Worth trying if the redirect handoff turns out awkward. Not the first choice.

**Security notes for either way:**
- A token in `localStorage` can be read by any script on the site. The site's strict CSP and lack of third-party scripts are what keep that safe, so the editor pages' looser CSP should stay as narrow as the design says.
- Keep sessions reasonably short.
- Sign-out should delete the token *and* call Better Auth's sign-out, so the session ends in D1 too.

### Option (c): one origin on Cloudflare

This avoids the problem entirely, and it's free.
- Workers can serve static files ("static assets") alongside the Worker's code from the same address. "Requests to static assets are free and unlimited" ([Workers static assets: billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/); [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)).
- The free plan allows 20,000 files per version and 25 MiB per file ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/#account-plan-limits)).
- Deploy-on-push from GitHub (Workers Builds) gives 3,000 build minutes a month free ([Workers Builds limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)).
- With the site and `/api/*` on one `…workers.dev` address, sign-in cookies are first-party: no bearer token, no handoff, no CORS.

Notes:
- **Must be the same address, not Pages plus Workers.** `pages.dev` and `workers.dev` are separate entries on the Public Suffix List, so a Pages site calling a `workers.dev` Worker is still cross-site.
- Only requests that reach the Worker's code count against the 100,000 a day. If the Worker is set to run before static files (`run_worker_first`) and the limit is hit, those requests get a 429 rather than falling back to the static file ([static assets: billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)). So limit `run_worker_first` to `/api/*`.
- **Costs of moving:**
  - The site's URL changes. GitHub Pages can't send server redirects, so old links would need a "moved" page.
  - Browser storage is per address, so visitors' saved cook-mode progress and settings don't carry over.
  - The design lists "No change of hosting yet" as a non-goal.

### Recommendation

Go with **(b): bearer tokens plus the one-time-token handoff**, sign-in started by a full-page visit to the Worker. It keeps GitHub Pages and costs nothing, and it uses stock Better Auth plugins plus a small, testable piece of Worker code. Keep **(c)** as the fallback if the handoff misbehaves on a real iPhone. It is free and simpler at run time; its cost is the move itself.

*To settle:* once the GitHub App and Worker exist, sign in on an iPhone in Safari (default privacy settings, plus once in a Private tab), then save an edit and reload the page to check the session persists.

---

## 3. Cloudflare free limits

All from Cloudflare's docs as of 2026-11-03.

| Product | Free allowance | When it runs out |
| --- | --- | --- |
| **Workers** | 100,000 requests/day (resets 00:00 UTC); 10 ms CPU per request; 50 subrequests per request; 128 MB memory ([limits](https://developers.cloudflare.com/workers/platform/limits/#account-plan-limits)) | Error 1027 for the rest of the day; error 1102 for too much CPU or memory ([daily requests](https://developers.cloudflare.com/workers/platform/limits/#daily-requests), [CPU time](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)). No charge. |
| **D1** | 5 million rows read/day; 100,000 rows written/day; 500 MB per database; 5 GB per account; 10 databases; 50 queries per request ([pricing](https://developers.cloudflare.com/d1/platform/pricing/), [limits](https://developers.cloudflare.com/d1/platform/limits/)) | "D1 API will return errors … indicating that your daily limits have been exceeded"; when storage is full, inserts fail until data is deleted ([D1 pricing FAQ](https://developers.cloudflare.com/d1/platform/pricing/#frequently-asked-questions)). No charge. |
| **R2** | 10 GB-month storage; 1 million Class A operations/month (writes, lists); 10 million Class B operations/month (reads); egress free; Standard storage only ([R2 pricing](https://developers.cloudflare.com/r2/pricing/#free-tier)) | **Billed**: "You are billed for your usage on a monthly basis" ([R2 get started](https://developers.cloudflare.com/r2/get-started/)). See below. |
| **Workers AI** | 10,000 Neurons/day (resets 00:00 UTC) ([Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)) | On the free plan: "further operations will fail with an error"; going beyond needs Workers Paid. No charge. |
| **Workers KV** (alternative for originals) | 100,000 reads/day; 1,000 writes/day; 1 GB storage; 25 MiB per value ([KV limits](https://developers.cloudflare.com/kv/platform/limits/)) | Free-plan limits, not billing. *Assumed*, by the same pattern as D1; the KV limits page lists them as plan limits, but this session didn't find a sentence describing the over-limit behaviour. |

### R2 and the "no card" rule

R2 is the odd one out:
- Its get-started page says you need "a Cloudflare account with an R2 subscription", added by going to **Storage & databases → R2 → Overview** and completing "the checkout flow" ([R2 get started](https://developers.cloudflare.com/r2/get-started/)).
- Its free allowance is monthly, and usage over it is billed, not refused ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)). That breaks the design's anti-goal "No service is set up in a way that can charge money", whether or not a card is asked for.
- *Unconfirmed:* whether that checkout needs a card. Cloudflare's docs don't say. Third-party write-ups say it does, but those aren't primary sources. *To settle:* Jacob opens the R2 page in the dashboard and sees whether it asks for a payment method. Even if it doesn't, the billing point stands.

**Recommendation: keep originals in Workers KV, not R2.**
- KV is on the Workers Free plan with hard daily limits, and values up to 25 MiB fit a phone photo or a recipe PDF.
- The 38 PDFs in `source-pdfs/` total about 2.7 MB, against 1 GB free.
- 1,000 writes a day is far more than this editor needs.
- KV has no public URL unless the Worker serves the file, so originals stay private.
- The design would change only in saying "KV" instead of "R2".

D1 could also hold small originals (2 MB per row, [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)), but photos can be larger, so KV fits better.

### Workers AI: what a recipe costs

From Cloudflare's [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) table:

| Vision model | Neurons per million input tokens | Neurons per million output tokens |
| --- | --- | --- |
| `@cf/meta/llama-3.2-11b-vision-instruct` | 4,410 | 61,493 |
| `@cf/google/gemma-4-26b-a4b-it` (also reads images) | 9,091 | 27,273 |

- Llama 3.2 11B Vision is still the cheapest per input token among the general vision models listed. Cloudflare's model catalogue flags both models as reading images ([model data](https://github.com/cloudflare/cloudflare-docs/tree/main/src/content/workers-ai-models)).
- Gemma 4 is cheaper per output token, but it "reasons" by default, which adds output tokens.
- Some newer models need a paid plan, per the note on the same page. Neither of these does.

**Rough estimate (unconfirmed):** a page photo plus instructions as 2,000–6,000 input tokens, and a recipe back as about 1,000 output tokens.
- Llama 3.2 11B Vision: 2,000 × 4,410 / 1,000,000 + 1,000 × 61,493 / 1,000,000 ≈ 70 Neurons. With 6,000 input tokens, about 88 Neurons.
- Allow up to about 120 Neurons for longer answers. That's roughly **80 to 140 recipes a day** within 10,000 Neurons.
- How many tokens a photo counts as isn't published per model. *To settle:* run one real `source-pdfs` page through each model and read the Neurons used in the Workers AI dashboard, as the design already plans.

### What happens at a limit

On the Workers Free plan, Workers, D1, Workers AI and KV refuse with errors once a limit is hit; they don't bill. The design's "a free limit being reached stops a feature for the day" holds for them, provided **Jacob never upgrades to Workers Paid**. On Paid, the same overages are billed (D1 and Workers AI pages above). R2 doesn't fit this rule, hence the KV recommendation.

The editor should show these errors plainly: 1027 means "the editor's daily allowance is used up, try after midnight UTC", and a Workers AI error means "AI tidy-up isn't available today".

---

## What would settle the unconfirmed points

| Point | How to settle |
| --- | --- |
| Default scopes harmless with a GitHub App (we'll disable them anyway) | First real sign-in with `disableDefaultScope: true` |
| `set-ott` arrives on the callback redirect | Worker test once the GitHub App exists; fallback route described above |
| Whole flow works on iPhone Safari | Sign in on an iPhone with default settings, save an edit, reload |
| `oauthPopup` survives github.com's COOP header | Only if we try that alternative |
| GitHub returns refresh errors with a success status | A deliberately reused refresh token in a test; build the 401 → "sign in again" path either way |
| Better Auth stays under 10 ms CPU | `wrangler tail` on sign-in and a save |
| R2 checkout asks for a card | Jacob opens the R2 page in the dashboard (moot if KV is used) |
| KV over-limit behaviour on the free plan | Cloudflare KV pricing page in a browser; at this usage it won't be reached |
| Neurons per recipe | One real page through the model, read the dashboard |
| Safari third-party cookie blocking (webkit.org not reachable here) | Read the linked WebKit post; the iPhone test covers it in practice |
