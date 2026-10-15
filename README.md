# Portfolio site

A static portfolio built from the Markdown files in `content/`, deployed to GitHub Pages.

## Edit content

- `content/bio.md`: name, headline, links, short bio and about paragraph
- `content/experience.md`, `content/skills.md`
- `content/projects/NN-name.md`: one file per project, shown in filename order

Anything in `[square brackets]` is placeholder text and shows up highlighted on the site until you replace it.

Put images and your resume in `static/` (for example `static/resume.pdf`, `static/images/headshot.jpg`,
`static/images/projects/01-embedded-project.jpg`). The paths in the content files point there, and the
resume button appears automatically once `static/resume.pdf` exists.

## Preview locally

```
node build.js
npx serve dist        # or: python3 -m http.server -d dist
```

## Publish on GitHub Pages

1. Create a GitHub repository. Name it `<your-username>.github.io` to get the site at `https://<your-username>.github.io/`.
2. Push this folder to the `main` branch.
3. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

Every push to `main` rebuilds and redeploys the site.
