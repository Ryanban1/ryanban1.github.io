// Style follows diagramdesign.dev's exploded animation.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const fig = document.querySelector(".explode");
if (fig) init(fig);

function init(fig) {
  const stage = fig.querySelector(".explode-stage");
  const status = fig.querySelector(".explode-status");
  const svg = fig.querySelector("svg");
  const stepText = fig.querySelector(".explode-step");
  const playBtn = fig.querySelector('[data-act="play"]');
  const root = document.documentElement;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const GROUPS = [
    { label: "Lid",                  note: "3D printed · closes the top",        step: 1, kind: "plastic", parts: [11] },
    { label: "Camera, GPS, IMU, buzzer & LED", note: "Pi Camera v2.1 · u-blox GPS", step: 2, kind: "parts", parts: [3, 5, 7, 8, 12, 14, 24, 26] },
    {                                                                             step: 2, kind: "plastic", parts: [10, 15, 16, 21] },   // upper standoffs
    { label: "Mounting layer",       note: "3D printed · holds every component", step: 3, kind: "focal",   parts: [2] },
    {                                                                             step: 3, kind: "plastic", parts: [1, 20, 28, 29] },    // lower standoffs
    { label: "Raspberry Pi 4",       note: "Model B · runs the alarm and app",   step: 4, kind: "parts",   parts: [0, 4, 6, 9, 13, 17, 18, 22, 23, 25, 27] },
    { label: "Main casing",          note: "3D printed · five faces",            step: 1, kind: "plastic", parts: [19] }
  ];
  const STEP_NAMES = ["Assembled", "Lid off", "Camera, GPS, IMU, buzzer & LED out", "Mounting layer out", "Raspberry Pi out"];
  const LAST = STEP_NAMES.length - 1;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(-0.6, 2.4, 1.4);
  scene.add(sun);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  const viewDir = new THREE.Vector3(1, 0.5 * Math.SQRT2, 1).normalize();

  const bands = new THREE.DataTexture(new Uint8Array([150, 205, 255]), 3, 1, THREE.RedFormat);
  bands.minFilter = bands.magFilter = THREE.NearestFilter;
  bands.needsUpdate = true;
  const mats = {
    plastic: new THREE.MeshToonMaterial({ gradientMap: bands }),
    focal:   new THREE.MeshToonMaterial({ gradientMap: bands }),
    parts:   new THREE.MeshToonMaterial({ gradientMap: bands }),
    board:   new THREE.MeshToonMaterial({ gradientMap: bands })
  };
  const inkLine = new THREE.LineBasicMaterial();
  const fineLine = new THREE.LineBasicMaterial();

  const groups = [];
  let step = 0, playing = false, timer = 0, frame = 0;

  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(fig.dataset.model, gltf => {
    const parts = [...gltf.scene.children[0].children];
    const pivot = new THREE.Group();
    scene.add(pivot);

    GROUPS.forEach(def => {
      const g = new THREE.Group();
      def.parts.forEach(i => {
        const part = parts[i];
        if (!part) return;
        part.traverse(o => {
          if (!o.isMesh) return;
          const c = o.material.color;
          const isBoard = c && c.r < 0.01 && c.b < 0.01 && c.g > 0.7;
          o.material = isBoard ? mats.board : mats[def.kind];
          const big = def.kind !== "parts" || isBoard;
          o.add(new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, big ? 30 : 50), big ? inkLine : fineLine));
        });
        g.add(part);
      });
      pivot.add(g);
      groups.push({ ...def, obj: g, t: 0, from: 0, to: 0 });
    });

    const box = new THREE.Box3().setFromObject(pivot);
    pivot.position.sub(box.getCenter(new THREE.Vector3()));
    const GAP = 0.016;
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(viewDir, -viewDir.y).normalize();
    scene.updateMatrixWorld(true);
    const span = g => {
      let lo = Infinity, hi = -Infinity;
      const p = new THREE.Vector3();
      g.obj.traverse(o => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const d = p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).dot(up);
          if (d < lo) lo = d;
          if (d > hi) hi = d;
        }
      });
      return [lo, hi];
    };
    let top = null;
    [...groups].reverse().forEach(g => {
      const [lo, hi] = span(g);
      g.lift = top === null ? 0 : (top + GAP - lo) / up.y;
      top = hi + g.lift * up.y;
    });

    paint();
    groups.filter(g => g.label).forEach(g => {
      g.labelEl = document.createElement("span");
      g.labelEl.className = "explode-label";
      g.labelEl.innerHTML = "<b></b><small></small>";
      g.labelEl.firstChild.textContent = g.label;
      g.labelEl.lastChild.textContent = g.note;
      stage.append(g.labelEl);
      g.line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      g.dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      g.dot.setAttribute("r", 3);
      svg.append(g.line, g.dot);
    });
    fig.classList.add("ready");
    status.remove();
    resize();
    findAnchors();
    if (reduceMotion) setStep(LAST, true);
    else new IntersectionObserver(([e], io) => { if (e.isIntersecting) { io.disconnect(); play(); } }, { threshold: 0.5 }).observe(stage);
    draw();
  }, undefined, err => {
    console.error(err);
    status.textContent = "The 3D model couldn't load. The CAD render below shows the same design.";
  });

  function paint() {
    const css = getComputedStyle(root);
    const col = name => new THREE.Color(css.getPropertyValue(name).trim());
    const bg = col("--faint"), ink = col("--ink"), accent = col("--accent");
    const dark = bg.getHSL({}).l < 0.5;
    mats.plastic.color.set(dark ? "#3a3a3f" : "#ffffff");
    mats.parts.color.set(dark ? "#55565c" : "#c9cbd1");
    mats.board.color.set(dark ? "#4a5a4f" : "#b9c6bc");
    mats.focal.color.copy(bg).lerp(accent, dark ? 0.55 : 0.35);
    inkLine.color.copy(ink);
    fineLine.color.copy(ink).lerp(bg, 0.45);
    draw();
  }
  new MutationObserver(paint).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paint);

  const share = () => (stage.clientWidth < 700 ? 0.58 : 0.64);
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !groups.length) return;
    renderer.setSize(w, h, false);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    camera.position.copy(viewDir).multiplyScalar(2);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const saved = groups.map(g => g.obj.position.y);
    groups.forEach(g => (g.obj.position.y = g.lift));
    scene.updateMatrixWorld();
    const ext = new THREE.Box3(), p = new THREE.Vector3();
    groups.forEach(g => {
      const b = new THREE.Box3().setFromObject(g.obj);
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z])
        ext.expandByPoint(p.set(x, y, z).applyMatrix4(camera.matrixWorldInverse));
    });
    groups.forEach((g, i) => (g.obj.position.y = saved[i]));

    const pad = 28, f = share();
    const s = Math.max((ext.max.x - ext.min.x) / (w * f - pad * 2), (ext.max.y - ext.min.y) / (h - pad * 2));
    const cx = (ext.min.x + ext.max.x) / 2, cy = (ext.min.y + ext.max.y) / 2;
    camera.left = cx - (w * f / 2) * s;
    camera.right = camera.left + w * s;
    camera.top = cy + (h / 2) * s;
    camera.bottom = camera.top - h * s;
    camera.updateProjectionMatrix();
    draw();
  }
  new ResizeObserver(resize).observe(stage);

  function findAnchors() {
    const saved = groups.map(g => g.obj.position.y);
    groups.forEach(g => (g.obj.position.y = g.lift));
    scene.updateMatrixWorld();
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), c = new THREE.Vector3();
    groups.filter(g => g.label).forEach(g => {
      const b = new THREE.Box3().setFromObject(g.obj);
      b.getCenter(c).project(camera);
      ndc.y = c.y;
      g.anchor = null;
      for (let x = 1; x > -1 && !g.anchor; x -= 0.01) {
        ndc.x = x;
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObject(g.obj, true).find(h => h.object.isMesh);
        if (hit) g.anchor = g.obj.worldToLocal(hit.point.clone());
      }
      g.anchor ||= g.obj.worldToLocal(b.getCenter(new THREE.Vector3()));
    });
    groups.forEach((g, i) => (g.obj.position.y = saved[i]));
  }

  const v = new THREE.Vector3();
  function draw() {
    if (!groups.length || !groups[0].labelEl || camera.right === 1) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    groups.forEach(g => (g.obj.position.y = g.lift * g.t));
    renderer.render(scene, camera);

    const labelX = w * share() + 12;
    let lastY = -Infinity;
    groups.forEach(g => {
      if (!g.labelEl) return;
      const on = step >= g.step && g.t > 0.98;
      g.labelEl.classList.toggle("on", on);
      g.line.classList.toggle("on", on);
      g.dot.classList.toggle("on", on);
      if (!g.anchor) return;
      v.copy(g.anchor);
      g.obj.localToWorld(v).project(camera);
      const ax = (v.x + 1) / 2 * w, ay = (1 - v.y) / 2 * h;
      let ly = ay;
      if (on) { ly = Math.max(ay, lastY + g.labelEl.offsetHeight + 8); lastY = ly; }
      g.labelEl.style.transform = `translate(${labelX}px, ${ly - 10}px)`;
      g.dot.setAttribute("cx", ax);
      g.dot.setAttribute("cy", ay);
      g.line.setAttribute("points", ly === ay ? `${ax},${ay} ${labelX - 8},${ay}` : `${ax},${ay} ${labelX - 24},${ly} ${labelX - 8},${ly}`);
    });
  }

  const easeInOut = t => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);
  function setStep(n, instant) {
    step = Math.max(0, Math.min(LAST, n));
    stepText.textContent = `Step ${step} of ${LAST} · ${STEP_NAMES[step]}`;
    groups.forEach(g => { g.from = g.t; g.to = step >= g.step ? 1 : 0; });
    cancelAnimationFrame(frame);
    if (instant || reduceMotion) { groups.forEach(g => (g.t = g.to)); return draw(); }
    const start = performance.now(), dur = 850;
    const tick = now => {
      const k = Math.min(1, (now - start) / dur);
      groups.forEach(g => (g.t = g.from + (g.to - g.from) * easeInOut(k)));
      draw();
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  function play() {
    if (step === LAST) setStep(0, true);
    playing = true;
    playBtn.textContent = "Pause";
    const next = () => {
      if (!playing) return;
      if (step >= LAST) return pause();
      setStep(step + 1);
      timer = setTimeout(next, 1100);
    };
    timer = setTimeout(next, 500);
  }
  function pause() {
    playing = false;
    clearTimeout(timer);
    playBtn.textContent = "Play";
  }

  fig.querySelectorAll("[data-act]").forEach(btn => btn.addEventListener("click", () => {
    const act = btn.dataset.act;
    if (act === "play") return playing ? pause() : play();
    pause();
    if (act === "prev") setStep(step - 1);
    if (act === "next") setStep(step + 1);
    if (act === "replay") { setStep(0, true); play(); }
  }));
  fig.addEventListener("keydown", e => {
    const keys = { ArrowLeft: () => setStep(step - 1), ArrowRight: () => setStep(step + 1), Home: () => setStep(0), End: () => setStep(LAST), r: () => { setStep(0, true); play(); } };
    if (e.key === " ") { e.preventDefault(); return playing ? pause() : play(); }
    if (keys[e.key]) { e.preventDefault(); pause(); keys[e.key](); }
  });
}
