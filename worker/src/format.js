// How a saved recipe file is laid out: JSON.stringify's two-space layout, but
// with short lists of words and numbers on one line, as the hand-written files
// have them ("course": ["protein"]). docs/specs/recipe-editor-plan.md, "File format".
const WIDTH = 100;

export function formatRecipe(recipe) {
  return `${lay(recipe, "", 0)}\n`;
}

// `used` is how much of the line is already taken (the indent and the key).
function lay(value, indent, used) {
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    if (value.every((x) => x === null || typeof x !== "object")) {
      const one = `[${value.map((x) => JSON.stringify(x) ?? "null").join(", ")}]`;
      if (used + one.length <= WIDTH) return one;
    }
    const inner = `${indent}  `;
    return `[\n${value.map((x) => inner + (lay(x, inner, inner.length) ?? "null")).join(",\n")}\n${indent}]`;
  }
  if (value && typeof value === "object") {
    const inner = `${indent}  `;
    const lines = Object.entries(value).flatMap(([k, v]) => {
      const key = `${inner}${JSON.stringify(k)}: `;
      const text = lay(v, inner, key.length);
      return text === undefined ? [] : [key + text];
    });
    return lines.length ? `{\n${lines.join(",\n")}\n${indent}}` : "{}";
  }
  return JSON.stringify(value);
}
