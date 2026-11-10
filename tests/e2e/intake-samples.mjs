// Recipe texts for the intake's review screen (intake.html), and a step that
// pastes one in and reads it. Used by intake.spec.mjs and the accessibility scan.
import { expect } from "./fixtures.mjs";

export const ROLLS = `Milk Rolls
Makes 8 rolls
INGREDIENTS
1 cup whole milk
2 1/4 teaspoons instant yeast
3 cups bread flour
METHOD
1. In a small saucepan, gently warm the milk over low heat until lukewarm. Pour it into a large bowl and whisk in the yeast; let it sit until foamy, 5 to 10 minutes.
2. Add the flour and knead until smooth, 8 minutes.
3. Shape into 8 rolls and bake until golden, 20 to 25 minutes.`;

export const CHICKEN = `Skillet Chicken and Rice
Serves 4
INGREDIENTS
4 chicken thighs
1 cup long-grain rice
2 cups chicken stock
1 lemon
METHOD
1. Heat the oven to 400°F.
2. Brown the chicken in an ovenproof skillet over medium-high heat, 5 minutes a side. Move it to a plate.
3. Stir in the rice and stock and bring to a simmer. Put the chicken back on top and bake until the rice is tender.
4. Let it rest, covered, then squeeze the lemon over and serve.`;

// Its ingredient list has prep in it ("minced", "diced"), which the reader adds
// as a prep step that shows only in prep-first order.
export const NOODLES = `Garlic Noodles
Serves 2
INGREDIENTS
8 oz noodles
4 cloves garlic, minced
1 onion, diced
METHOD
1. Boil the noodles, 8 minutes.
2. Fry the garlic and onion in butter, then toss with the noodles.`;

export async function readRecipe(page, text, section) {
  await page.goto("intake.html");
  await page.getByLabel("Recipe text").fill(text);
  await page.getByRole("radio", { name: section }).check();
  await page.getByRole("button", { name: "Read the recipe" }).click();
  await expect(page.getByRole("region", { name: "Preview" }).getByRole("heading", { level: 2 }).first()).toBeVisible();
}
