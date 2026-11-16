// The editor's pickers in Details (edit.html): what they offer and in what
// order. edit.mjs draws them.
//
//   tagChoices(values, picked, query)   a tag dimension's values to show:
//                                       picked first, the rest narrowed by
//                                       what's typed
//   pickedSays(n, range)                the counter, "2 of 1–4 picked"
//   TAG_RANGES                          the dimensions the README gives a range
//   drawingName(key)                    a drawing's plain name, "Nick & Nora"
//   drawingChoices(keys, auto, chosen)  "Picked for you" first, then each drawing

// Lowercase, without accents, so "jalapeno" finds "Jalapeño".
const plain = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// values: [{ key, label }] in the vocabulary's order. A picked value the
// vocabulary doesn't have is shown too, so it can be taken off.
export function tagChoices(values, picked = [], query = "") {
  const on = new Set(picked);
  const known = new Set(values.map((v) => v.key));
  const q = plain(query).trim();
  return [
    ...picked.filter((k) => !known.has(k)).map((k) => ({ key: k, label: k, picked: true })),
    ...values.filter((v) => on.has(v.key)).map((v) => ({ ...v, picked: true })),
    ...values.filter((v) => !on.has(v.key) && (!q || plain(v.label).includes(q))).map((v) => ({ ...v, picked: false })),
  ];
}

// README, "Filters": 1–4 key ingredients.
export const TAG_RANGES = { ingredients: [1, 4] };

export function pickedSays(n, [min, max]) {
  const range = `${min}–${max}`;
  if (!n) return `None picked yet: pick ${range}`;
  return n <= max ? `${n} of ${range} picked` : `${n} picked: ${range} is plenty`;
}

const NAMES = { "nick-nora": "Nick & Nora" };
export const drawingName = (key) => NAMES[key] || (key.charAt(0).toUpperCase() + key.slice(1)).replace(/-/g, " ");

// keys: every drawing (recipe-icons.js's KEYS). auto: the one picked for the
// recipe when it names none. chosen: the one it names, or "".
export function drawingChoices(keys, auto, chosen = "") {
  return [
    { key: "", name: `Picked for you: ${auto ? drawingName(auto) : "none"}`, icon: auto || null, picked: !chosen },
    ...keys.map((k) => ({ key: k, name: drawingName(k), icon: k, picked: chosen === k })),
  ];
}
