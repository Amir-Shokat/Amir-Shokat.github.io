# Amir-Shokat.github.io

Personal website of Amirmahdi Shokatabadi, served by GitHub Pages at <https://amir-shokat.github.io>.
GitHub builds it with Jekyll on every push; there is nothing to install.

| File | Page |
|---|---|
| `index.html` | Home |
| `cv.html` | CV (the "Print or save as PDF" button gives a clean printout) |
| `projects.html` | Projects |
| `research.html` | Research (thesis, short version of the research ideas, academic CV download) |
| `research-ideas.html` | Research ideas in full, at `/research/ideas/` |
| `interests.html` | Interests & posts |
| `_projects/` | One page per project, with its demo script named in `demo:` |
| `_posts/` | Blog posts, one Markdown file each. See [POSTING.md](POSTING.md) |
| `_layouts/` | Shared header and footer (`default.html`) and the post template (`post.html`) |
| `_config.yml` | Name, tagline, email and social links used across the site |
| `assets/` | Stylesheet, scripts, demo data, images, and the PDFs in `assets/papers/` (original thesis, academic CV) |
| `_tools/` | Scripts that rebuild the demo data in `assets/data/` (not published) |

To change your email, LinkedIn or tagline everywhere at once, edit `_config.yml`.

To update the academic CV, replace `assets/papers/amirmahdi-shokatabadi-academic-cv.pdf` with the new
PDF under the same name.

A project's `tags:` (separated by spaces) decide which filters on the Projects page it appears under:
`risk`, `research`, `trading`, `data`.

## Fund-market dashboard data

The dashboard at `/projects/fund-market/` reads `assets/data/market/`, built from a local data store
(`../market-data`, not in git) that the [tehran-market-data](https://github.com/Amir-Shokat/tehran-market-data)
clients keep up to date. To refresh it and publish:

```bash
_tools/update_market.sh
```

Run it **without a VPN**: FIPIRAN only answers Iranian internet addresses. The first run collects the
last two weeks; after that, run it about once a week and it adds the days since the last run.
