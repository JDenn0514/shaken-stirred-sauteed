// Code-only recipe restructuring, with no language model: reads a recipe as
// written and adds the lineup planning data (docs/specs/meal-planner-design.md),
// splits steps that combine several timed actions, and brings out prep hidden in
// ingredient lines. Every rule is a pattern or a word list, so a person still
// confirms the judgement calls. See tools/restructure/README.md.

const NUM = String.raw`\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+|[½¼¾]`;
const UNIT = String.raw`sec(?:ond)?s?|min(?:ute)?s?|hrs?|hours?`;
const TIME = new RegExp(String.raw`(?:about |~|at least |another |a further |for )?(${NUM})\s*(?:(?:to|-|–)\s*(${NUM})\s*)?(${UNIT})\b(?:\s*(\d+)\s*min)?`, "i");
const TIME_G = new RegExp(TIME.source, "gi");
const TEMP_G = /(\d{3})\s*°?\s*([FC])\b/g;

const lower = (s) => String(s ?? "").toLowerCase();
const flat = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items.map((i) => ({ i, group: e.group })) : [{ i: e, group: null }]));

// Words.
const KNIFE = /\b(chop|dice|mince|slice|cut|halve|quarter|peel|core|trim|grate|zest|juice|shred|pound|seed|pit|husk)\w*/i;
const MIX = /\b(whisk|stir|mix|toss|combine|rub|beat|fold|knead|blend|muddle|press|roll|brush|season|dredge|pat|shape|braid|spread|pipe|spoon|scatter|sprinkle|pour|arrange|lay|layer|dust|tie|measure)\w*/i;
const HEATWORD = /\b(simmer|boil|saut[eé]|sear|fry|fried|frying|stir-fry|melt|warm|heat|toast|caramel\w*|reduce|cook|braise|blanch|bring to a)\b/i;
const POT = /\b(skillet|saucepan|frying pan|pot|wok|dutch oven|cast iron|over (?:low|medium|medium-low|medium-high|high)(?: heat)?|on the stove)\b/i;
const OFFHEAT = /\b(off the heat|take (?:it )?off the heat|pull (?:it )?off the heat|remove from (?:the )?heat|pull from the heat)\b/i;
const WATCHWORD = /\b(constantly|without moving|undisturbed|watch|keep (?:stirring|whisking|spooning|beating|it moving)|whisking (?:the whole time|often|slowly but often)|stirring (?:often|constantly)|knead|whip|beat|sear|broil|turning|flip|swirling|mashing)\w*/i;
const STOVE_ATTENTION = /\b(stir|whisk|swirl|mash|toss|sear|saut[eé]|stir-fry|fry|keep (?:it )?moving|until (?:fragrant|golden|brown|they begin to brown))\w*/i;
const LEFT_ALONE = /\b(now and then|occasionally|partially cover|lowest setting|barest simmer)\b/i;
const JUSTBEFORE = /\b(right before|just before|immediately before|any earlier|too early|before it goes in|30 minutes before)\b/i;
const MEANWHILE = /^(meanwhile|while )/i;
// Cut, these brown or go soft while they wait, so cutting them is never done ahead.
const BROWNS = /\b(avocados?|apples?|pears?|bananas?|potato(?:es)?)\b/i;
// Something an earlier step makes; a step that uses it can't be done ahead of that step.
const MADE = /\b(marinade|sauce|mixture|dough|batter|filling|crust|slurry|syrup|dressing|glaze|custard)\b/gi;
// A sentence or step that's another way to do the same thing, not a further action.
const ALTERNATIVE = /^(or\b|no [\w\s'’-]+\?|if you (?:don't|do not) have|you can also|alternatively|if the [\w\s]+ (?:fights you|won't|doesn't))/i;

// Prep words in ingredient lines, in the order you'd do them, each with the
// instruction it becomes. {x} is the ingredient.
const PREP = [
  ["husked", "husk {x}"], ["rinsed", "rinse {x}"], ["picked over", "pick over {x}"], ["trimmed", "trim {x}"], ["peeled", "peel {x}"],
  ["cored", "core {x}"], ["seeded", "seed {x}"], ["pitted", "pit {x}"], ["halved", "halve {x}"], ["cubed", "cube {x}"],
  ["thinly sliced", "thinly slice {x}"], ["sliced", "slice {x}"], ["finely chopped", "finely chop {x}"], ["roughly chopped", "roughly chop {x}"],
  ["chopped", "chop {x}"], ["diced", "dice {x}"], ["finely minced", "finely mince {x}"], ["minced", "mince {x}"], ["crushed", "crush {x}"],
  ["finely grated", "finely grate {x}"], ["grated", "grate {x}"], ["shredded", "shred {x}"], ["torn", "tear {x}"], ["beaten", "beat {x}"],
  ["melted", "melt {x}"], ["softened", "set {x} out to soften"], ["room temperature", "set {x} out to come to room temperature"],
];
// "minced" -> "mince", from the list above when it's there.
const verbOf = (w) => (PREP.find(([p]) => p === w)?.[1].replace(" {x}", "") ?? w.replace(/ed$/, "").replace(/([^aeiou])$/, "$1"));
const SIZE = /\b(?:cut )?(?:into|in) ((?:[\d/½¼¾.]+[\s-]*(?:in(?:ch)?|cm)\.?\s*)?(?:pieces|cubes|dice|strips|wedges|florets|rings|rounds|chunks|matchsticks))\b/i;
const BOUGHT = /\b(cans?|jars?|package|packet|bag|box|store-bought|frozen|canned|bottled)\b/i;

function minutesOf(m) {
  const n = (x) => (/[½¼¾]/.test(x) ? { "½": 0.5, "¼": 0.25, "¾": 0.75 }[x] : x.split(/\s+/).reduce((t, p) => t + (p.includes("/") ? p.split("/")[0] / p.split("/")[1] : +p), 0));
  const per = { s: 1 / 60, m: 1, h: 60 }[m[3][0].toLowerCase()];
  return ((n(m[1]) + (m[2] ? n(m[2]) : n(m[1]))) / 2) * per + (m[4] ? +m[4] : 0);
}
const fmtMin = (x) => (x < 1 ? `${Math.round(x * 60)} sec` : `${Math.round(x * 2) / 2} min`);
const cap = (s) => s.replace(/^\w/, (c) => c.toUpperCase());

const sentences = (t) => t.split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
// An action sentence starts with a verb, or with a lead-in like "Meanwhile,".
const VERBISH = /^(meanwhile,?\s*|then,?\s*|[^,.;]{2,40},\s*)?(add|brown|break|crack|bring|cream|drain|ice|marinate|measure|soak|sweat|thin|thicken|toast|wipe|arrange|bake|beat|blend|blanch|bring|brush|chill|chop|combine|cook|cool|cover|cut|dice|divide|drain|dredge|drizzle|drop|dump|dust|fill|finish|fish|flip|fold|garnish|grate|grill|halve|heat|keep|knead|ladle|lay|leave|let|lift|line|lower|loosen|melt|microwave|mince|mist|mix|muddle|pat|peel|pile|pinch|pipe|poke|pour|press|pull|put|quarter|raise|reduce|refrigerate|remove|rest|return|roast|roll|rotate|rub|salt|saut[eé]|scatter|scrape|scrub|season|separate|serve|set|shake|simmer|slice|spoon|spread|sprinkle|squeeze|start|stir|strain|swirl|take|taste|temper|tie|tip|top|toss|transfer|trim|turn|uncover|warm|whip|whisk|wrap|repeat|switch|splash|smash|steep|stuff|tuck|crumble|bloom)\b/i;
const isAction = (s) => VERBISH.test(s) && !ALTERNATIVE.test(s);

// Temperatures that are oven settings: not a food's inside temperature or warm
// milk (190F / 88C or less, or followed by "inside").
function ovenTemps(s) {
  const out = [];
  for (const m of s.matchAll(TEMP_G)) {
    const f = m[2].toUpperCase() === "C" ? m[1] * 9 / 5 + 32 : +m[1];
    if (f <= 190 || /^[^.;]{0,20}\b(inside|internal)\b/i.test(s.slice(m.index + m[0].length))) continue;
    out.push(`${m[1]}${m[2].toUpperCase()}`);
  }
  return out;
}
const settingIn = (s) => {
  if (/\bbroil/i.test(s) && !/\bset the oven back\b/i.test(s)) return "broil";
  if (/\bturn the oven off\b|\boven off\b/i.test(s)) return "off";
  return ovenTemps(s)[0] || null;
};
// A time in a sentence that's how long a step waits: not a checkpoint ("check
// at 20 minutes"), a storage time ("up to 24 hours"), a total ("20 to 30 minutes
// in all", which belongs to the step it totals), or an "if needed" extra.
function waitIn(s) {
  if (/\b(if needed|if you like|if necessary)\b/i.test(s)) return null;
  for (const m of s.matchAll(TIME_G)) {
    const before = s.slice(Math.max(0, m.index - 14), m.index);
    if (/\b(at|up to|within|keeps?|for up to|every)\s*$/i.test(before)) continue;
    if (minutesOf(m) < 0.25) continue;
    return m;
  }
  return null;
}
const isTotal = (s) => /\b(in all|in total|altogether|for the last)\b/i.test(s);

export function restructure(r, titles, slug) {
  const out = structuredClone(r);
  const ings = flat(r.ingredients);
  const notes = []; // things code couldn't decide, for the person
  let ovenTemp = ovenTemps([r.heat, ...(r.beforeYouStart || [])].join(" "))[0] || null;

  // 1. Steps that are another way to do the step before ("No blender? Shake…")
  // join it, rather than reading as one more thing to do.
  const steps = [];
  flat(r.steps).forEach(({ i, group }, index) => {
    const s = typeof i === "string" ? { do: i } : { ...i };
    s.xOrig = index;
    if (steps.length && ALTERNATIVE.test(s.do)) {
      steps.at(-1).s.do += ` ${s.do}`;
      steps.at(-1).merged = (steps.at(-1).merged || []).concat(index);
      return;
    }
    steps.push({ s, group });
  });

  // 2. Split each step into actions: a new step starts at an action sentence
  // that brings its own time, or a different oven setting, when the step so far
  // has one already. Explanations and alternatives stay with the action before
  // them, and so does a sentence that gives the total time of the one before.
  const newSteps = [];
  for (const { s, group, merged } of steps) {
    const parts = [];
    let cur = null;
    for (const sent of sentences(s.do)) {
      const t = isAction(sent) ? waitIn(sent) : null, set = isAction(sent) ? settingIn(sent) : null;
      const startsNew = cur && isAction(sent) && !isTotal(sent) && ((t && cur.time) || (set && cur.set && set !== cur.set) || (MEANWHILE.test(sent) && cur.time));
      if (!cur || startsNew) { cur = { text: [sent], time: t ? sent : null, set }; parts.push(cur); }
      else { cur.text.push(sent); cur.time ||= t ? sent : null; cur.set ||= set; }
    }
    // A "per side" time becomes two steps, one per side.
    const expanded = [];
    for (const p of parts) {
      const joined = p.text.join(" ");
      const per = /(\d[\d\s/to–-]*\s*(?:min|minutes))\s+per side/i.exec(joined) || /(\d[\d\s/to–-]*\s*(?:min|minutes))\s*per side/i.exec(s.wait || "");
      if (per) {
        const t = per[1].trim();
        expanded.push({ ...p, text: [joined.replace(/\s*per side/i, " on the first side").replace(/,? flipping once,?/i, ",").replace(/,\s*,/g, ",")], waitText: t, perSide: 1 });
        expanded.push({ text: [`Flip and cook the second side ${t}.`], waitText: t, perSide: 2, set: p.set });
      } else expanded.push(p);
    }
    // A wait that holds two waits ("30 min ice bath, then about 1 hr fridge").
    const waits = s.wait ? s.wait.split(/,\s*then\s+/i) : [];
    expanded.forEach((p, k) => {
      const o = { do: p.text.join(" "), xGroup: group, x_from: s.xOrig };
      if (merged) o.x_merged = merged;
      if (p.perSide) o.wait = p.waitText;
      else if (expanded.length === 1 && waits.length === 1) o.wait = s.wait;
      else if (expanded.length === 1 && waits.length > 1) { o.wait = waits[0]; o.xSecond = waits.slice(1); o.do = o.do.replace(/,\s*then (?:refrigerate|chill)[^.]*\./i, "."); }
      else if (p.time) o.wait = cap(waitIn(p.time)[0].replace(/^(for|another|a further) /i, ""));
      if (k === 0 && s.cue) o.cue = s.cue;
      if (s.uses) {
        const mine = s.uses.filter((u) => lower(o.do).includes(lower(typeof u === "string" ? u : u.item).split(/[ ,(]/)[0]));
        if (expanded.length === 1) o.uses = s.uses;
        else if (mine.length) o.uses = mine;
      }
      newSteps.push(o);
      if (o.xSecond) {
        newSteps.push({ do: "Then move it to the fridge.", wait: o.xSecond.join(", then "), xGroup: group, x_from: s.xOrig });
        if (k === 0 && s.cue) { newSteps.at(-1).cue = s.cue; delete o.cue; }
        delete o.xSecond;
      }
    });
    // A wait read from the text when the step has none: from a sentence that
    // waits (bakes, simmers, rests…), never from an explanation.
    for (const o of newSteps.slice(-expanded.length)) {
      if (o.wait) continue;
      for (const sent of sentences(o.do).filter(isAction)) {
        const m = waitIn(sent);
        if (m && /\b(bake|roast|simmer|boil|cook|rest|chill|sit|stand|refrigerate|microwave|broil|grill|sear|fry|stir-fry|beat|whip|knead|blend|cool|steep|leave|let)\w*/i.test(sent) && minutesOf(m) >= 0.5) {
          o.wait = cap(m[0].replace(/^(for|another|a further) /i, ""));
          notes.push(`"${o.do.slice(0, 50)}…": wait read from the text (${o.wait})`);
          break;
        }
      }
    }
  }

  // 3. Planning fields on each step, read from its action sentences only.
  let firstHeat = -1;
  newSteps.forEach((o, n) => {
    if (o.added) return;
    // Only what the step does, not why ("…since tension splits the strands in the oven").
    const acts = (sentences(o.do).filter(isAction).join(" ") || o.do).replace(/,?\s*\b(since|because|so that|so it|so they|otherwise)\b[^.;]*/gi, "");
    const t = lower(acts);
    const set = settingIn(acts);
    if (/\b(pre)?heat the oven\b|\bpreheat\b|heat it to \d{3}/i.test(acts)) {
      o.preheat = ovenTemps(acts)[0] || ovenTemp;
      if (o.preheat) ovenTemp = o.preheat;
    } else if (/\bswitch (?:the oven )?to broil\b|\bset the oven to broil\b/i.test(acts) && !/\bbroil (?:\d|for|until)/i.test(acts)) {
      o.preheat = "broil";
    } else if (/\b(bake|roast)\b|\bin the oven|\binto the oven|\bbroil|\boven\b/i.test(t) && !/\bdutch oven\b/i.test(t)) {
      if (set === "off") o.oven = "off";
      else if (set === "broil") o.oven = "broil";
      else if (set) { o.oven = set; ovenTemp = set; }
      else if (/\b(bake|roast)\b|\b(leave the oven on|(?:return|back) (?:it )?(?:to|into) the oven|into the oven|in the oven)\b/i.test(t) && ovenTemp) o.oven = ovenTemp;
      else notes.push(`step ${n + 1} mentions the oven but no setting was found`);
    }
    if (/^(heat the )?grill\b|\bthe grill\b/i.test(acts)) o.grill = true;
    if (/\bmicrowave\b/i.test(acts) && !/microwave-safe/i.test(acts)) o.microwave = true;
    if ((POT.test(acts) || (HEATWORD.test(acts) && /\b(pan|pot|wok)\b/i.test(acts)) || /\bsimmer|\bboil/i.test(acts)) && !o.oven && !o.preheat && !o.microwave && !o.grill && !OFFHEAT.test(acts.split(/[.!]/)[0])) o.burner = true;
    if (o.wait && !/\b(bake|roast|chill|refrigerat|rest|rise|cool)\w*/i.test(acts)) {
      if (WATCHWORD.test(acts) || (o.burner && STOVE_ATTENTION.test(acts) && !LEFT_ALONE.test(acts))) o.watch = true;
    }
    if (o.burner || o.oven || o.grill || o.microwave) { if (firstHeat < 0) firstHeat = n; }
  });

  // 4. Prep marks: knife or mixing work with no heat and no cooking wait, before
  // the first heated step (or said to happen "meanwhile"), that doesn't use
  // something an earlier step makes, isn't serving, and isn't cutting something
  // that browns (that's "just before").
  newSteps.forEach((o, n) => {
    const heat = o.burner || o.oven || o.grill || o.microwave || o.preheat;
    const cookingWait = o.wait && !/\b(sit|stand|marinat|chill|refrigerat|rest)\w*/i.test(o.do);
    const prepish = KNIFE.test(o.do) || (MIX.test(o.do) && /\bbowl\b/i.test(o.do));
    if (heat || cookingWait || !prepish || /\bserve\b/i.test(o.do)) return;
    if (firstHeat >= 0 && n > firstHeat && !MEANWHILE.test(o.do)) return;
    if (/\b(cooked|cooled|rested|hot|warm|baked|reserved|roasted|grilled)\b/i.test(o.do)) return;
    const needs = [...new Set((o.do.match(MADE) || []).map(lower))];
    if (needs.some((w) => newSteps.slice(0, n).some((p) => !p.prep && lower(p.do).includes(w)))) return;
    o.prep = JUSTBEFORE.test(o.do) || (KNIFE.test(o.do) && BROWNS.test(o.do)) ? "just before" : true;
  });

  // 5. "Meanwhile" steps after an unwatched wait run during it.
  newSteps.forEach((o, n) => {
    if (n > 0 && MEANWHILE.test(o.do) && !o.prep) {
      const prev = newSteps.slice(0, n).findLast((x) => !x.during);
      if (prev?.wait && !prev.watch) o.during = true;
    }
  });

  // 6. Prep hidden in ingredient lines becomes added steps, one per place they're
  // first needed. Prep words only count after the item's name ("garlic, minced")
  // or in its note, or before it for chop/dice/mince/slice ("chopped cilantro");
  // never for something bought that way ("28 oz can diced tomatoes", "shredded
  // parmesan") or an alternative in brackets ("(or 2 cloves, minced)"). Cutting
  // something that browns is left to the step that uses it.
  const ownText = lower(newSteps.map((o) => o.do).join(" "));
  const added = new Map();
  for (const { i, group } of ings) {
    if (typeof i !== "object" || !i.item) continue;
    const item = i.item.replace(/\([^)]*\bor\b[^)]*\)/gi, "");
    const note = String(i.note || "").replace(/^or\b.*$/i, "");
    const [head, ...tail] = item.split(",");
    const after = lower([tail.join(","), note].join(", "));
    const lead = lower(head);
    const bought = BOUGHT.test(`${i.qty} ${item}`) || /\b(shredded|grated)\s+\w*\s*(cheese|parmesan|parmigiano|cheddar|mozzarella)/i.test(head);
    let name = lead.replace(/\([^)]*\)/g, "").replace(/\b(fresh|large|medium|small|extra-large|extra large|skin-on|boneless|skinless)\b/g, "");
    for (const [w] of PREP) name = name.replace(new RegExp(`\\b${w}\\b`, "g"), "");
    name = name.replace(/\s+/g, " ").trim();
    if (!name || BROWNS.test(name)) continue;
    // Two of the same ("unsalted butter" in the crust and the curd): say which.
    const dup = ings.filter((x) => lower(x.i?.item) === lower(i.item)).length > 1;
    const which = dup && group ? ` for the ${lower(group).replace(/^(for )?the /, "")}` : "";
    const found = [];
    for (const [w, v] of PREP) {
      const inAfter = new RegExp(`\\b${w}\\b`).test(after) && !found.some((x) => x.w.includes(w));
      const inLead = !bought && /^(chopped|diced|minced|sliced|finely chopped|thinly sliced)$/.test(w) && new RegExp(`\\b${w}\\b`).test(lead);
      if (inAfter || inLead) found.push({ w, v });
    }
    // "pressed or minced": one choice, not both.
    const or = /\b(\w+ed) or (\w+ed)\b/.exec(after);
    const size = SIZE.exec([item, note].join(", "));
    const juice = /\b(fresh )?(lemon|lime|orange|grapefruit) juice\b|\bjuice of\b/i.test(item) && !BOUGHT.test(`${i.qty} ${item}`);
    const zest = /\bzest\b/i.test(item) && !/\bzested\b/i.test(after);
    const lines = [];
    if (zest) lines.push(`zest the ${(/\b(lemon|lime|orange)s?\b/i.exec(item) || ["", "fruit"])[1].toLowerCase()}`);
    if (or) lines.push(`${verbOf(or[1])} or ${verbOf(or[2])} the ${name}`);
    else if (found.length) {
      const simple = found.filter((x) => /^\w+ \{x\}$|^\w+ \w+ \{x\}$/.test(x.v)).map((x) => x.v.replace(" {x}", ""));
      const other = found.filter((x) => !/^\w+ \{x\}$|^\w+ \w+ \{x\}$/.test(x.v));
      if (simple.length) lines.push(`${simple.length > 1 ? `${simple.slice(0, -1).join(", ")} and ${simple.at(-1)}` : simple[0]} the ${name}${size && !other.length ? ` into ${size[1]}` : ""}${which}`);
      for (const x of other) lines.push(x.v.replace("{x}", `the ${name}`));
    } else if (size) lines.push(`cut the ${name} into ${size[1]}${which}`);
    if (juice) lines.push(`squeeze the ${/juice of/i.test(item) ? item.replace(/^juice of\s*/i, "juice of ").toLowerCase() : `${name.replace(/^fresh /, "")}`}`);
    if (!lines.length) continue;
    // Skip prep the recipe's own steps already do ("Grate the carrot…").
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const last = esc(name.split(" ").at(-1));
    const done = lines.every((l) => new RegExp(`\\b${esc(l.split(" ")[0].slice(0, 4))}\\w*[^.]{0,40}\\b${last}`, "i").test(ownText));
    if (done) continue;
    const key = dup ? { group, item: i.item } : i.item;
    const firstUse = newSteps.findIndex((o) => (o.uses || []).some((u) => lower(typeof u === "string" ? u : u.item) === lower(i.item) && (!dup || !u.group || u.group === group)));
    const at = firstUse < 0 ? newSteps.findIndex((o) => !o.preheat) : firstUse;
    if (!added.has(at)) added.set(at, { lines: [], uses: [], group: newSteps[at]?.xGroup });
    added.get(at).lines.push(...lines.filter((l) => !added.get(at).lines.includes(l)));
    added.get(at).uses.push(key);
  }
  for (const at of [...added.keys()].sort((a, b) => b - a)) {
    const a = added.get(at);
    const rank = (l) => (l.startsWith("zest") ? 0 : l.startsWith("squeeze") ? 2 : 1);
    a.lines.sort((x, y) => rank(x) - rank(y));
    newSteps.splice(at, 0, { do: a.lines.map((l) => `${cap(l)}.`).join(" "), prep: true, prepOnly: true, uses: a.uses, xGroup: a.group, added: true });
  }

  // 7. An oven step with no heating step before it gets one, timed so the oven
  // heats while the dish is put together, not while the stove work before that
  // is still going.
  const firstOven = newSteps.findIndex((o) => o.oven && o.oven !== "off");
  if (firstOven >= 0 && !newSteps.slice(0, firstOven).some((o) => o.preheat)) {
    const setting = newSteps[firstOven].oven;
    let pos = firstOven;
    while (pos > 0) {
      const p = newSteps[pos - 1];
      if (p.burner || p.microwave || p.grill || (p.wait && !p.prepOnly && TIME.exec(p.wait) && minutesOf(TIME.exec(p.wait)) >= 10)) break;
      pos--;
    }
    newSteps.splice(pos, 0, { do: setting === "broil" ? "Heat the broiler." : `Heat the oven to ${setting.replace(/(\d+)([CF])/, "$1°$2")}.`, preheat: setting, xGroup: newSteps[pos]?.xGroup, added: true });
  }

  // 8. Hands-on minutes: by kind of work, then scaled to the recipe's active or
  // prep time when it gives one.
  const handsOf = (o) => {
    if (o.preheat && o.do.length < 60) return 0.5;
    const acts = sentences(o.do).filter(isAction).length || 1;
    let m = 0;
    if (KNIFE.test(o.do)) m += 1.5 * Math.min(3, (o.do.match(/,| and /g) || []).length + 1);
    if (/\bknead|\bshape|\bbraid|\broll (?:it|each|into)/i.test(o.do)) m += 4;
    if (MIX.test(o.do)) m += 1;
    m += 0.5 * acts;
    if (o.watch && o.wait) m = Math.min(m, 1);
    return Math.max(0.5, m);
  };
  const raw = newSteps.map(handsOf);
  const label = (r.times || []).find(([k]) => /active|prep/i.test(k));
  const activeM = label ? minutesOf(TIME.exec(label[1]) || ["", "0", null, "min"]) : r.time?.prep;
  const sum = raw.reduce((a, b) => a + b, 0);
  const scale = activeM && sum ? Math.min(2, Math.max(0.5, activeM / sum)) : 1;
  newSteps.forEach((o, n) => { o.hands = fmtMin(Math.max(0.5, raw[n] * scale)); });

  // 9. Ingredients: optional, and links to recipes by name. A linked topping
  // ("to taste", in a "Toppings" group) is a dish of its own, so it's optional.
  const link = (i, group) => {
    if (typeof i !== "object") return i;
    const o = { ...i };
    const said = lower([i.qty, i.item, i.note].join(" "));
    if (/\boptional\b/.test(said)) o.optional = true;
    const name = lower(i.item).replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();
    const hit = Object.entries(titles).find(([other, title]) => other !== slug && (name === lower(title) || name.startsWith(lower(title) + " ") || lower(title).replace(/^homemade /, "") === name.replace(/^dry /, "").split(" or ")[0]));
    if (hit) {
      o.recipe = hit[0];
      if (/\b(topping|to serve|to finish|garnish)/i.test(group || "") && /\b(to taste|optional)\b/i.test(i.qty || "")) o.optional = true;
    }
    return o;
  };
  out.ingredients = (r.ingredients || []).map((e) => (e && Array.isArray(e.items) ? { ...e, items: e.items.map((i) => link(i, e.group)) } : link(e)));

  // 10. Serve: from the kind of recipe and what it says. A dish with no heat at
  // all is served soon (a salad); a component keeps.
  const all = lower(newSteps.map((o) => o.do).join(" "));
  const heated = newSteps.some((o) => o.burner || o.oven || o.grill || o.microwave || o.preheat);
  if (r.kind === "component") out.serve = "keeps";
  else if (r.category === "cocktails") { out.serve = "soon"; out.sits = "5 min"; }
  else if (r.category === "baking") out.serve = /\b(right|just) before serving\b/.test(all) && !/\bdust\b/.test(all) ? "soon" : "keeps";
  else if (!heated || (/\broom temperature\b/.test(all) && !/\bserve (?:hot|warm)\b/.test(all))) { out.serve = "soon"; out.sits = "30 min"; }
  else { out.serve = "hot"; out.sits = /\b(serve immediately|serve right away|right away)\b/.test(all) ? "5 min" : "10 min"; }

  // Back into groups, as the recipe had them.
  const grouped = [];
  for (const o of newSteps) {
    const g = o.xGroup;
    delete o.xGroup;
    if (g == null) grouped.push(o);
    else if (grouped.at(-1)?.group === g) grouped.at(-1).items.push(o);
    else grouped.push({ group: g, items: [o] });
  }
  out.steps = grouped;
  return { recipe: out, notes };
}
