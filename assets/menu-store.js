// Your menu (called the lineup in the code and the design doc): the recipes
// you're cooking together, saved on this device. Every page reads it through
// here: the menu page, the recipe page's "Add to menu", the recipes page's
// tape and the welcome page's link.
//
// localStorage "sss:lineup": {
//   dishes: [{ slug, course?, made? }],   course "Main" or "Dessert" once changed;
//                                         made lists nested recipes "Already made"
//   ahead: { slug: true/false },           the cook's answer to "make it ahead?"
//   aheadDone: { slug: true },             made-ahead parts already cooked
//   cooking: { part, started, done: [...], current }   while cooking (see menu-cook.mjs)
// }
// "sss:prep-first" holds the prep choice on its own ("false" for Fastest), and
// "sss:answers:<slug>" what the cook told us a recipe doesn't say.
window.SSSMenu = (() => {
  const KEY = "sss:lineup";
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

  function load() {
    const m = read(KEY, {});
    return { ...m, dishes: Array.isArray(m.dishes) ? m.dishes.filter((d) => d && typeof d.slug === "string") : [], ahead: m.ahead || {} };
  }
  const save = (m) => write(KEY, m);
  const has = (slug) => load().dishes.some((d) => d.slug === slug);
  const count = () => load().dishes.length;
  function add(slug) {
    const m = load();
    if (!m.dishes.some((d) => d.slug === slug)) m.dishes.push({ slug });
    save(m);
  }
  function remove(slug) {
    const m = load();
    m.dishes = m.dishes.filter((d) => d.slug !== slug);
    save(m);
  }
  const prepFirst = () => read("sss:prep-first", true) !== false;
  const setPrepFirst = (on) => write("sss:prep-first", !!on);
  const answers = (slug) => read(`sss:answers:${slug}`, {});
  const setAnswers = (slug, a) => write(`sss:answers:${slug}`, a);

  // "Menu · 3 →", or "Menu →" when it's empty.
  const linkText = (prefix = "Menu") => { const n = count(); return `${prefix}${n ? ` · ${n}` : ""} →`; };

  return { load, save, has, count, add, remove, prepFirst, setPrepFirst, answers, setAnswers, linkText };
})();
