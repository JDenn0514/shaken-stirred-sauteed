// The migrations in migrations/ make every table and column Better Auth needs
// with the settings in src/auth.js. If this fails after changing those settings
// or updating Better Auth, add a migration: see scripts/auth-schema.mjs.
import { env } from "cloudflare:test";
import { getMigrations } from "better-auth/db/migration";
import { expect, it } from "vitest";
import { authOptions } from "../src/auth.js";

it("needs no table or column the migrations don't make", async () => {
  const { toBeCreated, toBeAdded } = await getMigrations(authOptions(env));
  expect(toBeCreated.map((t) => t.table)).toEqual([]);
  expect(toBeAdded.map((t) => `${t.table}: ${Object.keys(t.fields)}`)).toEqual([]);
});
