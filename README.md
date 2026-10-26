# Amir-Shokat.github.io

Personal website of Amirmahdi Shokatabadi, served by GitHub Pages at <https://amir-shokat.github.io>.
GitHub builds it with Jekyll on every push; there is nothing to install.

| File | Page |
|---|---|
| `index.html` | Home |
| `cv.html` | CV (the "Print or save as PDF" button gives a clean printout) |
| `projects.html` | Projects |
| `research.html` | Research |
| `interests.html` | Interests & posts |
| `_projects/` | One page per project, with its demo script named in `demo:` |
| `_posts/` | Blog posts, one Markdown file each. See [POSTING.md](POSTING.md) |
| `_layouts/` | Shared header and footer (`default.html`) and the post template (`post.html`) |
| `_config.yml` | Name, tagline, email and social links used across the site |
| `assets/` | Stylesheet, scripts, demo data, images, and the original thesis PDF (`assets/papers/`) |
| `_tools/` | Scripts that rebuild the demo data in `assets/data/` (not published) |

To change your email, LinkedIn or tagline everywhere at once, edit `_config.yml`.

A project shows up on the home page under *Selected projects* when its front matter has
`featured: true` and a one-line `short:` description. Its `tags:` (separated by spaces) decide
which filters on the Projects page it appears under: `risk`, `research`, `trading`, `data`.
