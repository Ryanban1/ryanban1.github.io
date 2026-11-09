/* =========================================================
   Site interactions & animation.
   Uses GSAP + ScrollTrigger for scroll animations when they load. If they don't, or the
   visitor prefers reduced motion, everything still works and
   all content is visible — just with calmer motion.
   ========================================================= */
(() => {
  const root = document.documentElement;
  root.classList.add("js");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hasGSAP = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
  const animate = hasGSAP && !reduceMotion;
  if (!hasGSAP) root.classList.add("no-gsap");
  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    gsap.ticker.lagSmoothing(0);   // never slow animations down after a hiccup, so content can't get stuck hidden
  }

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

  /* ---------- Nav tucks away while scrolling down, comes back on scroll up ---------- */
  const nav = $("nav");
  let lastY = window.scrollY;
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    if (nav) {
      if (y > 160 && y > lastY + 4) nav.classList.add("nav-hidden");
      else if (y < lastY - 4 || y < 160) nav.classList.remove("nav-hidden");
    }
    lastY = y;
  }, { passive: true });

  /* ---------- Heading typing effect (plays on page load) ---------- */
  const typing = (() => {
    const heads = $$(".hero h1");
    if (!heads.length || reduceMotion) return { play() {} };
    const parts = [];
    heads.forEach(h => {
      h.style.minHeight = h.offsetHeight + "px";      // no page jump while it types
      h.setAttribute("aria-label", h.textContent.trim());
      const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) { parts.push({ node: n, text: n.nodeValue }); n.nodeValue = ""; }
    });
    const cursor = document.createElement("span");
    cursor.className = "type-cursor";
    cursor.setAttribute("aria-hidden", "true");
    let p = 0, i = 0;
    const place = () => { const node = parts[p].node; node.parentNode.insertBefore(cursor, node.nextSibling); };
    place();
    const tick = () => {
      const part = parts[p];
      i = Math.min(i + 2 + Math.floor(Math.random() * 3), part.text.length);   // 2–4 characters at a time
      part.node.nodeValue = part.text.slice(0, i);
      place();
      if (i >= part.text.length) { p++; i = 0; }
      if (p < parts.length) setTimeout(tick, 25 + Math.random() * 45);
      else cursor.remove();
    };
    return { play(delay = 0) { setTimeout(tick, delay); } };
  })();

  /* ---------- Hero entrance ---------- */
  const heroBits = $$(".hero .eyebrow, .hero .tagline, .hero .actions > *, .hero .facts > div, .scroll-hint");
  const animateHero = animate && heroBits.length > 0;
  if (animateHero) gsap.set(heroBits, { opacity: 0, y: 24 });
  const playHero = () => {
    typing.play(150);
    if (animateHero) gsap.to(heroBits, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.06, delay: 0.25 });
  };

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

  /* ---------- Scroll animations ---------- */
  if (animate) {
    // Sections that stay still while scrolling: the hero and the homepage "A bit about me"
    const homeAbout = $(".home-about") && $(".home-about").closest("section");
    const still = el => el.closest(".hero") || (homeAbout && homeAbout.contains(el));

    // Headings rise in word by word
    $$("main h2").forEach(h2 => {
      if (still(h2) || h2.children.length) return;
      const words = h2.textContent.trim().split(/\s+/);
      h2.innerHTML = words.map(w => `<span class="split-word"><span>${w.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span></span>`).join(" ");
      gsap.from($$(".split-word > span", h2), {
        yPercent: 110, duration: 0.9, ease: "power4.out", stagger: 0.06,
        scrollTrigger: { trigger: h2, start: "top 88%" }
      });
    });
    $$("main .eyebrow").forEach(el => {
      if (still(el)) return;
      gsap.from(el, { opacity: 0, x: -14, duration: 0.7, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 90%" } });
    });

    // Images unveil from the bottom with a slow zoom
    $$(".project-card .media, .gallery .media, .project-hero, .hobby .media").forEach(m => {
      m.classList.add("img-reveal");
      const inner = m.firstElementChild;
      const tl = gsap.timeline({ scrollTrigger: { trigger: m, start: "top 88%" } });
      tl.fromTo(m, { clipPath: "inset(100% 0% 0% 0% round 12px)" }, { clipPath: "inset(0% 0% 0% 0% round 12px)", duration: 1.1, ease: "power4.inOut" });
      if (inner) tl.from(inner, { scale: 1.2, duration: 1.4, ease: "power3.out" }, 0);
    });

    // Cards and list items drift up as they arrive
    const batchTargets = $$(".card, .project-card, .hobby, .metric, .timeline > li, .constraints > div, .steps li, .skill-group, .project-meta, .home-about > div, .about-body > div, #contact .actions")
      .filter(el => !still(el));
    gsap.set(batchTargets, { opacity: 0, y: 30 });
    const showBatch = batch => gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.08, overwrite: true });
    // also reveal things the page jumps past (e.g. arriving via projects.html#project-1) or scrolls back up to
    ScrollTrigger.batch(batchTargets, { start: "top 90%", onEnter: showBatch, onLeave: showBatch, onEnterBack: showBatch });
    window.addEventListener("load", () => {
      const already = batchTargets.filter(el => el.getBoundingClientRect().top < window.innerHeight);
      if (already.length) showBatch(already);
    });

    // Project numbers count up
    $$(".metric .big").forEach(el => {
      const m = el.textContent.trim().match(/^(\D*?)([−-]?)(\d+(?:\.\d+)?)(.*)$/);
      if (!m) return;
      const [, pre, sign, num, post] = m;
      const val = { n: 0 };
      gsap.to(val, {
        n: parseFloat(num), duration: 1.6, ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 90%" },
        onUpdate: () => { el.textContent = pre + sign + Math.round(val.n) + post; }
      });
    });

    // The hero drifts up and fades as you scroll away from it
    if (heroSection) {
      gsap.to(".hero", {
        yPercent: -12, opacity: 0.15, ease: "none",
        scrollTrigger: { trigger: heroSection, start: "top top", end: "bottom top", scrub: true }
      });
      const hint = $(".scroll-hint");
      if (hint) gsap.to(hint, { opacity: 0, ease: "none", scrollTrigger: { trigger: heroSection, start: "top top", end: "+=160", scrub: true } });
    }

    // Recalculate once fonts and images have loaded
    window.addEventListener("load", () => ScrollTrigger.refresh());
  } else if (!reduceMotion && "IntersectionObserver" in window) {
    // Simple fade-in fallback when the animation library isn't available
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    $$("main .wrap > *, .project-grid > *, .hobbies > *, .gallery > *, .metrics > *, .snapshot > *, .timeline > li").forEach(el => {
      if (el.closest(".hero")) return;
      el.classList.add("reveal");
      io.observe(el);
    });
  }

  /* ---------- Mouse niceties: tilting cards ---------- */
  if (animate && finePointer) {
    $$(".project-card").forEach(card => {
      card.addEventListener("mousemove", e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        gsap.to(card, { rotateY: px * 8, rotateX: -py * 8, transformPerspective: 900, duration: 0.4, ease: "power2.out" });
      });
      card.addEventListener("mouseleave", () => gsap.to(card, { rotateY: 0, rotateX: 0, duration: 0.6, ease: "power3.out" }));
    });
  }

  /* ---------- Go ---------- */
  playHero();

  // A hello for anyone who opens the browser console
  console.log("%c👋 Hey, thanks for peeking under the hood!", "font: 600 14px Inter, sans-serif; color: #2357d9");
  console.log("%cThis site is hand-built with HTML, CSS and GSAP. Say hi: ryan.banerjee08@gmail.com", "font: 12px Inter, sans-serif; color: #5f6672");
})();
