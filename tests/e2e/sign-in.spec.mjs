// Signing in (docs/specs/recipe-editor-plan.md, slice 5). The footer of every
// page has a quiet "Sign in" link, or "Sign out" when the signed-in hint
// cookie is there. The Worker's /api/ is faked here; the Worker itself is
// tested in worker/test.
import { test, expect } from "./fixtures.mjs";

const PAGES = ["index.html", "recipes.html", "recipe.html?r=pork-carnitas", "menu.html", "intake.html"];
const footer = (page) => page.getByRole("contentinfo");

// What the Worker sets on signing in: a readable cookie, nothing secret in it.
const signedIn = (page, baseURL) => page.context().addCookies([{ name: "signed-in", value: "1", url: baseURL }]);
// A fake GET /api/me.
const me = (page, status, json) => page.route("**/api/me", (route) => route.fulfill({ status, json }));

for (const path of PAGES) {
  test(`${path}: signed out, the footer has a Sign in link that comes back to this page`, async ({ page }) => {
    await page.goto(path);
    const link = footer(page).getByRole("link", { name: "Sign in" });
    await expect(link).toBeVisible();
    await expect(footer(page).getByRole("button", { name: "Sign out" })).toHaveCount(0);
    const href = new URL(await link.getAttribute("href"), page.url());
    expect(href.pathname).toBe("/api/signin");
    const back = new URL(page.url());
    expect(href.searchParams.get("return")).toBe(back.pathname + back.search);
  });

  test(`${path}: signed in, the footer reads Sign out`, async ({ page, baseURL }) => {
    await signedIn(page, baseURL);
    await me(page, 200, { name: "Jacob Dennen", canEdit: true });
    await page.goto(path);
    await expect(footer(page).getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(footer(page).getByRole("link", { name: "Sign in" })).toHaveCount(0);
  });
}

test("Sign out signs you out and the footer goes back to Sign in", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  const signOuts = [];
  await page.route("**/api/signout", (route) => {
    signOuts.push(route.request().method());
    return route.fulfill({ json: { signedOut: true }, headers: { "Set-Cookie": "signed-in=; Path=/; Max-Age=0" } });
  });
  await page.goto("recipes.html");
  await footer(page).getByRole("button", { name: "Sign out" }).click();
  await expect(footer(page).getByRole("link", { name: "Sign in" })).toBeFocused();
  expect(signOuts).toEqual(["POST"]);
  await page.reload();
  await expect(footer(page).getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("a failed sign-out says so and stays signed in", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await page.route("**/api/signout", (route) => route.abort("internetdisconnected"));
  await page.goto("recipes.html");
  await footer(page).getByRole("button", { name: "Sign out" }).click();
  await expect(footer(page).getByRole("status")).toHaveText("Couldn't sign out. Check your connection and try again.");
  await expect(footer(page).getByRole("button", { name: "Sign out" })).toBeVisible();
});

test.describe("the Add recipe page says who's signed in", () => {
  test("an account that can edit the site", async ({ page, baseURL }) => {
    await signedIn(page, baseURL);
    await me(page, 200, { name: "Jacob Dennen", canEdit: true });
    await page.goto("intake.html");
    await expect(footer(page)).toContainText("Signed in as Jacob Dennen");
    await expect(footer(page)).not.toContainText("can't edit");
  });

  test("an account that can't edit the site", async ({ page, baseURL }) => {
    await signedIn(page, baseURL);
    await me(page, 200, { name: "A Friend", canEdit: false });
    await page.goto("intake.html");
    await expect(footer(page)).toContainText("Signed in as A Friend");
    await expect(footer(page)).toContainText("This account can't edit this site.");
  });

  test("a sign-in that has run out asks you to sign in again", async ({ page, baseURL }) => {
    await signedIn(page, baseURL);
    await me(page, 401, { error: "Your GitHub sign-in has expired. Sign in again." });
    await page.goto("intake.html");
    await expect(footer(page).getByRole("link", { name: "Sign in again" })).toBeVisible();
    await expect(footer(page).getByRole("button", { name: "Sign out" })).toHaveCount(0);
  });

  test("signed out, it doesn't ask the server", async ({ page }) => {
    const asked = [];
    page.on("request", (r) => r.url().includes("/api/") && asked.push(r.url()));
    await page.goto("intake.html");
    await expect(footer(page).getByRole("link", { name: "Sign in" })).toBeVisible();
    expect(asked).toEqual([]);
  });
});

test("other pages don't ask the server who's signed in", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  const asked = [];
  page.on("request", (r) => r.url().includes("/api/") && asked.push(r.url()));
  await page.goto("recipe.html?r=pork-carnitas");
  await expect(footer(page).getByRole("button", { name: "Sign out" })).toBeVisible();
  expect(asked).toEqual([]);
});
