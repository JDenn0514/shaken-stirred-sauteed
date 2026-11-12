// Step numbers as the editor's sheet shows them (edit.html).
//
// The checker counts steps in the file's order. The sheet numbers them in the
// order it shows them: prep first moves prep up, and as written hides an added
// prep step. Messages keep the checker's numbers inside (the editor places
// them by it) and say the sheet's numbers to the reader.
//
// numbering(recipe, order) takes the order the sheet shows, as the recipe
// page's stepOrder gives it ([{ i }], i a step's place in the file, from 0),
// and returns what says steps that way.

const flat = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e]));
const stepText = (s) => (typeof s === "string" ? s : s?.do || "");
const short = (t, n = 60) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const capital = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function numbering(recipe, order) {
  // Each shown step's number on the sheet, by its place in the file.
  const shown = new Map(order.map((x, k) => [x.i, k + 1]));
  const hidden = (i) => `the added prep step "${short(stepText(flat(recipe.steps)[i]), 50)}"`;

  // "step 3" in a message, as the sheet numbers it. A step the sheet doesn't
  // show (an added prep step, as written) is named by its first words, and
  // "Step 3's hands-on time…" becomes "Hands-on time for the added prep step
  // "…"…", so the step's words don't end in "'s".
  function say(text) {
    return text
      .replace(/\b([Ss])tep (\d+)'s ([a-z][a-z -]*?)(?=,| needs\b| can't\b| isn't\b| is\b)/g, (m, s, d, what) => {
        const i = Number(d) - 1;
        if (shown.has(i)) return m;
        return `${s === "S" ? capital(what) : what} for ${hidden(i)}`;
      })
      .replace(/\b([Ss])teps? (\d+)\b/g, (m, s, d) => {
        const i = Number(d) - 1;
        if (shown.has(i)) return `${s}tep ${shown.get(i)}`;
        return s === "S" ? capital(hidden(i)) : hidden(i);
      });
  }

  // Whether a message names a step the sheet isn't showing.
  const namesHidden = (text) => [...text.matchAll(/\bsteps? (\d+)\b/gi)].some(([, d]) => !shown.has(Number(d) - 1));

  // Steps by their numbers in the file (from 1), as "step 1" or "steps 3 and
  // 4", numbered and ordered as the sheet shows them; a hidden one by its
  // words, last.
  function stepNames(ns) {
    const names = ns.map((n) => (shown.has(n - 1) ? { k: shown.get(n - 1), name: String(shown.get(n - 1)) } : { k: Infinity, name: hidden(n - 1) }))
      .sort((x, y) => x.k - y.k);
    const allNumbers = names.every((x) => x.k !== Infinity);
    const list = names.map((x) => (allNumbers || x.k === Infinity ? x.name : `step ${x.name}`));
    const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
    return allNumbers ? `step${list.length > 1 ? "s" : ""} ${joined}` : joined;
  }

  // The steps whose uses differ between two versions of the recipe, named as
  // stepNames does, or null for none.
  function stepsTouched(a, b) {
    const was = flat(a.steps), now = flat(b.steps);
    const ns = now.map((s, n) => (JSON.stringify(s?.uses) !== JSON.stringify(was[n]?.uses) ? n + 1 : 0)).filter(Boolean);
    return ns.length ? stepNames(ns) : null;
  }

  // After step n (from 0) of `before` was split into `parts` steps: what it
  // used all stayed with the first part, so the parts' ingredients need a
  // look. Null when it used nothing.
  function usesNote(before, n, parts) {
    if (!flat(before.steps)[n]?.uses?.length) return null;
    const ns = Array.from({ length: parts }, (_, k) => n + 1 + k);
    return `Check what ${stepNames(ns)} use: the ingredients all stayed with ${stepNames([n + 1])}.`;
  }

  return { shown, say, namesHidden, stepNames, stepsTouched, usesNote };
}
