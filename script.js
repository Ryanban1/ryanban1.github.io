/* =========================================================
   Site interactions.
   Animations: the typing effect on headings and the circuit-dots
   background behind the hero. Visitors who prefer reduced motion
   see all text right away and a still dot grid.
   ========================================================= */
(() => {
  const root = document.documentElement;
  root.classList.add("js");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Light/dark toggle (starts from the device setting, remembers the choice) ---------- */
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

  /* ---------- Lightbox: click a (non-link) image to view it full-screen ---------- */
  const box = $("#lightbox");
  if (box) {
    const boxImg = $("img", box);
    $$(".media img").forEach(img => {
      if (img.closest("a")) return;
      img.addEventListener("click", () => {
        boxImg.src = img.src;
        boxImg.alt = img.alt;
        box.classList.add("open");
      });
    });
    box.addEventListener("click", () => box.classList.remove("open"));
    document.addEventListener("keydown", e => { if (e.key === "Escape") box.classList.remove("open"); });
  }

  /* ---------- Typing effect: text types itself out behind a cursor ---------- */
  const makeTyper = els => {
    if (!els.length || reduceMotion) return { play() {} };
    const parts = [];
    els.forEach(h => {
      h.style.minHeight = h.offsetHeight + "px";      // no page jump while it types
      h.setAttribute("aria-label", h.textContent.trim());
      const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) { parts.push({ node: n, text: n.nodeValue }); n.nodeValue = ""; }
    });
    if (!parts.length) return { play() {} };
    const cursor = document.createElement("span");
    cursor.className = "type-cursor";
    cursor.setAttribute("aria-hidden", "true");
    let p = 0, i = 0, started = false;
    const place = () => { const node = parts[p].node; node.parentNode.insertBefore(cursor, node.nextSibling); };
    place();
    const tick = () => {
      const part = parts[p];
      i = Math.min(i + 2 + Math.floor(Math.random() * 3), part.text.length);   // 2–4 characters at a time
      part.node.nodeValue = part.text.slice(0, i);
      place();
      if (i >= part.text.length) { p++; i = 0; }
      if (p < parts.length) setTimeout(tick, 25 + Math.random() * 45);
      else { cursor.remove(); els.forEach(h => (h.style.minHeight = "")); }
    };
    return { play(delay = 0) { if (started) return; started = true; setTimeout(tick, delay); } };
  };

  // The hero name types on page load
  makeTyper($$(".hero h1")).play(150);

  // Every other heading and label types out when it scrolls into view
  if (!reduceMotion && "IntersectionObserver" in window) {
    const typeTargets = $$("main h1, main h2, main h3, main h4, main h5, main .eyebrow")
      .filter(el => !el.closest(".hero") && el.textContent.trim());
    const typers = new Map(typeTargets.map(el => [el, makeTyper([el])]));
    const typeIO = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        typers.get(e.target).play(120);
        typeIO.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    typeTargets.forEach(el => typeIO.observe(el));
  }

  /* ---------- Interactive circuit dots behind the hero ---------- */
  const heroSection = $(".hero") && $(".hero").closest("section");
  if (heroSection) {
    const c = document.createElement("canvas");
    c.className = "hero-canvas";
    c.setAttribute("aria-hidden", "true");
    heroSection.prepend(c);
    const ctx = c.getContext("2d");
    const GAP = 28;
    let w = 0, h = 0, cols = 0, rows = 0, colors = {}, running = false, lastT = 0, spawnIn = 0;
    const mouse = { x: -9999, y: -9999 };
    let pulses = [];

    const readColors = () => {
      const cs = getComputedStyle(root);
      colors = { dot: cs.getPropertyValue("--border").trim(), accent: cs.getPropertyValue("--accent").trim() };
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = heroSection.clientWidth; h = heroSection.clientHeight;
      c.width = w * dpr; c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / GAP) + 1; rows = Math.ceil(h / GAP) + 1;
      if (!running) draw(0);
    };
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const spawn = (gx, gy) => {
      const d = DIRS[Math.floor(Math.random() * 4)];
      pulses.push({
        gx: gx ?? Math.floor(Math.random() * cols), gy: gy ?? Math.floor(Math.random() * rows),
        dx: d[0], dy: d[1], t: 0, trail: [], steps: 10 + Math.floor(Math.random() * 16)
      });
    };
    const draw = dt => {
      ctx.clearRect(0, 0, w, h);
      // dots, brighter and bigger near the cursor
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * GAP, y = j * GAP;
          const d = Math.hypot(x - mouse.x, y - mouse.y);
          const k = Math.max(0, 1 - d / 170);
          ctx.globalAlpha = 1;
          ctx.fillStyle = colors.dot;
          ctx.beginPath(); ctx.arc(x, y, 1.3, 0, 6.283); ctx.fill();
          if (k > 0) {
            ctx.globalAlpha = k;
            ctx.fillStyle = colors.accent;
            ctx.beginPath(); ctx.arc(x, y, 1.3 + k * 1.8, 0, 6.283); ctx.fill();
          }
        }
      }
      // signals running along the grid, like traces on a board
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      pulses = pulses.filter(p => p.steps > 0 || p.trail.length > 1);
      pulses.forEach(p => {
        if (p.steps > 0) {
          p.t += dt / 70;                                   // one grid cell every ~70ms
          while (p.t >= 1 && p.steps > 0) {
            p.t -= 1; p.trail.push([p.gx, p.gy]);
            p.gx += p.dx; p.gy += p.dy; p.steps--;
            if (Math.random() < 0.28) { const turn = Math.random() < 0.5 ? 1 : -1; [p.dx, p.dy] = [p.dy * turn, -p.dx * turn]; }
          }
          if (p.trail.length > 7) p.trail.shift();
        } else {
          p.trail.shift();
        }
        const pts = [...p.trail, [p.gx - p.dx * (1 - p.t) * (p.steps > 0 ? 1 : 0), p.gy - p.dy * (1 - p.t) * (p.steps > 0 ? 1 : 0)]];
        for (let s = 1; s < pts.length; s++) {
          ctx.globalAlpha = (s / pts.length) * 0.9;
          ctx.strokeStyle = colors.accent; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(pts[s - 1][0] * GAP, pts[s - 1][1] * GAP);
          ctx.lineTo(pts[s][0] * GAP, pts[s][1] * GAP);
          ctx.stroke();
        }
        const head = pts[pts.length - 1];
        ctx.globalAlpha = p.steps > 0 ? 1 : 0.4;
        ctx.fillStyle = colors.accent;
        ctx.beginPath(); ctx.arc(head[0] * GAP, head[1] * GAP, 2.6, 0, 6.283); ctx.fill();
      });
      ctx.globalAlpha = 1;
    };
    const loop = t => {
      if (!running) return;
      const dt = Math.min(50, t - (lastT || t));
      lastT = t;
      spawnIn -= dt;
      if (spawnIn <= 0 && pulses.length < 7) { spawn(); spawnIn = 500 + Math.random() * 700; }
      draw(dt);
      requestAnimationFrame(loop);
    };
    const start = () => { if (running || reduceMotion) return; running = true; lastT = 0; requestAnimationFrame(loop); };
    const stop = () => { running = false; };

    readColors(); resize();
    new ResizeObserver(resize).observe(heroSection);
    new MutationObserver(() => { readColors(); if (!running) draw(0); }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readColors(); if (!running) draw(0); });
    new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())).observe(heroSection);
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
    heroSection.addEventListener("mousemove", e => {
      const r = heroSection.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    heroSection.addEventListener("mouseleave", () => { mouse.x = mouse.y = -9999; });
    // click empty space in the hero to fire off a burst of signals
    heroSection.addEventListener("click", e => {
      if (reduceMotion || e.target.closest("a, button")) return;
      const r = heroSection.getBoundingClientRect();
      const gx = Math.round((e.clientX - r.left) / GAP), gy = Math.round((e.clientY - r.top) / GAP);
      for (let k = 0; k < 4; k++) spawn(gx, gy);
    });
  }

  // A hello for anyone who opens the browser console
  console.log("%c👋 Hey, thanks for peeking under the hood!", "font: 600 14px Inter, sans-serif; color: #2357d9");
  console.log("%cThis site is hand-built with HTML and CSS. Say hi: ryan.banerjee08@gmail.com", "font: 12px Inter, sans-serif; color: #5f6672");
})();
