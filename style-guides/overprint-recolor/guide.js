// Style guide only: lets the specimens be tapped like the real pages.
(() => {
  // Tabs: one pressed at a time. theme.css's body:has() rule then re-inks the guide.
  document.querySelectorAll("[data-demo-tabs]").forEach((nav) => {
    nav.addEventListener("click", (e) => {
      const b = e.target.closest(".tab");
      if (!b) return;
      nav.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
    });
  });
  // Steps: tap to mark done; the first open step after a done one is "current".
  document.querySelectorAll("[data-demo-steps]").forEach((ol) => {
    const steps = [...ol.querySelectorAll("li")];
    const paint = () => {
      const open = steps.find((s) => !s.classList.contains("done"));
      const anyDone = steps.some((s) => s.classList.contains("done"));
      steps.forEach((s) => s.classList.toggle("current", s === open && anyDone));
    };
    steps.forEach((s) => {
      const flip = () => { s.classList.toggle("done"); paint(); };
      s.addEventListener("click", flip);
      s.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
    });
  });
  // Sheet options toggle.
  document.querySelectorAll("[data-demo-opts]").forEach((box) => {
    box.addEventListener("click", (e) => {
      const b = e.target.closest(".opt:not(:disabled)");
      if (b) b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    });
  });
  // Filter buttons and chips in the specimens are inert; keep the wake key toggling.
  const wake = document.getElementById("wake");
  if (wake) wake.addEventListener("click", () => wake.setAttribute("aria-pressed", String(wake.getAttribute("aria-pressed") !== "true")));
})();
