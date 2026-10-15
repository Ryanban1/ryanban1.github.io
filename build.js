#!/usr/bin/env node
// Builds the portfolio into dist/ from the Markdown files in content/.
// No dependencies: run with `node build.js`.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONTENT = path.join(ROOT, "content");
const STATIC = path.join(ROOT, "static");
const DIST = path.join(ROOT, "dist");

// ---------- Markdown helpers (covers the subset the content files use) ----------

function parseFile(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith("[") && v.endsWith("]") && v.includes('"')) {
      v = [...v.matchAll(/"([^"]*)"/g)].map((x) => x[1]);
    } else {
      v = v.replace(/^"(.*)"$/, "$1");
    }
    data[kv[1]] = v;
  }
  return { data, body: m[2] };
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Highlight [placeholder] text so unfinished spots are easy to see.
    .replace(/\[([^\]]+)\]/g, '<span class="ph">[$1]</span>');
}

function markdown(md) {
  const out = [];
  let list = null;
  let para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
    if (list) out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`);
    list = null;
  };
  for (const line of md.split("\n")) {
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (h) {
      flush();
      const lvl = Math.min(h[1].length + 1, 4);
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
    } else if (li) {
      if (para.length) flush();
      (list = list || []).push(li[1]);
    } else if (!line.trim()) {
      flush();
    } else {
      if (list) flush();
      para.push(line.trim());
    }
  }
  flush();
  return out.join("\n");
}

// Splits a body into { "Heading": "markdown under it" } by its ## headings.
function sections(body) {
  const res = {};
  let key = null;
  for (const line of body.split("\n")) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      key = h[1].trim();
      res[key] = "";
    } else if (key) {
      res[key] += line + "\n";
    }
  }
  return res;
}

// Content paths like "/images/x.jpg" become relative so the site works under a
// GitHub Pages project path (username.github.io/repo/) as well as a custom domain.
function localPath(p, depth) {
  if (!p || /^[a-z]+:/i.test(p)) return p;
  return "../".repeat(depth) + p.replace(/^\//, "");
}
const staticExists = (p) => p && !/^[a-z]+:/i.test(p) && fs.existsSync(path.join(STATIC, p.replace(/^\//, "")));
const isPlaceholder = (s) => !s || /\[[^\]]*\]/.test(s);

// ---------- Load content ----------

const bio = parseFile(path.join(CONTENT, "bio.md"));
const B = bio.data;
const bioSections = sections(bio.body);
const shortBio = (bioSections[Object.keys(bioSections).find((k) => /short/i.test(k))] || "").trim();
const aboutBio = (bioSections[Object.keys(bioSections).find((k) => /about/i.test(k))] || "").trim();

const skills = parseFile(path.join(CONTENT, "skills.md")).body.replace(/^#\s.*$/m, "");

const experience = parseFile(path.join(CONTENT, "experience.md"))
  .body.split(/^##\s+/m)
  .slice(1)
  .map((chunk) => {
    const [title, ...rest] = chunk.split("\n");
    const lines = rest.filter((l) => l.trim());
    const meta = lines[0] && !/^\s*[-*]\s/.test(lines[0]) ? lines.shift() : "";
    return { title: title.trim(), meta: meta.trim(), body: lines.join("\n") };
  });

const projDir = path.join(CONTENT, "projects");
const projects = fs
  .readdirSync(projDir)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((f) => {
    const p = parseFile(path.join(projDir, f));
    return { slug: f.replace(/\.md$/, "").replace(/^\d+-/, ""), ...p.data, tags: [].concat(p.data.tags || []), sections: sections(p.body) };
  });

// ---------- Templates ----------

const ICONS = {
  github: '<path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z"/>',
  linkedin: '<path d="M20.4 20.5h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.3V9h3.4v1.6c.5-.9 1.6-1.8 3.4-1.8 3.6 0 4.3 2.4 4.3 5.5v6.2zM5.3 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zM7.1 20.5H3.5V9h3.6v11.5zM22.2 0H1.8C.8 0 0 .8 0 1.7v20.6c0 .9.8 1.7 1.8 1.7h20.4c1 0 1.8-.8 1.8-1.7V1.7C24 .8 23.2 0 22.2 0z"/>',
  mail: '<path d="M2 4h20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v.5l10 6.3 10-6.3V6H2zm20 2.9-9.5 6a1 1 0 0 1-1 0L2 8.9V18h20V8.9z"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="currentColor">${ICONS[n]}</svg>`;

function contactLinks() {
  const links = [];
  if (B.github) links.push(`<a class="icon-link" href="${esc(B.github)}" rel="noopener">${icon("github")}<span>GitHub</span></a>`);
  if (B.linkedin) links.push(`<a class="icon-link" href="${esc(B.linkedin)}" rel="noopener">${icon("linkedin")}<span>LinkedIn</span></a>`);
  if (B.email) links.push(`<a class="icon-link" href="mailto:${esc(B.email.replace(/[\[\]]/g, ""))}">${icon("mail")}<span>Email</span></a>`);
  return links.join("");
}

function resumeButton(depth, cls = "btn") {
  return staticExists(B.resume) ? `<a class="${cls}" href="${localPath(B.resume, depth)}">Resume (PDF)</a>` : "";
}

function layout({ title, description, depth, body }) {
  const up = "../".repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<link rel="icon" href="${up}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${up}assets/style.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav">
  <div class="wrap nav-inner">
    <a class="brand" href="${up}index.html">${inline(B.name || "Portfolio")}</a>
    <nav aria-label="Main">
      <a href="${up}index.html#projects">Projects</a>
      <a href="${up}index.html#experience">Experience</a>
      <a href="${up}index.html#skills">Skills</a>
      <a href="${up}index.html#contact">Contact</a>
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="footer">
  <div class="wrap footer-inner">
    <span>© ${new Date().getFullYear()} ${inline(B.name || "")}</span>
    <span class="links">${contactLinks()}</span>
  </div>
</footer>
</body>
</html>
`;
}

function projectImage(p, depth) {
  if (staticExists(p.image)) return `<img src="${localPath(p.image, depth)}" alt="${esc(p.title)}" loading="lazy">`;
  return `<div class="img-ph" aria-hidden="true"><span>${esc((p.tags[0] || "Project").replace(/[\[\]]/g, ""))}</span></div>`;
}

const tagList = (tags) => `<ul class="tags">${tags.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`;

function projectCard(p) {
  return `<article class="card">
  <a class="card-link" href="projects/${p.slug}.html" aria-label="${esc(p.title.replace(/[\[\]]/g, ""))}">
    ${projectImage(p, 0)}
    <div class="card-body">
      <p class="eyebrow">${inline(p.type || "")}${p.date ? ` · ${inline(p.date)}` : ""}</p>
      <h3>${inline(p.title)}</h3>
      <p>${inline(p.summary || "")}</p>
      ${tagList(p.tags)}
    </div>
  </a>
</article>`;
}

function homePage() {
  const photo = staticExists(B.photo)
    ? `<img class="avatar" src="${localPath(B.photo, 0)}" alt="Photo of ${esc(B.name)}">`
    : `<div class="avatar avatar-ph" aria-hidden="true">${esc((B.name || "R").replace(/[\[\]]/g, "").trim()[0])}</div>`;
  const body = `
<section class="hero">
  <div class="wrap hero-inner">
    ${photo}
    <div>
      <p class="eyebrow">${inline(B.location || "")}${B.graduation ? ` · Graduating ${inline(B.graduation)}` : ""}</p>
      <h1>${inline(B.name || "")}</h1>
      <p class="headline">${inline(B.headline || "")}</p>
      <div class="lede">${markdown(shortBio)}</div>
      <div class="actions">
        <a class="btn" href="#projects">See my projects</a>
        ${resumeButton(0, "btn btn-ghost")}
      </div>
      <div class="links">${contactLinks()}</div>
    </div>
  </div>
</section>

<section id="projects" class="section">
  <div class="wrap">
    <h2>Projects</h2>
    <div class="grid">
      ${projects.map(projectCard).join("\n")}
    </div>
  </div>
</section>

<section id="about" class="section alt">
  <div class="wrap narrow">
    <h2>About</h2>
    ${markdown(aboutBio)}
  </div>
</section>

<section id="experience" class="section">
  <div class="wrap narrow">
    <h2>Experience</h2>
    <ol class="timeline">
      ${experience
        .map(
          (e) => `<li>
        <h3>${inline(e.title)}</h3>
        <p class="meta">${inline(e.meta)}</p>
        ${markdown(e.body)}
      </li>`
        )
        .join("\n")}
    </ol>
  </div>
</section>

<section id="skills" class="section alt">
  <div class="wrap narrow">
    <h2>Skills</h2>
    <div class="skills">${markdown(skills)}</div>
  </div>
</section>

<section id="contact" class="section">
  <div class="wrap narrow center">
    <h2>Get in touch</h2>
    <p>${inline(B.seeking ? `I'm looking for ${B.seeking}.` : "")} The fastest way to reach me is email.</p>
    <div class="actions center">
      ${B.email ? `<a class="btn" href="mailto:${esc(B.email.replace(/[\[\]]/g, ""))}">Email me</a>` : ""}
      ${resumeButton(0, "btn btn-ghost")}
    </div>
    <div class="links center">${contactLinks()}</div>
  </div>
</section>`;
  const desc = shortBio.replace(/[*\[\]]/g, "") || B.headline || "";
  return layout({ title: `${B.name} · ${B.headline}`.replace(/[\[\]]/g, ""), description: desc, depth: 0, body });
}

function projectPage(p, i) {
  const next = projects[(i + 1) % projects.length];
  const links = [];
  if (p.github) links.push(`<a class="btn" href="${esc(p.github)}" rel="noopener">${icon("github")} Code</a>`);
  if (p.demo && !isPlaceholder(p.demo)) links.push(`<a class="btn btn-ghost" href="${esc(p.demo)}" rel="noopener">Demo</a>`);
  const order = ["Problem", "My role", "Tools", "Results"];
  const keys = [...order.filter((k) => p.sections[k] !== undefined), ...Object.keys(p.sections).filter((k) => !order.includes(k))];
  const body = `
<article class="section">
  <div class="wrap narrow">
    <a class="back" href="../index.html#projects">← All projects</a>
    <p class="eyebrow">${inline(p.type || "")}${p.date ? ` · ${inline(p.date)}` : ""}</p>
    <h1>${inline(p.title)}</h1>
    <p class="headline">${inline(p.summary || "")}</p>
    ${tagList(p.tags)}
    <div class="actions">${links.join("")}</div>
    <div class="feature">${projectImage(p, 1)}</div>
    <div class="writeup">
      ${keys.map((k) => `<section><h2>${inline(k)}</h2>${markdown(p.sections[k])}</section>`).join("\n")}
    </div>
    <p class="next">Next project: <a href="${next.slug}.html">${inline(next.title)}</a></p>
  </div>
</article>`;
  return layout({
    title: `${p.title} · ${B.name}`.replace(/[\[\]]/g, ""),
    description: (p.summary || "").replace(/[\[\]]/g, ""),
    depth: 1,
    body,
  });
}

// ---------- Write output ----------

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, f.name), d = path.join(dest, f.name);
    f.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, "projects"), { recursive: true });
copyDir(path.join(ROOT, "assets"), path.join(DIST, "assets"));
copyDir(STATIC, DIST);
fs.writeFileSync(path.join(DIST, "index.html"), homePage());
projects.forEach((p, i) => fs.writeFileSync(path.join(DIST, "projects", `${p.slug}.html`), projectPage(p, i)));
fs.writeFileSync(path.join(DIST, ".nojekyll"), "");
console.log(`Built ${projects.length} project pages into dist/`);
