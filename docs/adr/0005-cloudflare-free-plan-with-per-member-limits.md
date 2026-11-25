# Stay on Cloudflare's free plan, guarded by per-member daily limits

The beta runs on Cloudflare's free plan. Its allowances (100,000 Worker requests, D1's daily rows read and written, 10,000 Workers AI Neurons, 10 ms of CPU a request) are shared by everyone, and since 2026-09-01 D1 stops answering until midnight UTC once a daily limit is hit. So each member has limits (recipes kept, saves, page fetches and AI tidies a day, recipe size), counted in D1 by UTC day, and a reached limit answers 429 rather than failing. A paid plan would remove most of these limits for a monthly cost the beta doesn't justify; the limits are kept in one place so they can be tuned, or dropped if the plan changes.

## Consequences

- The 10 ms CPU limit constrains saving and Add to my cookbook, which run the recipe checker: their CPU time is measured on real recipes before launch.
