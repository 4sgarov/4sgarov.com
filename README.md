# 4sgarov.com — Portfolio

Minimal single-screen personal site. Plain HTML and CSS — no build step, no
JavaScript.

## Structure

```
index.html      Page markup: left sidebar nav + blank content area
css/style.css   Layout and colors
```

## Run locally

Just open `index.html` in a browser, or:

```bash
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Editing content

- Name and menu items — `index.html`
- Colors and spacing — the `:root` variables at the top of `css/style.css`

## Publish with GitHub Pages

Repo → **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main` / `root`.
