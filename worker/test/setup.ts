// Each test file starts with Better Auth's tables in an empty local D1.
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, env.MIGRATIONS);
