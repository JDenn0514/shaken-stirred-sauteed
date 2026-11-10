// Plans a menu off the page's main thread, so the menu page stays responsive
// while the planner weighs making things ahead (a few seconds on a slow phone).
// menu.mjs sends { id, args } (planLineup's arguments) and gets back
// { id, plan } or { id, error }.
import { planLineup } from "./planner.mjs";

self.addEventListener("message", (e) => {
  const { id, args } = e.data;
  try {
    self.postMessage({ id, plan: planLineup(...args) });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message) });
  }
});
