# Style guides

The site's look lives in `assets/style.css`. These folders hold the chosen style and two saved alternatives.
Each folder has its own style guide (`index.html`), a theme (`theme.css`), fonts, logo, recipe drawings (`icons/`) and a `preview/` folder that runs the real site in that style.

| Folder | Style | Status |
|---|---|---|
| `field-guide-vivid-warm/` | Field Guide, Vivid botanical colours with a warm charcoal dark mode | **In use** |
| `field-guide-spice/` | Field Guide, Spice cabinet colours (turmeric, sumac, cardamom) | Saved alternative |
| `order-up-hybrid/` | Order Up: kitchen tickets on a rail, Public Sans with monospace labels | Saved alternative |

## Previewing

Run the site locally (see the main README), then open, for example, `http://localhost:8000/style-guides/field-guide-spice/preview/`.

## Switching to another style

1. Copy the folder's `theme.css` to `assets/style.css`.
2. Copy its `fonts/` and `icons/` into `assets/fonts/` and `assets/icons/`, plus any other files `theme.css` points to with `url("./…")` (the Field Guide plates and specimen drawings).
3. Copy the `<header>` markup and the `theme-color` tags from its `preview/index.html` into `index.html` and `recipe.html`, and its `logo.svg` into `assets/` if you use it.
4. Update the colours in `manifest.webmanifest`.

All three styles use the same recipe drawings by name (`assets/recipe-icons.js` picks one per recipe), so recipes and scripts don't need to change.

Every earlier exploration (all rounds, finalists and palette tests) is kept on the `style-guides` branch.

Note: the guides were written before the icons were built into the site. Where they mention `_shared/icons.js`, that logic now lives in `assets/recipe-icons.js`, `scripts/build-index.mjs`, `assets/home.js` and `assets/recipe.js`.
