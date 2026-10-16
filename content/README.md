# Site content

Every fact on the site comes from the files in this folder. Edit them and run `node build.js`; you
never need to change the code. Only put things here that are true and that you're happy to publish.

## bio.md

Front matter, then two sections.

```
---
name: "Ryan Banerjee"
headline: "Computer Engineering student at UC Santa Barbara"
school: "University of California, Santa Barbara"
degree: "B.S. in Computer Engineering"
graduation: "June 2030"
location: "Dublin, CA"
seeking: "internships in embedded systems, computer architecture and hardware engineering"
interests: ["Embedded systems", "VLSI design", "Computer architecture"]
email: "..."
github: "https://github.com/..."
linkedin: "https://www.linkedin.com/in/..."
resume: "/resume.pdf"            # shown only if static/resume.pdf exists
photo: "/images/headshot.jpg"    # shown only if static/images/headshot.jpg exists
---

## Short bio
One paragraph for the hero.

## About
A few paragraphs for the About section.
```

- `seeking` appears in the hero and the Contact section. Write it in lowercase, so it reads naturally after "I'm looking for".
- `interests` becomes the "Interests" row of the At a glance table.
- Leave a field empty (`""`) to hide it. Never add a phone number.

## highlights.md

The four key figures under the hero. One line each: the figure in bold, a `|`, then what it means.

```
- **84%+** | accuracy of the diabetes-detection model I built as an AWS machine-learning intern
```

Short figures work best (`84%+`, `$10K+`, `2024`, `1 of 50`).

## experience.md, leadership.md, education.md

The `# Title` line becomes the section heading (for example "Leadership & community"). Each entry is
a `## Organization` heading, then `key: value` lines, then bullets.

```
## Amazon Web Services (AWS)
role: Student Intern, Machine Learning
dates: Mar 2025 – Apr 2026
location: Remote

- Built a machine-learning model that detects diabetes with 84%+ accuracy using SageMaker, S3 and EC2
```

- **dates** also draw the entry's row in the activity capture. Accepted forms: `Sep 2022 – June 2026`,
  `July – Aug 2025`, `July 2026`, `Sept 2024 – Present`, `Jan-Mar 2024`, `2023 – 2024`. Full or short
  month names work, as do en dashes, em dashes and hyphens. `Present` or `Now` means the entry is still
  running, which adds an "As of <month>" cursor at the build date. Dates starting with "Expected"
  (education) are shown but not drawn. The build warns about any date it can't read.
- **role** in leadership.md can list two roles separated by `;`. Each goes on its own line.
- **degree** is used in education.md.
- In bullets, figures like `$15M+`, `13,000+`, `84%+` and `1 of 10` are set in bold automatically.
- In education.md, bullets that start with the same label (`Current coursework: ...`) are grouped under
  that label.
- An entry whose dates exactly match a project's dates gets a "Project write-up" link, and the project
  page links back to it.

## skills.md

One line per area: the area in bold with a colon, then a comma-separated list. Commas inside parentheses
don't split items, so `AWS (SageMaker, S3, EC2)` stays one item.

```
- **Languages:** C++, Python, Shell scripting
```

## projects/NN-name.md

One file per project. The number sets the display order and the rest of the filename becomes the page
URL (`projects/theft-deterrent-security-system.html`).

```
---
title: "Theft-Deterrent Security System"
summary: "One or two sentences, used on cards and as the page description."
tags: ["Raspberry Pi", "OpenCV", "Arduino"]
type: "Team project · Wharton Management & Technology Summer Institute, UPenn"
date: "July – Aug 2025"
role: "Team lead (team of 5)"
featured: "true"     # one project gets the lead slot on the home page
github: ""           # the "View code" link appears only when this is filled in
demo: ""             # same for "Live demo"
image: "/images/projects/theft-deterrent-security-system.jpg"
---

## Problem
## My role
## How it works
## Tools
## Results
```

- `type` is split on ` · `: the part before is the kind (Team project, Internship, Concept), and the part
  after is the organization.
- Sections appear in the order Problem, My role, How it works, Tools, Results, then any others in file
  order. Leave out any section you don't have.
- A "How it works" list of two or more bullets is drawn as numbered steps. A paragraph stays a paragraph.
- The first Results bullet also appears in the featured project's spec table.
- A project whose dates exactly match an experience or leadership entry is drawn as part of that entry's
  row in the activity capture. Every other project gets its own row.

### Adding a project

1. Copy an existing file to `projects/05-your-project.md` and fill it in.
2. Optional: add a photo at `static/images/projects/your-project.jpg` (16:9, about 1600×900 px) and set
   `image` to `/images/projects/your-project.jpg`.
3. Run `node build.js`. The project appears in "More projects", gets its own page and joins the sitemap.

## Photos and résumé

- Headshot: `static/images/headshot.jpg` (4:5, about 800×1000 px).
- Project images: `static/images/projects/<slug>.jpg` (16:9, about 1600×900 px).
- Résumé: `static/resume.pdf`. Everything in `static/` is published as-is.

None of these are required. The site looks complete without them, and each one appears automatically
once its file exists.
