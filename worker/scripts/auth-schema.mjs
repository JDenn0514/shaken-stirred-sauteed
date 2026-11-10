#!/usr/bin/env node
// Prints the SQL that creates or updates Better Auth's tables for the settings
// in src/auth.js, by comparing them with the tables the migrations already make.
// Save its output as the next migration in migrations/ when it isn't empty
// (after changing Better Auth's settings or plugins, or updating it):
//   node worker/scripts/auth-schema.mjs > worker/migrations/0002_<what>.sql
// worker/test/schema.test.js fails until that's done.
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getMigrations } from "better-auth/db/migration";
import { authOptions } from "../src/auth.js";

const dir = new URL("../migrations/", import.meta.url);
const db = new DatabaseSync(":memory:");
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(file, dir), "utf8"));

const env = { SITE_URL: "https://example.com", BETTER_AUTH_SECRET: "x".repeat(32), GITHUB_CLIENT_ID: "x", GITHUB_CLIENT_SECRET: "x" };
const { compileMigrations } = await getMigrations(authOptions(env, db));
process.stdout.write(await compileMigrations());
