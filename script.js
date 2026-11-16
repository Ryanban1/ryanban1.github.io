(() => {
  const root = document.documentElement;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const toggle = $(".theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const current = root.dataset.theme ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = current === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) {}
    });
  }

  const box = $("#lightbox");
  if (box) {
    const boxImg = $("img", box);
    $$(".media img, .case-hero img").forEach(img => {
      img.addEventListener("click", () => {
        boxImg.src = img.src;
        boxImg.alt = img.alt;
        box.classList.add("open");
      });
    });
    box.addEventListener("click", () => box.classList.remove("open"));
    document.addEventListener("keydown", e => { if (e.key === "Escape") box.classList.remove("open"); });
  }
})();
