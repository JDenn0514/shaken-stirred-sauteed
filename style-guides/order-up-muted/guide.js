// Style guide only: lets the specimens be tapped like the real pages.
(() => {
  // Steps: tap to send; the first open step after a sent one is "firing".
  document.querySelectorAll("[data-demo-steps]").forEach((ol) => {
    const steps = [...ol.querySelectorAll("li")];
    const paint = () => {
      const open = steps.find((s) => !s.classList.contains("done"));
      const anyDone = steps.some((x) => x.classList.contains("done"));
      steps.forEach((s) => s.classList.toggle("current", s === open && anyDone));
    };
    steps.forEach((s) => {
      const flip = () => { s.classList.toggle("done"); paint(); };
      s.addEventListener("click", flip);
      s.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
    });
  });
  // Tabs: one pressed at a time. The theme's body:has() rule then recolors the page.
  document.querySelectorAll("[data-demo-tabs]").forEach((nav) => {
    nav.addEventListener("click", (e) => {
      const b = e.target.closest(".tab");
      if (!b) return;
      nav.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
    });
  });
  // Sheet options toggle.
  document.querySelectorAll("[data-demo-opts]").forEach((box) => {
    box.addEventListener("click", (e) => {
      const b = e.target.closest(".opt:not(:disabled)");
      if (b) b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    });
  });
  // Function keys: the wake key toggles like the real one.
  const wake = document.getElementById("wake");
  if (wake) wake.addEventListener("click", () => wake.setAttribute("aria-pressed", String(wake.getAttribute("aria-pressed") !== "true")));
})();
