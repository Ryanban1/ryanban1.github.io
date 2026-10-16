#!/usr/bin/env node
// Builds Ryan Banerjee's portfolio into dist/ from the Markdown files in content/.
// Zero dependencies: run `node build.js`. GitHub Actions runs the same command.
//
// Optional environment overrides (handy for testing, never needed for a normal build):
//   CONTENT_DIR, STATIC_DIR, OUT_DIR   read content / static files from, or write to, other folders
//   BUILD_DATE=YYYY-MM-DD               pin the "Revised" date (defaults to today, UTC)
//   SITE_URL=https://example.com/       base for canonical URLs, Open Graph tags and the sitemap

"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONTENT = path.resolve(process.env.CONTENT_DIR || path.join(ROOT, "content"));
const STATIC = path.resolve(process.env.STATIC_DIR || path.join(ROOT, "static"));
const DIST = path.resolve(process.env.OUT_DIR || path.join(ROOT, "dist"));
const ASSETS = path.join(ROOT, "assets");
const SITE_URL = (process.env.SITE_URL || "https://ryanban1.github.io/").replace(/\/?$/, "/");
const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=IBM+Plex+Mono:wght@400;500;600&display=swap";

const NOW = /^\d{4}-\d{2}-\d{2}$/.test(process.env.BUILD_DATE || "") ? new Date(process.env.BUILD_DATE + "T12:00:00Z") : new Date();
const ISO_DATE = NOW.toISOString().slice(0, 10);
const NOW_M = NOW.getUTCFullYear() * 12 + NOW.getUTCMonth(); // months since year 0

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

// Strips a UTF-8 byte-order mark (some editors add one) so front matter still parses.
const read = (f) => fs.readFileSync(f, "utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
const esc = (s) =>
  String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const plain = (md) => String(md || "").replace(/\*\*|__|`/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
const isTrue = (v) => /^(true|yes|1)$/i.test(String(v || "").trim());

// Splits on `sep` only outside (), [], {} and, optionally, quotes.
// "OpenCV, AWS (SageMaker, S3, EC2), machine learning" -> 3 items.
function splitOutside(s, sep = ",", quotes = false) {
  const out = [];
  let depth = 0, q = null, cur = "";
  for (const ch of String(s)) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (quotes && (ch === '"' || ch === "'")) { q = ch; cur += ch; continue; }
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
    else if (ch === sep && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

// A value as written after `key:`. Quotes are removed, and a trailing `# comment`
// is dropped the way YAML drops it (after a closing quote, or after a space in an
// unquoted value), so `github: ""   # explain` reads as empty.
const unquote = (v) => {
  const t = String(v).trim();
  let m;
  if ((m = t.match(/^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/))) return m[1].replace(/\\(.)/g, "$1");
  if ((m = t.match(/^'((?:[^']|'')*)'\s*(?:#.*)?$/))) return m[1].replace(/''/g, "'");
  if ((m = t.match(/^(["'])(.*)\1$/))) return m[2]; // lenient: 'It's fine'
  return t.replace(/(^|\s+)#.*$/, "").trim();
};

// Front matter: `key: "string"`, `key: plain`, `key: ["a", "b"]`, each with an optional `# comment`.
function parseFrontMatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const v = kv[2].trim();
    const arr = v.match(/^\[(.*)\]\s*(?:#.*)?$/);
    data[kv[1]] = arr ? splitOutside(arr[1], ",", true).map(unquote).filter(Boolean) : unquote(v);
  }
  return { data, body: m[2] };
}

// Markdown body -> { title, intro[], sections[{ title, meta{}, blocks[] }] }.
// Blocks are { type: "p" | "list" | "h", text | items }. With `meta`, leading
// `key: value` lines inside a section are collected as that entry's metadata.
function parseBody(body, { meta = false } = {}) {
  const doc = { title: "", intro: [], sections: [] };
  let sec = null, para = [], list = null;
  const target = () => (sec ? sec.blocks : doc.intro);
  const flush = () => {
    if (para.length) target().push({ type: "p", text: para.join(" ") });
    if (list) target().push({ type: "list", items: list });
    para = [];
    list = null;
  };
  for (const line of body.split("\n")) {
    let m;
    if ((m = line.match(/^#\s+(.+)$/))) { flush(); doc.title = m[1].trim(); continue; }
    if ((m = line.match(/^##\s+(.+)$/))) { flush(); sec = { title: m[1].trim(), meta: {}, blocks: [] }; doc.sections.push(sec); continue; }
    if ((m = line.match(/^#{3,6}\s+(.+)$/))) { flush(); target().push({ type: "h", text: m[1].trim() }); continue; }
    if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) { if (para.length) flush(); (list = list || []).push(m[1].trim()); continue; }
    if (!line.trim()) { flush(); continue; }
    if (list && /^\s{2,}\S/.test(line)) { list[list.length - 1] += " " + line.trim(); continue; }
    // `location: ""`, `dates:` and `dates: Sep 2022 – June 2026` are all metadata; an
    // empty value hides the field. The space after the colon keeps URLs out.
    if (meta && sec && !sec.blocks.length && !para.length && !list && (m = line.match(/^([a-z][a-z _-]*):(?:\s+(.*))?$/))) {
      const v = unquote(m[2] || "");
      if (v) sec.meta[m[1].trim().replace(/\s+/g, "_")] = v;
      continue;
    }
    if (list) flush();
    para.push(line.trim());
  }
  flush();
  return doc;
}

// Figures inside bullets ($15M+, 13,000+, 84%+, 1 of 10) are set in bold
// tabular figures. Years, "team of 5" and "15-member" are left alone.
const FIG_RE = /\$\d(?:[\d,.]*\d)?[KMB]?\+?|\b\d(?:[\d,.]*\d)?[KMB]?(?:%\+?|\+)|\b1 of \d+\b/g;

function inline(src, { figures = false } = {}) {
  const fmt = (t) => {
    let h = esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
    if (figures) h = h.split(/(<[^>]+>)/).map((s) => (s.startsWith("<") ? s : s.replace(FIG_RE, '<b class="num">$&</b>'))).join("");
    return h;
  };
  const out = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g; // links are split out so URLs are never reformatted
  let last = 0, m;
  while ((m = re.exec(src))) {
    out.push(fmt(src.slice(last, m.index)));
    const ext = /^https?:/i.test(m[2]);
    out.push(`<a href="${esc(m[2])}"${ext ? ' rel="noopener"' : ""}>${fmt(m[1])}</a>`);
    last = re.lastIndex;
  }
  out.push(fmt(src.slice(last)));
  return out.join("");
}

const squareList = (items, opts) => `<ul class="sq">${items.map((t) => `<li>${inline(t, opts)}</li>`).join("")}</ul>`;
function renderBlocks(blocks, opts = {}) {
  return blocks
    .map((b) => {
      if (b.type === "p") return `<p>${inline(b.text, opts)}</p>`;
      if (b.type === "h") return `<h3 class="wsub">${inline(b.text)}</h3>`;
      return squareList(b.items, opts);
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Dates. Handles "Sep 2022 – June 2026", "July – Aug 2025", "July 2026",
// "Sept. 2024 — Present", "Jan-Mar 2024", "2023 – 2024". Returns month
// numbers with an exclusive end, or null (with a warning) when unreadable.
// "Expected ..." dates are future plans and are skipped quietly.
// ---------------------------------------------------------------------------

const MONTHS = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtMonth = (mi) => `${MONTH_LABEL[((mi % 12) + 12) % 12]} ${Math.floor(mi / 12)}`;

function parsePoint(t) {
  t = t.trim().replace(/\.$/, "");
  if (/^(present|now|current|ongoing|today)$/i.test(t)) return { now: true };
  let m = t.match(/^([A-Za-z]+)\.?(?:\s+(\d{4}))?$/);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    return mo === undefined ? null : { m: mo, y: m[2] ? +m[2] : null };
  }
  if ((m = t.match(/^(\d{4})$/))) return { m: null, y: +m[1] };
  if ((m = t.match(/^(\d{1,2})\/(\d{4})$/)) && +m[1] >= 1 && +m[1] <= 12) return { m: +m[1] - 1, y: +m[2] };
  return null;
}

function parseRange(str, nowM = NOW_M, warn = true) {
  if (!str || /expected|planned|upcoming|incoming/i.test(str)) return null;
  const fail = () => {
    if (warn) console.warn(`  ! Could not read the dates "${str}"; left out of the activity capture.`);
    return null;
  };
  const parts = String(str).trim().split(/\s*[–—-]\s*/);
  if (parts.length > 2 || !parts[0]) return fail();
  const a = parsePoint(parts[0]);
  const b = parts.length === 2 ? parsePoint(parts[1]) : a;
  if (!a || !b) return fail();
  const resolve = (p) => (p.now ? { m: nowM % 12, y: Math.floor(nowM / 12) } : { m: p.m, y: p.y });
  const s = resolve(a), e = resolve(b);
  if (s.y == null) s.y = e.y; // "July – Aug 2025": the start borrows the end's year
  if (e.y == null) e.y = s.y;
  if (s.y == null) return fail();
  if (s.m == null) s.m = 0;
  if (e.m == null) e.m = 11;
  let start = s.y * 12 + s.m;
  const end = e.y * 12 + e.m;
  if (!a.now && a.y == null && start > end) start -= 12; // "Nov – Feb 2025" starts the year before
  if (end < start) return fail();
  return { start, end: end + 1, ongoing: !!(a.now || b.now) };
}

// ---------------------------------------------------------------------------
// Load content
// ---------------------------------------------------------------------------

const contentFile = (name) => path.join(CONTENT, name);
const exists = (f) => fs.existsSync(f);

// Stops the build with a clear message instead of publishing a broken page.
function fail(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

if (!exists(contentFile("bio.md"))) fail(`Missing ${contentFile("bio.md")}.`);
const bioDoc = parseFrontMatter(read(contentFile("bio.md")));
const B = bioDoc.data;
if (!String(B.name || "").trim()) fail("content/bio.md needs a `name:` line in its front matter (between the --- lines).");
const bioBody = parseBody(bioDoc.body);
const bioSection = (re) => (bioBody.sections.find((s) => re.test(s.title)) || { blocks: [] }).blocks;
const shortBio = bioSection(/short/i);
const aboutBio = bioSection(/about/i);
const email = (B.email || "").trim();
const interests = [].concat(B.interests || []).filter(Boolean);

// Page-wide ids: a second "## Cisco" gets exp-cisco-2 rather than a duplicate id.
const usedIds = new Set();
const uniqueId = (base) => {
  let id = base, n = 2;
  while (usedIds.has(id)) id = `${base}-${n++}`;
  usedIds.add(id);
  return id;
};

// Entries keep their order in the file, both in the list and in the activity capture.
function loadEntries(file, prefix) {
  if (!exists(contentFile(file))) return { title: "", entries: [] };
  const doc = parseBody(parseFrontMatter(read(contentFile(file))).body, { meta: true });
  const entries = doc.sections.map((s) => {
    const dates = s.meta.dates || "";
    return {
      title: s.title,
      id: uniqueId(`${prefix}-${slugify(s.title) || "entry"}`),
      role: s.meta.role || "",
      degree: s.meta.degree || "",
      dates,
      location: s.meta.location || "",
      blocks: s.blocks,
      range: parseRange(dates),
      projects: [],
    };
  });
  return { title: doc.title, entries };
}

const EXP = loadEntries("experience.md", "exp");
const LEAD = loadEntries("leadership.md", "lead");
const EDU = loadEntries("education.md", "edu");

const hlDoc = exists(contentFile("highlights.md")) ? parseBody(read(contentFile("highlights.md"))) : null;
const highlights = hlDoc
  ? hlDoc.intro
      .concat(...hlDoc.sections.map((s) => s.blocks))
      .filter((b) => b.type === "list")
      .flatMap((b) => b.items)
      .map((li) => li.match(/^\*\*(.+?)\*\*\s*\|\s*(.+)$/))
      .filter(Boolean)
      .map((m) => ({ figure: m[1].trim(), meaning: m[2].trim() }))
  : [];

const skills = exists(contentFile("skills.md"))
  ? parseBody(read(contentFile("skills.md")))
      .intro.filter((b) => b.type === "list")
      .flatMap((b) => b.items)
      .map((li) => li.match(/^\*\*(.+?):?\*\*:?\s*(.+)$/))
      .filter(Boolean)
      .map((m) => ({ area: m[1].replace(/:$/, "").trim(), items: splitOutside(m[2].replace(/\.$/, "")) }))
  : [];

const projDir = contentFile("projects");
const projectFiles = (exists(projDir) ? fs.readdirSync(projDir) : []).filter((f) => f.endsWith(".md") && !f.startsWith(".")).sort();
// Every page links to the project list, so a build with no projects is a mistake
// (usually project files that were never committed). Fail rather than deploy it.
if (!projectFiles.length) fail(`No project files found in ${projDir}. Add at least one projects/NN-name.md.`);
const slugs = new Map();
const projectsInFileOrder = projectFiles.map((f) => {
    const { data, body } = parseFrontMatter(read(path.join(projDir, f)));
    const doc = parseBody(body);
    const [kind, ...org] = String(data.type || "").split(" · ");
    const slug = slugify(f.replace(/\.md$/, "").replace(/^\d+-/, ""));
    if (!slug) fail(`Can't make a page name from the file name "${f}". Use letters and numbers, e.g. 05-my-project.md.`);
    if (slugs.has(slug)) fail(`"${slugs.get(slug)}" and "${f}" would both become projects/${slug}.html. Rename one of them.`);
    slugs.set(slug, f);
    return {
      ...data,
      slug,
      title: data.title || doc.title || f.replace(/\.md$/, ""),
      tags: [].concat(data.tags || []).filter(Boolean),
      kind: kind.trim(),
      org: org.join(" · ").trim(),
      featured: isTrue(data.featured),
      sections: doc.sections,
      range: parseRange(data.date),
    };
  });
const featured = projectsInFileOrder.find((p) => p.featured) || projectsInFileOrder[0];
const projects = featured ? [featured, ...projectsInFileOrder.filter((p) => p !== featured)] : [];
const projSection = (p, re) => p.sections.find((s) => re.test(s.title));

// A project whose dates exactly match an experience or leadership entry belongs to it:
// the entry links to the write-up and the capture shows them as one row.
const sameRange = (a, b) => a && b && a.start === b.start && a.end === b.end;
for (const p of projects) {
  const parent = [...EXP.entries, ...LEAD.entries].find((e) => sameRange(e.range, p.range));
  if (parent) { p.parent = parent; parent.projects.push(p); }
}

// Static files (photos, résumé) only appear when the file really exists.
const staticRel = (p) => (p && !/^[a-z]+:/i.test(p) ? p.replace(/^\/+/, "") : "");
const staticExists = (p) => !!staticRel(p) && exists(path.join(STATIC, staticRel(p)));
const up = (depth) => "../".repeat(depth);
const hasPhoto = staticExists(B.photo);

// Pages never show a phone number (checked after rendering, below). The résumé PDF in
// static/ is published as-is: Ryan chose to post the version with his phone number on it.
const PHONE_TEXT_RE = /(?<!\d)\(?\d{3}\)?[-. ]\s?\d{3}[-. ]\d{4}(?!\d)/;
const hasResume = staticExists(B.resume);
const pageHref = (p) => `projects/${p.slug}.html`;

// ---------------------------------------------------------------------------
// Activity capture: a logic-analyzer timing diagram drawn from the dates above.
// ---------------------------------------------------------------------------

function buildLanes() {
  let lanes = [];
  const add = (group, kind, list, href) =>
    list.forEach((e) => e.range && lanes.push({ group, kind, name: e.title, dates: e.dates || e.date, href: href(e), ...e.range }));
  add("Experience", "Experience", EXP.entries, (e) => `#${e.id}`);
  add(LEAD.title || "Leadership & community", "Leadership & community", LEAD.entries, (e) => `#${e.id}`);
  add("Projects", "Project", projects.filter((p) => !p.parent), (p) => pageHref(p));
  // Growth guard: past 8 rows, projects fold away (they have their own list) and
  // rows that ended more than four years before the build are dropped.
  if (lanes.length > 8) lanes = lanes.filter((l) => l.kind !== "Project");
  if (lanes.length > 8) lanes = lanes.filter((l) => l.end > NOW_M - 48);
  return lanes;
}

function renderCapture() {
  const lanes = buildLanes();
  if (!lanes.length) return "";
  const ongoing = lanes.some((l) => l.ongoing || l.end > NOW_M);
  const d0 = Math.min(...lanes.map((l) => l.start));
  // The axis ends at the last listed end date. A build-date cursor appears only
  // while some row is still running, so finished rows never read as "inactive now".
  const d1 = ongoing ? Math.max(NOW_M + 1, ...lanes.map((l) => l.end)) : Math.max(...lanes.map((l) => l.end));
  const span = d1 - d0;
  const pct = (m) => +(((m - d0) / span) * 100).toFixed(3);
  const cursor = ongoing ? +(((NOW_M + (NOW.getUTCDate() - 0.5) / 31 - d0) / span) * 100).toFixed(3) : null;
  const years = [];
  for (let y = Math.floor(d0 / 12) + 1; y * 12 < d1; y++) {
    const x = pct(y * 12);
    if (x > 2) years.push({ y, x });
  }
  const labelled = years.filter((t) => cursor == null || Math.abs(t.x - cursor) > 4);
  const stops = [];
  for (const t of years) stops.push(`transparent calc(${t.x}% - .5px)`, `var(--grid) calc(${t.x}% - .5px)`, `var(--grid) calc(${t.x}% + .5px)`, `transparent calc(${t.x}% + .5px)`);
  if (cursor != null) stops.push(`transparent calc(${cursor}% - 1px)`, `var(--now) calc(${cursor}% - 1px)`, `var(--now) calc(${cursor}% + 1px)`, `transparent calc(${cursor}% + 1px)`);
  const grad = `linear-gradient(to right, transparent 0, ${stops.join(", ")}, transparent 100%)`;

  const groups = [];
  for (const l of lanes) {
    let g = groups.find((x) => x.name === l.group);
    if (!g) groups.push((g = { name: l.group, lanes: [] }));
    g.lanes.push(l);
  }
  // Rows keep the order of the lists below them (file order), so "Select a row"
  // lands on an entry in the same position.

  const lane = (l) => {
    // A row that is still running stays high up to the cursor, with no falling edge.
    const live = cursor != null && l.end > NOW_M;
    const s = pct(l.start), w = +((live ? cursor : pct(l.end)) - s).toFixed(3);
    return `<li class="lane${live ? " live" : ""}" style="--s:${s}%;--w:${w}%">
        <a class="lane-a" href="${esc(l.href)}"><span class="lane-nm">${esc(l.name)}</span> <span class="lane-dt">${dateHtml(l.dates)}</span><span class="sr">, ${esc(l.kind)}</span></a>
        <span class="lane-trk" aria-hidden="true"><span class="lane-in"><span class="lane-hi"></span></span></span>
      </li>`;
  };
  const chip = cursor != null ? `<span class="cap-chip" style="--x:${cursor}%">As of ${esc(fmtMonth(NOW_M))}</span>` : "";

  return `<figure class="capture" aria-labelledby="cap-title" style="--yr-grad:${grad}">
    <div class="cap-head">
      <p class="lbl" id="cap-title">Activity, ${esc(fmtMonth(d0))} – ${esc(fmtMonth(d1 - 1))}</p>
      <ul class="cap-key" aria-hidden="true">
        <li><span class="sw sw-hi"></span>High: active</li>
        <li><span class="sw sw-lo"></span>Low: not active</li>
      </ul>
    </div>
    <div class="cap-body">
      <div class="cap-panel" aria-hidden="true"><div class="cap-in">
        ${years.map((t) => `<span class="cap-yr" style="--x:${t.x}%"></span>`).join("")}${cursor != null ? `<span class="cap-now" style="--x:${cursor}%"></span>` : ""}<span class="cap-sweep"></span>
      </div></div>
      ${chip ? `<div class="cap-axis cap-axis-top" aria-hidden="true"><span></span><div class="cap-in">${chip}</div></div>` : ""}
      ${groups
        .map(
          (g) => `<div class="cap-group">
      <p class="cap-gl lbl" id="cap-${slugify(g.name)}">${esc(g.name)}</p>
      <ol class="cap-lanes" aria-labelledby="cap-${slugify(g.name)}">
      ${g.lanes.map(lane).join("\n      ")}
      </ol>
      </div>`
        )
        .join("\n      ")}
      <div class="cap-axis" aria-hidden="true"><span></span><div class="cap-in">${labelled
        .map((t) => `<span class="cap-yl${t.x > 92 ? " end" : ""}" style="--x:${t.x}%">${t.y}</span>`)
        .join("")}</div></div>
    </div>
    <figcaption class="cap-note">Each row is one role or project, drawn to scale from its listed dates; the trace is high while it was active. Select a row for details.</figcaption>
  </figure>`;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const ICONS = {
  github:
    '<path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z"/>',
  linkedin:
    '<path d="M20.4 20.5h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.3V9h3.4v1.6c.5-.9 1.6-1.8 3.4-1.8 3.6 0 4.3 2.4 4.3 5.5v6.2zM5.3 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zM7.1 20.5H3.5V9h3.6v11.5zM22.2 0H1.8C.8 0 0 .8 0 1.7v20.6c0 .9.8 1.7 1.8 1.7h20.4c1 0 1.8-.8 1.8-1.7V1.7C24 .8 23.2 0 22.2 0z"/>',
  doc: '<path d="M6 1h8.6L20 6.4V23H4V1h2zm0 2v18h12V7.2L13.8 3H6zm2 8h8v1.6H8V11zm0 3.6h8v1.6H8v-1.6zm0 3.6h5.5v1.6H8v-1.6z"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false">${ICONS[n]}</svg>`;
const shortUrl = (u) => String(u).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const kindLabel = (p) => p.kind || "Project";
// A no-break space keeps each arrow on the line of the word before it.
const arrow = '<span aria-hidden="true">&nbsp;→</span>';
const larrow = '<span aria-hidden="true">←&nbsp;</span>';

const specTable = (rows, { caption = "", cls = "" } = {}) =>
  `<table class="spec${cls ? " " + cls : ""}">${caption ? `<caption class="lbl">${caption}</caption>` : ""}<tbody>
${rows
  .filter((r) => r && r[1])
  .map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v}</td></tr>`)
  .join("\n")}
</tbody></table>`;

// "A · B · C". Each item carries a leading dot that the CSS clips when the item
// starts a line, so wrapped lines never begin or end with a separator, and a long
// item can still wrap inside a narrow cell. Screen readers hear commas instead.
const joinDots = (items) =>
  `<span class="dots"><span class="dots-in">${items
    .map((t, i) => `<span class="dot">${esc(t)}${i < items.length - 1 ? '<span class="sr">,</span>' : ""}</span>`)
    .join(" ")}</span></span>`;
// Date ranges break after the dash, never inside "Apr 2026".
const dateHtml = (d) => {
  const parts = String(d || "").split(/\s*([–—-])\s*/);
  return parts.length === 3 ? `<span class="nw">${esc(parts[0])} ${parts[1]}</span> <span class="nw">${esc(parts[2])}</span>` : `<span class="nw">${esc(d)}</span>`;
};

// `home` is "" on the home page, "../index.html" on project pages and "/" on the 404 page.
// Only sections that are actually rendered get a nav link.
function header(home) {
  const nav = [
    projects.length && ["Projects", "#projects"],
    EXP.entries.length && ["Experience", "#experience"],
    skills.length && ["Skills", "#skills"],
    ["Contact", "#contact"],
  ].filter(Boolean);
  return `<header class="site-header">
  <div class="wrap hdr">
    <a class="brand" href="${home || "#top"}">${esc(B.name)}</a>
    <nav class="nav" aria-label="Main">
      ${nav.map(([t, h]) => `<a href="${home}${h}">${t}</a>`).join("\n      ")}
    </nav>
    <button class="toggle" type="button" aria-label="Switch color theme" title="Switch color theme">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor"/></svg>
    </button>
  </div>
</header>`;
}

function footer(depth, rootAbs) {
  const base = rootAbs ? "/" : up(depth);
  const contact = [];
  if (email) contact.push(`<a href="mailto:${esc(email)}">Email</a>`);
  if (B.linkedin) contact.push(`<a href="${esc(B.linkedin)}" rel="noopener">LinkedIn</a>`);
  if (B.github) contact.push(`<a href="${esc(B.github)}" rel="noopener">GitHub</a>`);
  if (hasResume) contact.push(`<a href="${base}${esc(staticRel(B.resume))}">Resume</a>`);
  return `<footer class="tb" aria-label="Site footer">
  <div class="wrap">
    <div class="tb-grid">
      <div class="tb-cell tb-name"><p class="lbl">Name</p><p>${esc(B.name)} <span class="tb-c">© ${NOW.getUTCFullYear()}</span></p></div>
      ${B.location ? `<div class="tb-cell"><p class="lbl">Location</p><p>${esc(B.location)}</p></div>` : ""}
      <div class="tb-cell tb-contact"><p class="lbl">Contact</p><p>${contact.join('<span class="sep" aria-hidden="true"> · </span>')}</p></div>
      <div class="tb-cell"><p class="lbl">Revised</p><p class="mono"><time class="nw" datetime="${ISO_DATE}">${ISO_DATE}</time></p></div>
      <div class="tb-cell tb-top"><a href="#top">Back to top<span aria-hidden="true">&nbsp;↑</span></a></div>
    </div>
  </div>
</footer>`;
}

function layout({ title, description, depth, canonical, body, page, image, jsonLd, noindex, rootAbs }) {
  const base = rootAbs ? "/" : up(depth);
  const og = image ? `${SITE_URL}${image}` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(canonical)}">`}
<meta name="author" content="${esc(B.name)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111418" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="${page === "home" ? "profile" : "article"}">
<meta property="og:site_name" content="${esc(B.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${noindex ? "" : `<meta property="og:url" content="${esc(canonical)}">\n`}<meta property="og:locale" content="en_US">
${og ? `<meta property="og:image" content="${esc(og)}">\n` : ""}<meta name="twitter:card" content="${og ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
${og ? `<meta name="twitter:image" content="${esc(og)}">\n` : ""}<link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${base}assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${esc(FONTS_URL)}" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="${esc(FONTS_URL)}"></noscript>
<link rel="stylesheet" href="${base}assets/style.css">
<script>(function(d){d.classList.add("js");try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")d.setAttribute("data-theme",t)}catch(e){}})(document.documentElement)</script>
<script src="${base}assets/site.js" defer></script>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>\n` : ""}</head>
<body id="top">
<a class="skip" href="#main">Skip to content</a>
${header(page === "home" ? "" : rootAbs ? "/" : `${up(depth)}index.html`)}
<main id="main" tabindex="-1">
${body}
</main>
${footer(depth, rootAbs)}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

function sectionHead(id, title, count) {
  return `<div class="sh"><h2 id="${id}-title">${esc(title)}</h2>${count ? `<p class="sh-count">${esc(count)}</p>` : ""}</div>`;
}

function yearSpan(entries) {
  const r = entries.map((e) => e.range).filter(Boolean);
  if (!r.length) return "";
  const a = Math.floor(Math.min(...r.map((x) => x.start)) / 12);
  const b = Math.floor((Math.max(...r.map((x) => x.end)) - 1) / 12);
  return a === b ? `${a}` : `${a}–${b}`;
}

function figureMarkup(f) {
  // "1 of 50": words are set smaller and lighter so the figure reads as a phrase.
  return f
    .split(/(\s+)/)
    .map((t) => (/^[A-Za-z]{2,}$/.test(t) ? `<span class="fig-w">${esc(t)}</span>` : /^\s+$/.test(t) ? " " : esc(t)))
    .join("");
}

function entry(e, { roleSplit = false, groupLabels = false } = {}) {
  const roles = roleSplit ? e.role.split(";").map((r) => r.trim()).filter(Boolean) : [e.role].filter(Boolean);
  let content = "";
  for (const b of e.blocks) {
    if (b.type !== "list" || !groupLabels) { content += renderBlocks([b], { figures: true }); continue; }
    // Bullets that share a "Label: " prefix are grouped under that label.
    const groups = [];
    for (const item of b.items) {
      const m = item.match(/^([A-Z][\w &/-]{1,40}):\s+(.+)$/);
      const key = m ? m[1] : "";
      let g = groups[groups.length - 1];
      if (!g || g.key.toLowerCase() !== key.toLowerCase()) groups.push((g = { key, items: [] }));
      g.items.push(m ? m[2] : item);
    }
    content += groups.map((g) => `${g.key ? `<p class="lbl grp">${esc(g.key)}</p>` : ""}${squareList(g.items, { figures: true })}`).join("");
  }
  const links = e.projects
    .map((p) => `<p class="entry-link"><a href="${pageHref(p)}">Project write-up: ${esc(p.title)}${arrow}</a></p>`)
    .join("");
  // Source order is heading, role, dates and place, then bullets, so someone who jumps
  // by heading hears the dates of this entry, not the next one. From 760px the CSS
  // moves the dates into the left column.
  const meta =
    e.dates || e.location
      ? `<div class="entry-meta">
    ${e.dates ? `<p class="entry-dates">${dateHtml(e.dates)}</p>` : ""}${e.dates && e.location ? '<span class="entry-sep" aria-hidden="true"> · </span>' : ""}${e.location ? `<p class="entry-loc">${esc(e.location)}</p>` : ""}
  </div>`
      : "";
  return `<article class="entry" id="${e.id}" aria-labelledby="${e.id}-h">
  <div class="entry-head">
    <h3 id="${e.id}-h">${esc(e.title)}</h3>
    ${e.degree ? `<p class="entry-role">${esc(e.degree)}</p>` : ""}${roles.length ? `<p class="entry-role">${roles.map((r) => esc(r).replace(/ → /g, "&nbsp;→ ")).join("<br>")}</p>` : ""}
  </div>
  ${meta}
  <div class="entry-body">
    ${content}
    ${links}
  </div>
</article>`;
}

function howItWorks(p, cls = "") {
  const sec = projSection(p, /how it works/i);
  if (!sec) return "";
  const list = sec.blocks.find((b) => b.type === "list");
  if (list && list.items.length >= 2)
    return `<ol class="path${cls}">${list.items.map((t, i) => `<li><span class="pin" aria-hidden="true">${i + 1}</span>${inline(t)}</li>`).join("")}</ol>`;
  return renderBlocks(sec.blocks);
}

function firstResult(p) {
  const sec = projSection(p, /results?/i);
  if (!sec || !sec.blocks.length) return "";
  const b = sec.blocks[0];
  return inline(b.type === "list" ? b.items[0] : b.text, { figures: true });
}

function projectImage(p, depth, cls) {
  if (!staticExists(p.image)) return "";
  return `<img class="${cls}" src="${up(depth)}${esc(staticRel(p.image))}" alt="${esc(p.title)}" width="1600" height="900" loading="lazy" decoding="async">`;
}

function codeDemoRows(p) {
  return [
    ["Code", p.github ? `<a href="${esc(p.github)}" rel="noopener">${esc(shortUrl(p.github))}</a>` : ""],
    ["Demo", p.demo ? `<a href="${esc(p.demo)}" rel="noopener">${esc(shortUrl(p.demo))}</a>` : ""],
  ];
}

function featuredBlock(p) {
  const howTo = howItWorks(p);
  return `<article class="feat" aria-labelledby="feat-title">
  <div class="feat-top">
    <p class="lbl">Featured project</p>
    <p class="feat-kind"><span class="lbl">${esc(kindLabel(p))}</span>${p.org ? `<span class="feat-org">${esc(p.org)}</span>` : ""}</p>
  </div>
  <div class="feat-grid">
    <div class="feat-main">
      ${projectImage(p, 0, "feat-img")}
      <h3 class="feat-title" id="feat-title"><a href="${pageHref(p)}">${esc(p.title)}</a></h3>
      ${p.summary ? `<p class="feat-sum">${inline(p.summary)}</p>` : ""}
      ${howTo ? `<p class="lbl">How it works</p>\n      ${howTo}` : ""}
      <p class="more"><a href="${pageHref(p)}">Read the full write-up${arrow}</a></p>
    </div>
    <div class="feat-side">
      ${specTable([
        ["Role", esc(p.role)],
        ["Organization", esc(p.org)],
        ["Dates", p.date ? `<span class="mono">${esc(p.date)}</span>` : ""],
        ["Topics", joinDots(p.tags)],
        ["Result", firstResult(p)],
        ...codeDemoRows(p),
      ])}
    </div>
  </div>
</article>`;
}

function indexRow(p) {
  // The kind / organization / dates line follows the heading in the source and is
  // lifted above it visually (order: -1), so heading navigation lands before it.
  const mline = [
    `<span class="dot lbl">${esc(kindLabel(p))}</span>`,
    p.org ? `<span class="dot idx-morg">${esc(p.org)}</span>` : "",
    p.date ? `<span class="dot mono">${esc(p.date)}</span>` : "",
  ].filter(Boolean);
  return `<li class="idx-row">
    <div class="idx-proj">
      <h3><a href="${pageHref(p)}">${esc(p.title)}<span class="idx-arrow" aria-hidden="true">&nbsp;→</span></a></h3>
      <p class="idx-mline dots"><span class="dots-in">${mline.join('<span class="sr">, </span>')}</span></p>
      ${p.summary ? `<p class="idx-sum">${inline(p.summary)}</p>` : ""}
      ${p.tags.length ? `<p class="idx-mtopics mono">${joinDots(p.tags)}</p>` : ""}
    </div>
    <div class="idx-org"><p class="lbl">${esc(kindLabel(p))}</p>${p.org ? `<p>${esc(p.org)}</p>` : ""}</div>
    <p class="idx-dates mono">${dateHtml(p.date)}</p>
    <p class="idx-topics mono">${joinDots(p.tags)}</p>
  </li>`;
}

function contactRows(depth) {
  return [
    [
      "Email",
      email
        ? `<span class="em-row"><a href="mailto:${esc(email)}">${esc(email)}</a> <button class="copy" type="button" data-copy="${esc(email)}" hidden>Copy</button></span><span class="sr" id="copy-status" aria-live="polite"></span>`
        : "",
    ],
    ["LinkedIn", B.linkedin ? `<a href="${esc(B.linkedin)}" rel="noopener">${esc(shortUrl(B.linkedin))}</a>` : ""],
    ["GitHub", B.github ? `<a href="${esc(B.github)}" rel="noopener">${esc(shortUrl(B.github))}</a>` : ""],
    ["Resume", hasResume ? `<a class="ilink ilink-sm" href="${up(depth)}${esc(staticRel(B.resume))}">${icon("doc")}<span>Download (PDF)</span></a>` : ""],
  ];
}

function homePage() {
  const nameParts = String(B.name || "").trim().split(/\s+/);
  const nameHtml = nameParts.length > 1
    ? `<span>${esc(nameParts.slice(0, -1).join(" "))}</span> <span>${esc(nameParts[nameParts.length - 1])}</span>`
    : `<span>${esc(B.name)}</span>`;
  const photo = hasPhoto
    ? `<img class="headshot" src="${esc(staticRel(B.photo))}" alt="Portrait of ${esc(B.name)}" width="400" height="500" decoding="async">`
    : "";
  const actions = [
    email ? `<a class="btn" href="mailto:${esc(email)}">Email me</a>` : "",
    B.github ? `<a class="ilink" href="${esc(B.github)}" rel="noopener">${icon("github")}<span>GitHub</span></a>` : "",
    B.linkedin ? `<a class="ilink" href="${esc(B.linkedin)}" rel="noopener">${icon("linkedin")}<span>LinkedIn</span></a>` : "",
    hasResume ? `<a class="ilink" href="${esc(staticRel(B.resume))}">${icon("doc")}<span>Resume (PDF)</span></a>` : "",
  ].filter(Boolean);
  const seeking = B.seeking ? B.seeking.charAt(0).toUpperCase() + B.seeking.slice(1) : "";
  const more = projects.filter((p) => p !== featured);
  const eduEntries = EDU.entries;

  const body = `
<section class="hero" aria-labelledby="name">
  <div class="wrap hero-grid">
    <div class="hero-main">
      <div class="name-row${photo ? " has-photo" : ""}">
        <h1 class="name" id="name">${nameHtml}</h1>
        ${photo}
      </div>
      ${B.headline ? `<p class="headline">${inline(B.headline)}</p>` : ""}
      ${shortBio.length ? `<div class="bio">${renderBlocks(shortBio)}</div>` : ""}
      <div class="actions">${actions.join("\n        ")}</div>
    </div>
    <div class="hero-side">
      ${seeking ? `<div class="seeking"><p class="lbl">Seeking</p><p class="seeking-v">${esc(seeking)}</p></div>` : ""}
      ${specTable(
        [
          ["School", esc(B.school)],
          ["Degree", esc(B.degree)],
          ["Graduation", B.graduation ? `${esc(B.graduation)} (expected)` : ""],
          ["Location", esc(B.location)],
          ["Interests", joinDots(interests)],
        ],
        { caption: "At a glance", cls: "glance" }
      )}
    </div>
  </div>
</section>

${highlights.length ? `<section class="figs-wrap wrap" aria-labelledby="hl-title">
  <h2 class="sr" id="hl-title">Highlights</h2>
  <ul class="figs">
    ${highlights.map((h) => `<li><p class="fig">${figureMarkup(h.figure)}</p><p class="fig-m">${inline(h.meaning)}</p></li>`).join("\n    ")}
  </ul>
</section>` : ""}

${projects.length ? `<section class="section" id="projects" aria-labelledby="projects-title">
  <div class="wrap">
    ${sectionHead("projects", "Projects", plural(projects.length, "project"))}
    ${featuredBlock(featured)}
    ${more.length ? `<div class="idx-wrap">
      <p class="lbl idx-cap" id="more-projects">More projects</p>
      <div class="idx-head" aria-hidden="true"><span class="lbl">Project</span><span class="lbl">Organization</span><span class="lbl">Dates</span><span class="lbl">Topics</span></div>
      <ol class="idx" aria-labelledby="more-projects">
      ${more.map(indexRow).join("\n      ")}
      </ol>
    </div>` : ""}
  </div>
</section>` : ""}

${EXP.entries.length ? `<section class="section" id="experience" aria-labelledby="experience-title">
  <div class="wrap">
    ${sectionHead("experience", EXP.title || "Experience", [plural(EXP.entries.length, "organization"), yearSpan(EXP.entries)].filter(Boolean).join(" · "))}
    ${renderCapture()}
    <div class="entries">
    ${EXP.entries.map((e) => entry(e)).join("\n    ")}
    </div>
  </div>
</section>` : ""}

${eduEntries.length ? `<section class="section" id="education" aria-labelledby="education-title">
  <div class="wrap">
    ${sectionHead("education", EDU.title || "Education", "")}
    <div class="entries">
    ${eduEntries.map((e) => entry(e, { groupLabels: true })).join("\n    ")}
    </div>
  </div>
</section>` : ""}

${skills.length ? `<section class="section" id="skills" aria-labelledby="skills-title">
  <div class="wrap">
    ${sectionHead("skills", "Skills", plural(skills.length, "area"))}
    <table class="spec skills">
      <colgroup><col class="skills-k"><col></colgroup>
      <thead><tr><th scope="col">Area</th><th scope="col">Skills &amp; tools</th></tr></thead>
      <tbody>
      ${skills.map((s) => `<tr><th scope="row">${esc(s.area)}</th><td>${joinDots(s.items)}</td></tr>`).join("\n      ")}
      </tbody>
    </table>
  </div>
</section>` : ""}

${LEAD.entries.length ? `<section class="section" id="leadership" aria-labelledby="leadership-title">
  <div class="wrap">
    ${sectionHead("leadership", LEAD.title || "Leadership & community", [plural(LEAD.entries.length, "organization"), yearSpan(LEAD.entries)].filter(Boolean).join(" · "))}
    <div class="entries">
    ${LEAD.entries.map((e) => entry(e, { roleSplit: true })).join("\n    ")}
    </div>
  </div>
</section>` : ""}

${aboutBio.length ? `<section class="section" id="about" aria-labelledby="about-title">
  <div class="wrap">
    ${sectionHead("about", "About", "")}
    <div class="prose">${renderBlocks(aboutBio)}</div>
  </div>
</section>` : ""}

<section class="section" id="contact" aria-labelledby="contact-title">
  <div class="wrap">
    ${sectionHead("contact", "Contact", "")}
    <div class="contact-grid">
      <div class="contact-text">
        <p class="contact-lede">${B.seeking ? `I'm looking for ${esc(B.seeking)}. ` : ""}The fastest way to reach me is email.</p>
        ${email ? `<a class="btn" href="mailto:${esc(email)}">Email me</a>` : ""}
      </div>
      <div class="contact-side">${specTable(contactRows(0), { cls: "contact-table" })}</div>
    </div>
  </div>
</section>`;

  const headline = plain(B.headline);
  const description = `${B.name}${headline ? `: ${headline}` : ""}${B.seeking ? `, seeking ${plain(B.seeking)}` : ""}.`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: B.name,
    url: SITE_URL,
    description: headline || undefined,
    email: email ? `mailto:${email}` : undefined,
    sameAs: [B.github, B.linkedin].filter(Boolean),
    affiliation: B.school ? { "@type": "CollegeOrUniversity", name: B.school } : undefined,
    address: B.location
      ? (([locality, region]) => ({ "@type": "PostalAddress", addressLocality: locality, addressRegion: region }))(B.location.split(/,\s*/))
      : undefined,
    image: hasPhoto ? `${SITE_URL}${staticRel(B.photo)}` : undefined,
  };
  return layout({
    title: headline ? `${B.name} · ${headline}` : B.name,
    description,
    depth: 0,
    canonical: SITE_URL,
    body,
    page: "home",
    image: hasPhoto ? staticRel(B.photo) : "",
    jsonLd,
  });
}

// ---------------------------------------------------------------------------
// Project pages
// ---------------------------------------------------------------------------

const SECTION_ORDER = [/^problem$/i, /^my role$/i, /^how it works$/i, /^tools?$/i, /^results?$/i];

function writeupSection(p, s) {
  let inner;
  if (/^how it works$/i.test(s.title)) inner = howItWorks(p, " path-page");
  else if (/^results?$/i.test(s.title))
    inner = s.blocks
      .map((b) => (b.type === "list" ? `<ul class="results">${b.items.map((t) => `<li>${inline(t, { figures: true })}</li>`).join("")}</ul>` : `<p>${inline(b.text, { figures: true })}</p>`))
      .join("");
  else inner = renderBlocks(s.blocks);
  return `<section class="wsec" aria-labelledby="w-${slugify(s.title)}">
      <h2 id="w-${slugify(s.title)}">${esc(s.title)}</h2>
      ${inner}
    </section>`;
}

function projectPage(p, i) {
  const ordered = [
    ...SECTION_ORDER.map((re) => p.sections.find((s) => re.test(s.title))).filter(Boolean),
    ...p.sections.filter((s) => !SECTION_ORDER.some((re) => re.test(s.title))),
  ];
  const prev = projects[i - 1], next = projects[i + 1];
  // At either end of the list the empty side is a plain link back to all projects.
  const pagerCell = (q, dir) =>
    q
      ? `<a class="pg-${dir}" href="${q.slug}.html"><span class="lbl">${dir === "prev" ? "Previous project" : "Next project"}</span><span class="pg-t">${dir === "prev" ? larrow : ""}${esc(q.title)}${dir === "next" ? arrow : ""}</span></a>`
      : `<a class="pg-${dir} pg-home" href="../index.html#projects"><span class="pg-t">${dir === "prev" ? larrow : ""}All projects${dir === "next" ? arrow : ""}</span></a>`;
  const actions = [
    p.github ? `<a class="btn" href="${esc(p.github)}" rel="noopener">${icon("github")}<span>View code</span></a>` : "",
    p.demo ? `<a class="btn btn-2" href="${esc(p.demo)}" rel="noopener">Live demo</a>` : "",
  ].filter(Boolean);
  const img = projectImage(p, 1, "pfig-img");

  const body = `
<article class="project" aria-labelledby="p-title">
  <div class="wrap">
    <div class="ph-top">
      <a class="back" href="../index.html#projects">${larrow}All projects</a>
      <p class="mono ph-count">Project ${i + 1} of ${projects.length}</p>
    </div>
    <header class="ph">
      <p class="ph-kind"><span class="lbl">${esc(kindLabel(p))}</span>${p.date ? `<span class="sep" aria-hidden="true">·</span><span class="mono"><span class="sr">, </span>${esc(p.date)}</span>` : ""}</p>
      <h1 id="p-title">${esc(p.title)}</h1>
      ${p.summary ? `<p class="lede">${inline(p.summary)}</p>` : ""}
      ${actions.length ? `<div class="actions">${actions.join("")}</div>` : ""}
    </header>
    <div class="pbody">
      <aside class="paside" aria-label="Project information">
        ${specTable(
          [
            ["Role", esc(p.role)],
            ["Organization", esc(p.org)],
            ["Dates", p.date ? `<span class="mono">${esc(p.date)}</span>` : ""],
            ["Type", esc(p.kind)],
            ["Topics", joinDots(p.tags)],
            ["Related experience", p.parent ? `<a href="../index.html#${p.parent.id}">${esc(p.parent.title)}</a>` : ""],
            ...codeDemoRows(p),
          ],
          { caption: "Project information" }
        )}
      </aside>
      <div class="pmain">
        ${img ? `<figure class="pfig">${img}<figcaption>${esc(p.title)}</figcaption></figure>` : ""}
        ${ordered.map((s) => writeupSection(p, s)).join("\n        ")}
      </div>
    </div>
    <nav class="pager" aria-label="More projects">
      ${pagerCell(prev, "prev")}
      ${pagerCell(next, "next")}
    </nav>
  </div>
</article>`;
  return layout({
    title: `${p.title} · ${B.name}`,
    description: plain(p.summary) || `${p.title}, a project by ${B.name}.`,
    depth: 1,
    canonical: `${SITE_URL}projects/${p.slug}.html`,
    body,
    page: p.slug,
    image: staticExists(p.image) ? staticRel(p.image) : hasPhoto ? staticRel(B.photo) : "",
  });
}

function notFoundPage() {
  const body = `
<section class="nf">
  <div class="wrap">
    <div class="sh"><h1 class="nf-h">Page not found</h1><p class="sh-count">404</p></div>
    <p class="lede">There is no page at this address.</p>
    <ul class="sq nf-list">
      <li><a href="/">Home</a></li>
      ${projects.map((p) => `<li><a href="/projects/${p.slug}.html">${esc(p.title)}</a></li>`).join("\n      ")}
    </ul>
  </div>
</section>`;
  return layout({
    title: `Page not found · ${B.name}`,
    description: `This page doesn't exist. ${B.name}'s portfolio is at ${SITE_URL}`,
    depth: 0,
    body,
    page: "404",
    noindex: true,
    rootAbs: true,
  });
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

function copyDir(src, dest) {
  if (!exists(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(src, { withFileTypes: true })) {
    if (f.name.startsWith(".")) continue; // .gitkeep, .DS_Store
    const s = path.join(src, f.name), d = path.join(dest, f.name);
    f.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

// dist/ is deleted before every build, so refuse an OUT_DIR that would take the
// repository, its sources, the home folder or a filesystem root with it.
function checkOutDir() {
  const inside = (child, parent) => {
    const rel = path.relative(parent, child);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };
  const home = require("os").homedir();
  if (DIST === path.parse(DIST).root || (home && path.resolve(home) === DIST))
    fail(`Refusing to build into ${DIST}: it would be deleted first. Pick an empty folder such as dist/.`);
  for (const p of [ROOT, CONTENT, STATIC, ASSETS]) {
    if (inside(p, DIST)) fail(`Refusing to build into ${DIST}: deleting it would delete ${p}. Pick a folder such as dist/.`);
    if (p !== ROOT && inside(DIST, p)) fail(`Refusing to build into ${DIST}: it is inside the source folder ${p}. Pick a folder such as dist/.`);
  }
}

// Every page references these files. Missing ones (e.g. never committed) stop the build.
const REQUIRED_ASSETS = ["style.css", "site.js", "favicon.svg", "apple-touch-icon.png"];

function build() {
  checkOutDir();
  const missing = REQUIRED_ASSETS.filter((f) => !exists(path.join(ASSETS, f)));
  if (missing.length) fail(`Missing ${missing.map((f) => "assets/" + f).join(", ")}. Every page links to ${missing.length === 1 ? "it" : "them"}.`);
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, "projects"), { recursive: true });
  copyDir(ASSETS, path.join(DIST, "assets"));
  copyDir(STATIC, DIST);
  // No page ever shows a phone number, even when the résumé PDF carries one.
  const writePage = (rel, html) => {
    if (PHONE_TEXT_RE.test(html)) fail(`dist/${rel} would contain what looks like a phone number. Remove it from content/.`);
    fs.writeFileSync(path.join(DIST, rel), html);
  };
  writePage("index.html", homePage());
  projects.forEach((p, i) => writePage(`projects/${p.slug}.html`, projectPage(p, i)));
  writePage("404.html", notFoundPage());
  const urls = [SITE_URL, ...projects.map((p) => `${SITE_URL}projects/${p.slug}.html`)];
  fs.writeFileSync(
    path.join(DIST, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${esc(u)}</loc></url>`) // no <lastmod>: the build date isn't when a page changed
      .join("\n")}\n</urlset>\n`
  );
  fs.writeFileSync(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);
  fs.writeFileSync(path.join(DIST, ".nojekyll"), "");
  console.log(
    `Built index, ${projects.length} project pages and 404 into ${DIST.startsWith(ROOT) ? path.relative(ROOT, DIST) || "." : DIST}/` +
      `${hasPhoto ? " (with headshot)" : ""}${hasResume ? " (with resume PDF)" : ""}`
  );
}

if (require.main === module) build();
module.exports = { parseRange, parsePoint, splitOutside, parseFrontMatter, parseBody, inline, FIG_RE, fmtMonth };
