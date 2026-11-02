// Style guide only: lets the specimens be tapped like the real site.
(() => {
  document.querySelectorAll("[data-demo-steps]").forEach((ol) => {
    const steps = [...ol.querySelectorAll("li")];
    const paint = () => {
      const open = steps.find((s) => !s.classList.contains("done"));
      steps.forEach((s) => s.classList.toggle("current", s === open && steps.some((x) => x.classList.contains("done"))));
    };
    steps.forEach((s) => {
      const flip = () => { s.classList.toggle("done"); paint(); };
      s.addEventListener("click", flip);
      s.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
    });
  });
  document.querySelectorAll("[data-demo-tabs]").forEach((nav) => {
    nav.addEventListener("click", (e) => {
      const b = e.target.closest(".tab");
      if (!b) return;
      nav.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
    });
  });
  document.querySelectorAll("[data-demo-opts]").forEach((box) => {
    box.addEventListener("click", (e) => {
      const b = e.target.closest(".opt:not(:disabled)");
      if (b) b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    });
  });
  // Specimens are not forms: keep the sample search and sort inert.
  document.querySelectorAll(".g-live .search input").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); }));
})();
