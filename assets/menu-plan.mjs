// What the menu's cook mode shows from a plan: plain logic, no page code, so
// it has unit tests (tests/unit/menu-plan.test.mjs). See
// docs/specs/meal-planner-design.md, "Cooking a lineup".

// A dish's last step without its closing "serve": inside a menu, one plate-up
// step serves everything, so no dish goes out alone. Only a serve at the very
// end comes off ("…, and serve hot.", "Serve immediately."); the recipe's own
// page keeps its words.
const SERVE_END = /(?:,?\s+(?:and|then)\s+|[.!]\s+|^)serve(?:\s+(?:it|them))?(?:\s+(?:hot|warm|immediately|right away|at once))?\s*[.!]?\s*$/i;
export function withoutServing(text) {
  const out = String(text).replace(SERVE_END, ".");
  return out.length > 1 ? out : text;
}

// The steps cook mode walks through: the plan's, without the ones it skips
// (heating an oven that's already hot), and with a plate-up step after the
// last step of each course's dishes. `parentOf` maps a nested recipe to the
// dish it's part of, so its steps count toward that dish's course.
export function cookSteps(plan, parentOf = {}) {
  const steps = plan.steps.filter((s) => !s.skipped);
  const courses = plan.serving || [];
  const dishOf = (slug) => { let s = slug; for (let i = 0; i < 10 && parentOf[s]; i++) s = parentOf[s]; return s; };
  const ends = courses.map((c) => ({ c, last: steps.findLastIndex((s) => c.dishes.includes(dishOf(s.slug))) }))
    .filter((x) => x.last >= 0).sort((a, b) => b.last - a.last);
  const out = [...steps];
  for (const { c, last } of ends) out.splice(last + 1, 0, { plate: c.course, dishes: c.dishes, at: c.at });
  return out;
}

// A busy stretch starting at steps[k]: four or more steps with no time
// between them, lasting 15 minutes or more. null when steps[k] isn't the
// start of one (it follows straight on from the step before, or the run is short).
export function busyStretch(steps, k) {
  const first = steps[k];
  if (!first || (k > 0 && !((first.idle || 0) > 0.5))) return null;
  let j = k;
  while (j + 1 < steps.length && !((steps[j + 1].idle || 0) > 0.5) && !steps[j + 1].plate) j++;
  const n = j - k + 1, last = steps[j];
  const minutes = last.at + (last.hands || 0) - first.at;
  return n >= 4 && minutes >= 15 ? { steps: n, minutes: Math.round(minutes) } : null;
}

// How many minutes later the meal now ends than first planned (never less than 0).
export const dayLength = (plan) => (plan.courses ? Math.max(...Object.values(plan.courses)) : plan.minutes);
export function behind(plan, firstMinutes) {
  return Math.max(0, Math.round(dayLength(plan) - firstMinutes));
}
