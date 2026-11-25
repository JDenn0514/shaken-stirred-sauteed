# Cookbooks live in D1; public recipes stay files in git

Members' recipes are kept in the Worker's D1 database, while the public recipes stay JSON files in `recipes/`, saved by committing to main and published as static files. So the site has two places recipes come from, on purpose: moving the public recipes into D1 would have made the public site depend on the Worker and the free plan's daily limits, and lose the offline, no-server reading visitors have today; keeping members' recipes in git would publish them and give members write access to the repo. Pages load recipes through one module that knows which store a recipe comes from (`docs/specs/multi-user-design.md`, "The pages").

## Considered Options

- **Everything in D1:** one store, but the public site would need the Worker for every recipe and would lose its offline reading.
- **Members' recipes as files in git:** one store, but every member would need write access to the repo, and their recipes would be public.
