# Ryan Banerjee: portfolio

A static portfolio site, built from the Markdown files in `content/` and deployed to GitHub Pages at
<https://ryanban1.github.io/>.

The look borrows from a component datasheet: white paper, black ink, heavy section rules, condensed-caps
spec tables and one highlighter yellow. The Experience section opens with an **activity capture**, a
logic-analyzer-style timing diagram that `build.js` draws to scale from the dates in `experience.md`,
`leadership.md` and the project files. Dark mode looks like an oscilloscope screen.

## Edit content

Everything on the site comes from `content/`. To change a fact, edit the Markdown and rebuild; there's no
need to touch the code. `content/README.md` lists every file and its format.

- `content/bio.md`: name, headline, school, contact links, short bio and About text
- `content/highlights.md`: the four key figures under the hero
- `content/experience.md`, `content/leadership.md`, `content/education.md`: entries with `key: value` lines and bullets
- `content/skills.md`: the skills table
- `content/projects/NN-name.md`: one file per project. Filename order sets the display order, and `featured: "true"` puts a project in the lead slot.

## Photos and the résumé PDF

Files in `static/` are copied to the site root. Nothing appears until the file exists, so there are no
placeholder boxes.

| File | Where it shows |
| --- | --- |
| `static/images/headshot.jpg` | Next to the name in the hero (cropped to 4:5; about 800×1000 px works well) |
| `static/images/projects/<slug>.jpg` | The featured project block and that project's page (cropped to 16:9; about 1600×900 px) |
| `static/resume.pdf` | "Resume (PDF)" links in the hero, Contact table and footer |

`<slug>` is the project filename without its number, e.g. `theft-deterrent-security-system`.

Everything in `static/` is public once the site deploys, including whatever is printed on the resume PDF.

## Preview locally

```
node build.js
python3 -m http.server -d dist     # then open http://localhost:8000
```

You can also open `dist/index.html` directly in a browser. Only `404.html` needs a server, because GitHub
Pages serves it at any depth and its links start at the site root.

`node build.js` warns about any date it can't read. Those entries still appear on the page but are left
out of the activity capture.

Optional environment variables (for testing):

- `BUILD_DATE=2026-10-15` pins the "Revised" date in the footer. It defaults to the day of the build.
- `SITE_URL=https://example.com/` changes the canonical and Open Graph URLs.
- `CONTENT_DIR`, `STATIC_DIR`, `OUT_DIR` build from or into other folders.

## What the build produces

`dist/` contains `index.html`, one page per project in `projects/`, `404.html`, `sitemap.xml`,
`robots.txt`, the assets and a copy of `static/`. Each page gets its own title, description, canonical URL
and Open Graph and Twitter tags. The home page also gets JSON-LD `Person` data that uses only facts from
`bio.md`.

The site works with JavaScript turned off. `assets/site.js` only adds the theme toggle, the "Copy" email
button and the one-time sweep animation on the activity capture, which is skipped for anyone who prefers
reduced motion.

## Publish on GitHub Pages

1. The repository is named `ryanban1.github.io`, so the site is served from the domain root.
2. Push to the `main` branch.
3. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

Every push to `main` rebuilds and redeploys the site through `.github/workflows/deploy.yml`.
