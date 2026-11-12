// Undo and Redo in the editor (edit.html).
//
// Each change that lands (Done, Remove, a Details choice...) is a step back.
// What's typed in an open line becomes one step when the line closes or
// another opens, so Undo takes back a whole edit, not a letter. A state is
// { recipe, review }: a new recipe's steps keep its review too. Up to 50,
// forgotten on Save.

import { LISTS } from "./edit-model.mjs";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const copy = (state) => structuredClone(state);
const flat = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e]));

export function createHistory(limit = 50) {
  let past = [], future = [];
  let committed = null; // the state as of the last step

  // Anything changed since the last step: the recipe, or a new recipe's review.
  const typedSince = (state) => !!committed && (!same(committed.recipe, state.recipe) || !same(committed.review ?? null, state.review ?? null));

  function commit(state) {
    if (typedSince(state)) {
      past.push(committed);
      if (past.length > limit) past.shift();
      future = [];
    }
    committed = copy(state);
  }

  function reset(state) {
    past = [];
    future = [];
    committed = copy(state);
  }

  // Takes a step off `from` and returns it, keeping `now`, the state as it
  // is, on `to`. The editor finishes any change still waiting to land (a
  // typed Details field) before it asks, so that change is the one taken back.
  function travel(from, to, now) {
    const target = from.pop();
    if (!target) return null;
    to.push(typedSince(now) ? copy(now) : committed);
    committed = copy(target);
    return copy(target);
  }

  // What's typed since the last step, not yet a step, is taken back first.
  function undo(now) {
    if (typedSince(now)) {
      past.push(committed);
      committed = copy(now);
    }
    return travel(past, future, now);
  }

  return {
    commit,
    reset,
    typedSince,
    undo,
    redo: (now) => travel(future, past, now),
    canUndo: (state) => past.length > 0 || typedSince(state),
    canRedo: () => future.length > 0,
  };
}

// The first line that differs between two versions of a recipe, as the key
// of what to focus after an undo: the line, its list's Add button when the
// list is left empty, or Undo itself.
export function changedLine(a, b) {
  if (["title", "description", "yield"].some((k) => a[k] !== b[k])) return "part-title";
  for (const [kind, list] of Object.entries(LISTS)) {
    const was = flat(a[list]), now = flat(b[list]);
    const n = Math.max(was.length, now.length);
    for (let k = 0; k < n; k++) {
      if (JSON.stringify(was[k]) !== JSON.stringify(now[k])) return now.length ? `part-${kind}-${Math.min(k, now.length - 1)}` : `add-${list}`;
    }
  }
  return "undo";
}
