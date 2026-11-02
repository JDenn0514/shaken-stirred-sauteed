// Style guide only: makes the specimens tappable like the real pages.
(() => {
  document.querySelectorAll("[data-demo-steps]").forEach((ol) => {
    const steps = [...ol.querySelectorAll("li")];
    const paint = () => {
      const open = steps.find((s) => !s.classList.contains("done"));
      const started = steps.some((s) => s.classList.contains("done"));
      steps.forEach((s) => s.classList.toggle("current", started && s === open));
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
      if (b) nav.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
    });
  });
  document.querySelectorAll("[data-demo-opts]").forEach((box) => {
    box.addEventListener("click", (e) => {
      const b = e.target.closest(".opt:not(:disabled)");
      if (b) b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    });
  });
  document.querySelectorAll(".btn[aria-pressed]").forEach((b) => {
    if (b.closest(".g-comp")) b.addEventListener("click", () => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")));
  });
})();
