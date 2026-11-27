// What the tests' env holds beyond the Worker's (vitest.config.ts): the
// migrations each test file applies, and the access laws' seed. And Vite's
// import.meta.glob, which the access laws read the Worker's code with.
/// <reference types="vite/client" />
declare namespace Cloudflare {
  interface Env {
    MIGRATIONS: import("cloudflare:test").D1Migration[];
    ACCESS_SEED: string;
  }
}
