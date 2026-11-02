// Light/dark theme. Loaded in <head> so data-theme is set before first paint;
// style.css keys the dark palette off :root[data-theme="dark"]. With nothing
// saved the theme follows the system setting, live.
(() => {
  const root = document.documentElement;
  const system = matchMedia("(prefers-color-scheme: dark)");
  const KEY = "theme";

  const load = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const save = (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch {} };
  const systemTheme = () => (system.matches ? "dark" : "light");

  let saved = load();
  if (saved !== "light" && saved !== "dark") saved = null;

  function apply() {
    const theme = saved || systemTheme();
    root.dataset.theme = theme;
    // The page has one theme-color meta per scheme; point both at the one in use.
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
      const forDark = m.dataset.scheme ? m.dataset.scheme === "dark" : /dark/.test(m.media);
      m.dataset.scheme = forDark ? "dark" : "light";
      m.media = forDark === (theme === "dark") ? "all" : "not all";
    }
    if (btn) render();
  }

  const ICONS = {
    // Shown while dark: click for light.
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M2.5 12h2M19.5 12h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
    // Shown while light: click for dark.
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  };

  let btn = null;
  function render() {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    btn.innerHTML = next === "light" ? ICONS.sun : ICONS.moon;
    btn.setAttribute("aria-label", `Switch to ${next} mode`);
    btn.title = `Switch to ${next} mode`;
  }

  apply();
  system.addEventListener("change", apply);

  document.addEventListener("DOMContentLoaded", () => {
    btn = document.getElementById("theme-toggle");
    if (!btn) return;
    render();
    btn.addEventListener("click", () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      // Picking what the system already uses clears the override, so the
      // page goes back to following the system.
      saved = next === systemTheme() ? null : next;
      save(saved);
      apply();
    });
  });
})();
