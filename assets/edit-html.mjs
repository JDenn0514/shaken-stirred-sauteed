// The editor's form pieces (edit.html), shared by the forms in edit.mjs,
// edit-facts.mjs and edit-fold.mjs. Each returns HTML. Every control has a
// data-key, which the editor uses to put focus back after a redraw.

// Read when called, not when this file loads, so the parts of the modules
// that use it that draw nothing can be tested without a page.
export const esc = (s) => window.SSS.esc(s);

// A field with its label beside it, joined by id. (A label wrapped round a
// field would make the field's own text part of its name.)
export function labelled(label, control, cls = "") {
  const id = `f-${/data-key="([^"]+)"/.exec(control)[1]}`;
  return `<div class="edit-field${cls}"><label for="${esc(id)}">${esc(label)}</label>${control.replace(/^<(\w+)/, `<$1 id="${esc(id)}"`)}</div>`;
}
export const field = (label, name, value, extra = "") =>
  labelled(label, `<input name="${name}" value="${esc(value ?? "")}" data-key="edit-${name}"${extra}>`);
export const select = (label, name, options, value, attrs = "") => labelled(label,
  `<select name="${name}"${attrs}>${options.map(([v, t]) => `<option value="${esc(v)}"${String(value) === String(v) ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`);
export const check = (label, attrs, on) => `<label class="edit-check"><input type="checkbox"${attrs}${on ? " checked" : ""}> ${esc(label)}</label>`;
export const act = (name, label) => `<button class="btn" type="button" data-act="${name}" data-key="edit-act-${name}">${label}</button>`;
export const formButtons = (more = "") => `<div class="edit-row">
  <button class="btn edit-primary" type="submit" data-key="edit-done">Done</button>${act("cancel", "Cancel")}${more}</div>`;
