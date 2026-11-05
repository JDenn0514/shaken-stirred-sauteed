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

  // "Your menu · 3 →" for the welcome page's link.
  const linkText = (prefix = "Menu") => { const n = count(); return `${prefix}${n ? ` · ${n}` : ""} →`; };

  // The site bar's Menu link shows how many dishes are on the menu: a lime
  // count, read out as "Menu 3 dishes" (its name holds what you see, so
  // voice control finds it too).
  function paintNav() {
    const link = document.getElementById("nav-menu");
    if (!link) return;
    const n = count();
    link.querySelector(".nav-count").textContent = n ? String(n) : "";
    link.querySelector(".nav-count-name").textContent = n ? ` dish${n === 1 ? "" : "es"}` : "";
  }
  paintNav();
  // Another tab may change the menu.
  window.addEventListener("storage", (e) => { if (e.key === KEY) paintNav(); });

  return { load, save: (m) => { save(m); paintNav(); }, has, count, add: (s) => { add(s); paintNav(); }, remove: (s) => { remove(s); paintNav(); },
    prepFirst, setPrepFirst, answers, setAnswers, linkText, paintNav };
})();
