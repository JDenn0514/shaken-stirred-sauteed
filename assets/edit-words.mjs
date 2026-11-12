// The recipe checker's messages (assets/recipe-checks.js) in a cook's words,
// for the editor. The checker names the file's fields ("wait" must be a time,
// like "10 min", or false); the editor says what to do ("Step 2's wait needs
// to be a time"), and where: which line to open, or which field in Details.
//
//   explain(message) → { text, go } or null for a message the table doesn't know
//
// A step keeps its number as the checker counts it ("step 3"), so the editor
// can say it as the sheet numbers it. go is where the fix is:
//   { open: "step" | "ing" | "about", n | name, field }  a line, opened at that field
//   { field: "d-hands-2" }  a field in Details, by its data-key; a key ending in
//                            "*" is the first one that starts so; `or` is the key
//                            to try when the first isn't there
//   { ingField: "recipe", name }  an ingredient's field in Details ("d-recipe-<n>")
//   { empty: "ing" | "step" }  the first ingredient or step left empty
//   label  what a button to that place says, when it's a fix of its own
//
// tests/unit/edit-words.test.mjs makes every message with the real checker:
// there's one rule for each message it can give, so a check added or reworded
// there fails until it's here too.

const step = (d) => Number(d) - 1;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const FLAG_NAMES = { watch: "needs you there", burner: "burner", grill: "grill", microwave: "microwave", prepOnly: "added prep", holds: "keeps after this", during: "happens during" };
const FLAG_FIELDS = ["watch", "burner", "grill", "microwave", "holds"];

export const RULES = [
  // What a step uses.
  { match: /^step (\d+): "uses" must be a list$/,
    words: ([, d]) => `Step ${d}'s ingredients can't be read. Tick them again under Details.`, go: ([, d]) => ({ field: `d-use-${step(d)}-*` }) },
  { match: /^step (\d+): every entry in "uses" needs an "item"$/,
    words: ([, d]) => `Step ${d} uses an ingredient with no name. Take it off the step under Details.`, go: ([, d]) => ({ field: `d-use-${step(d)}-*` }) },
  { match: /^step (\d+): "amount" must be text, like "100 g" or "the rest"$/,
    words: ([, d]) => `Step ${d}'s share of an ingredient needs to be words, like 100 g or the rest.`, go: ([, d]) => ({ field: `d-use-${step(d)}-*` }) },
  { match: /^step (\d+) uses "(.+?)"(?: from "(.+?)")?, which isn't one of the ingredients$/,
    words: ([, d, item, g]) => `Step ${d} uses ${item}${g ? ` from ${g}` : ""}, which isn't in the ingredients. Add it, or take it off the step under Details.`,
    go: ([, d, item]) => ({ field: `d-use-drop-${step(d)}-${item}`, or: `d-use-${step(d)}-*` }) },
  { match: /^step (\d+) uses "(.+?)"(?: from "(.+?)")?, which matches (\d+) ingredients: add its "group"$/,
    words: ([, d, item, , k]) => `Step ${d} uses ${item}, but ${k} ingredients are called that. Tick the right one under Details.`,
    go: ([, d]) => ({ field: `d-use-${step(d)}-*` }) },

  // The lineup's planning fields.
  { match: /^"serve" must be one of .+$/,
    words: () => "How it's served isn't one the lineup knows. Choose one under Details.", go: () => ({ field: "d-serve" }) },
  { match: /^"sits" must be a time, like "10 min"$/,
    words: () => "How long it can sit needs to be a time, like 10 min.", go: () => ({ field: "d-sits" }) },
  { match: /^step (\d+): "hands" must be a time, like "10 min"$/,
    words: ([, d]) => `Step ${d}'s hands-on time needs to be a time, like 10 min.`, go: ([, d]) => ({ field: `d-hands-${step(d)}` }) },
  { match: /^step (\d+): "wait" must be a time, like "10 min", or false$/,
    words: ([, d]) => `Step ${d}'s wait needs to be a time, like 10 min. Leave it empty if the step doesn't wait.`,
    go: ([, d]) => ({ open: "step", n: step(d), field: "edit-wait" }) },
  { match: /^step (\d+): oven setting "(.*)" isn't one of "200C", "400F", "broil" or "off"$/,
    words: ([, d, s]) => `Step ${d}'s oven setting, ${s}, isn't one the lineup knows. Use a temperature like 200C or 400F, or broil, or off.`,
    go: ([, d]) => ({ field: `d-oven-${step(d)}` }) },
  { match: /^step (\d+): "preheat" can't be "off"; use "oven": "off" to turn it off$/,
    words: ([, d]) => `Step ${d} heats the oven to off. To turn the oven off, set the step's oven to Off under Details.`,
    go: ([, d]) => ({ field: `d-preheat-${step(d)}` }) },
  { match: /^step (\d+): "watch" needs a "wait" to watch$/,
    words: ([, d]) => `Step ${d} needs you there the whole wait, but it doesn't wait. Add a wait, or untick "Needs you there the whole wait".`,
    go: ([, d]) => ({ open: "step", n: step(d), field: "edit-wait" }) },
  { match: /^step (\d+): "during" needs an earlier step with a wait to run alongside$/,
    words: ([, d]) => `Step ${d} happens during an earlier step's wait, but no step before it waits.`, go: ([, d]) => ({ open: "step", n: step(d) }) },
  { match: /^step (\d+): "during" can't run alongside a watched wait, which needs your hands$/,
    words: ([, d]) => `Step ${d} happens during a wait that needs you there the whole time, so it can't.`, go: ([, d]) => ({ open: "step", n: step(d) }) },
  { match: /^step (\d+): "prep" must be true or "just before"$/,
    words: ([, d]) => `Step ${d}'s prep setting can't be read. Choose it again under Details.`, go: ([, d]) => ({ field: `d-prep-${step(d)}` }) },
  { match: /^step (\d+): "(\w+)" must be true or false$/,
    words: ([, d, k]) => `Step ${d}'s ${FLAG_NAMES[k] || k} setting can't be read. Choose it again under Details.`,
    go: ([, d, k]) => (FLAG_FIELDS.includes(k) ? { field: `d-${k}-${step(d)}` } : { open: "step", n: step(d) }) },
  { match: /^step (\d+) mentions "(.+?)" but has no equipment field \(oven, preheat, burner, grill or microwave\)$/,
    words: ([, d, what]) => `Step ${d} mentions "${what}". Say whether it uses the burner, oven, grill or microwave.` },
  { match: /^more than one step with "holds"; only the last one counts$/,
    words: () => "More than one step says the dish keeps after it, and only the last one counts. Choose one under Details.", go: () => ({ field: "d-holds-none" }) },
  { match: /^"(.+?)": "optional" must be true or false$/,
    words: ([, name]) => `${name}'s optional setting can't be read. Tick or untick it under Details.`, go: ([, name]) => ({ ingField: "optional", name }) },
  { match: /^"(.+?)": "alreadyMade" must be true or false$/,
    words: ([, name]) => `${name}'s "Already made" setting can't be read. Tick or untick it under Details.`, go: ([, name]) => ({ ingField: "made", name }) },
  { match: /^"(.+?)": "alreadyMade" needs a "recipe" to start on Already made$/,
    words: ([, name]) => `${name} starts as already made, but doesn't link to a recipe. Link it, or untick "Already made".`, go: ([, name]) => ({ ingField: "recipe", name }) },
  { match: /^"(.+?)": "alreadyMade" is only for required ingredients; an optional one is made only when you add it$/,
    words: ([, name]) => `${name} is optional, so it can't start as already made: it's only made when you add it.`, go: ([, name]) => ({ ingField: "made", name }) },
  { match: /^"(.+?)": "recipe" must be one recipe's file name, like "garlic-paste" \(the planner takes one for now\)$/,
    words: ([, name]) => `${name} links to more than one recipe. Pick one under Details.`, go: ([, name]) => ({ ingField: "recipe", name }) },
  { match: /^"(.+?)" links to a recipe but no step uses it, so the lineup has it ready before step 1$/,
    words: ([, name]) => `${name} is made by another recipe, but no step uses it, so a lineup makes it before the first step. Tick it on the step that needs it, under Details.`,
    go: () => ({ field: "d-use-0-*" }) },
  { match: /^"(.+?)" says it's optional but isn't marked "optional": true$/,
    words: ([, name]) => `${name} says it's optional. Mark it optional, so the page shows it.` },

  // How ingredients are written (the README's "Writing ingredients").
  { match: /^"(.+?)": write "(.+?)" in lowercase, "(.+?)"$/,
    words: ([, name, , low]) => `${name}: write the amount in lowercase, "${low}".`, go: ([, name]) => ({ open: "ing", name, field: "edit-qty" }) },
  { match: /^"(.+?)": start the name with a capital, "(.+?)"$/,
    words: ([, name, fixed]) => `Start ${name} with a capital: "${fixed}".`, go: ([, name]) => ({ open: "ing", name, field: "edit-item" }) },
  { match: /^"(.+?)": put the grams in "(.+?)" in "grams" \(a number\), not "qty"$/,
    words: ([, name, qty]) => `${name}: the amount, "${qty}", has grams in it. Put them under Grams instead.`, go: ([, name]) => ({ open: "ing", name, field: "edit-qty" }) },
  { match: /^"(.+?)": put the ml in "(.+?)" in "ml" \(a number\), not "qty"$/,
    words: ([, name, qty]) => `${name}: the amount, "${qty}", has millilitres in it. Put them under Millilitres instead.`, go: ([, name]) => ({ open: "ing", name, field: "edit-qty" }) },
  { match: /^"(.+?)": write "about" instead of "~" in "(.+?)"$/,
    words: ([, name]) => `${name}: write "about" instead of "~" in the amount.`, go: ([, name]) => ({ open: "ing", name, field: "edit-qty" }) },
  { match: /^"(.+?)": write fractions with a slash, like "1 1\/2", not "(.+?)"$/,
    words: ([, name, f]) => `${name}: write fractions with a slash, like 1 1/2, not ${f}.`, go: ([, name]) => ({ open: "ing", name, field: "edit-qty" }) },
  { match: /^"(.+?)" is marked "optional": true, which the page shows, so the text doesn't need to say "optional"$/,
    words: ([, name]) => `${name} is marked optional, and the page says so: take the word optional out of its amount, name and note.`,
    go: ([, name]) => ({ open: "ing", name, field: "edit-item" }) },
  { match: /^"(.+?)": move "(.+)" into "note"$/,
    words: ([, name, prep]) => `${name}: move "${prep}" into the note.`, go: ([, name]) => ({ open: "ing", name, field: "edit-note" }) },

  // The recipe as a whole.
  { match: /^file name must be lowercase letters, numbers and dashes$/,
    words: () => "The file name can only have lowercase letters, numbers and dashes." },
  { match: /^missing "title"$/, words: () => "The recipe needs a title.", go: () => ({ open: "about", field: "edit-title" }) },
  { match: /^"category" must be one of .+$/, words: () => "The recipe needs a section: Baking, Cooking or Cocktails." },
  { match: /^"kind" must be one of .+$/, words: () => "Choose whether it's a dish or a component, under Details.", go: () => ({ field: "d-kind" }) },
  { match: /^no ingredients$/, words: () => "The recipe needs at least one ingredient.", go: () => ({ field: "add-ingredients" }) },
  { match: /^no steps$/, words: () => "The recipe needs at least one step.", go: () => ({ field: "add-steps" }) },
  { match: /^every ingredient needs text or an "item"$/,
    words: () => "An ingredient has no name. Add one, or remove the ingredient.", go: () => ({ empty: "ing" }) },
  { match: /^every step needs text or a "do"$/,
    words: () => "A step doesn't say what to do. Add it, or remove the step.", go: () => ({ empty: "step" }) },
  { match: /^"time\.total" must be a number of minutes$/, words: () => "The total time needs to be a number of minutes.", go: () => ({ field: "d-time-total" }) },
  { match: /^"source\.url" must start with https:\/\/ or http:\/\/$/,
    words: () => "The source's link needs to start with https:// or http://.", go: () => ({ field: "d-source-url" }) },
  { match: /^"image" must be an images\/ path or an https:\/\/ URL$/, words: () => "The picture's address needs to start with https:// or images/." },
  { match: /^"added" should look like 2026-10-31$/, words: () => "The date added needs to look like 2026-10-31.", go: () => ({ field: "d-added" }) },
  { match: /^"icon" must be one of .+$/, words: () => "The drawing isn't one of the site's drawings. Choose one under Details.", go: () => ({ field: "d-icon" }) },

  // Tags.
  { match: /^"tags" must be an object like .+$/, words: () => "The tags can't be read. Choose them again under Details.", go: () => ({ field: "d-tag-*" }) },
  { match: /^unknown tag dimension "(.+)"$/, words: ([, dim]) => `The tags include "${dim}", which isn't one of the site's filters.`, go: () => ({ field: "d-tag-*" }) },
  { match: /^"(.+)" is worked out automatically, so don't tag it$/,
    words: ([, dim]) => `The ${dim} filter is worked out for you, so it can't be tagged.`, go: () => ({ field: "d-tag-*" }) },
  { match: /^"(.+)" isn't a (\w+) filter$/, words: ([, dim, c]) => `${cap(dim)} isn't a filter in ${cap(c)}.`, go: () => ({ field: "d-tag-*" }) },
  { match: /^tags\.(.+) must be a list$/,
    words: ([, dim]) => `The ${dim} tags can't be read. Choose them again under Details.`, go: ([, dim]) => ({ field: `d-tag-${dim}-*` }) },
  { match: /^"(.+)" isn't an allowed (.+) value for (\w+) \(see recipes\/vocabulary\.json\)$/,
    words: ([, v, dim, c]) => `"${v}" isn't one of the ${dim} tags in ${cap(c)}.`, go: ([, , dim]) => ({ field: `d-tag-${dim}-*` }) },
  { match: /^no key ingredients tagged$/,
    words: () => "No key ingredients are tagged, so it won't show when someone filters by ingredient.",
    go: () => ({ field: "d-tag-ingredients-*", label: "Tag key ingredients" }) },
  { match: /^no total time, so it can't be filtered by time$/,
    words: () => "There's no total time, so it won't show when someone filters by time.",
    go: () => ({ field: "d-time-total", label: "Add the total time" }) },

  // Links between recipes (the editor takes the file name off these).
  { match: /^"(.+?)" links to recipe "(.+?)", which doesn't exist$/,
    words: ([, name, to]) => `${name} links to a recipe that isn't on the site, "${to}". Pick another under Details.`,
    go: ([, name]) => ({ ingField: "recipe", name }) },
  { match: /^recipe links loop: (.+)$/,
    words: ([, loop]) => `These recipes link to each other in a circle: ${loop}. Take out one of the links.` },
];

export function explain(message) {
  for (const r of RULES) {
    const m = r.match.exec(message);
    if (m) return { text: r.words(m), ...(r.go && { go: r.go(m) }) };
  }
  return null;
}
