# 4sgarov.com — Portfolio

Static site for Rauf Asgarov, tattoo artist. Plain HTML/CSS/JS, hosted on
GitHub Pages — no build step.

## Structure

```
index.html        Home: left nav + optional full-screen cover
about.html        About: full-screen hero, name, two text columns
portfolio.html    Portfolio: title, category filters, works grid (slideshow on phones)
admin/            Admin panel (edits content via the GitHub API)
data/site.json    All editable content (covers, about text, categories, works)
assets/uploads/   Media uploaded from the admin panel
assets/fonts/     Author (variable) — self-hosted
css/style.css     Site styles      admin/admin.css   Admin styles
js/site.js        Renders site.json into the pages
js/menu.js        Hamburger menu   admin/admin.js    Admin logic
```

## Run locally

```bash
python3 -m http.server 8000
```

then visit `http://localhost:8000`. (Pages fetch `data/site.json`, so open
via a server, not `file://`.)

## Admin panel

Open `/admin/` on the live site (works on phone and desktop). Sign in with a
GitHub fine-grained personal access token that has **Contents: Read and
write** on this repository only. The panel:

- uploads media to `assets/uploads/` (large images are downscaled in the
  browser; videos are uploaded as-is — keep them under ~40 MB),
- edits `data/site.json`,
- commits straight to `main`. GitHub Pages redeploys in about a minute.

Nothing else runs server-side; the token is stored only in the browser.

## Publish with GitHub Pages

Repo → **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main` / `root`.
