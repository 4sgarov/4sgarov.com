# 4sgarov.com — Portfolio

Site for Rauf Asgarov, tattoo artist. Static HTML/CSS/JS front end with a
small PHP admin API — runs on any PHP hosting (built for Hostinger).

## Structure

```
index.html            Home: left nav + optional full-screen cover
about.html            About: full-screen hero, name, two text columns
portfolio.html        Portfolio: title, category filters, works grid (slideshow on phones)
admin/                Admin panel (password login, works on phone + desktop)
api/                  PHP endpoints used by the admin
  auth.php            setup / login / logout / change password
  site.php            read / save content
  upload.php          chunked media upload (no hosting size limit)
  media.php           delete media
data/site.default.json  Starting content (copied to data/site.json on first run)
data/site.json        Live content — created on the server, not in git
data/auth.json        Password hash — created on the server, not in git
assets/uploads/       Media uploaded from the admin — not in git
assets/fonts/         Author (variable) — self-hosted
css/style.css         Site styles          admin/admin.css   Admin styles
js/site.js            Renders content       admin/admin.js    Admin logic
js/menu.js            Hamburger menu
```

## Deploy to Hostinger

1. hPanel → Websites → your site → **Files → File Manager** (or FTP) and put
   everything from this repo into `public_html/` — or use hPanel's
   **Advanced → Git** to deploy this repository into `public_html`.
2. Make sure PHP is 8.0+ (hPanel → Advanced → PHP Configuration).
3. Open `https://4sgarov.com/admin/` — the first visit asks you to create the
   admin password. That's it.

The server creates `data/site.json`, `data/auth.json` and writes uploads to
`assets/uploads/`. Redeploying the code never touches those files.

## Admin panel

- **Home** — desktop + mobile cover (image / GIF / MP4; video autoplays muted)
- **About me** — desktop + mobile hero, name, role, two text columns
- **Portfolio** — categories (add / rename / reorder / delete) and works
  (multi-upload, name, category, link, reorder, replace image, delete)
- **Settings** — change password

Uploads go in 4 MB chunks, so PHP `upload_max_filesize` limits don't apply;
large images are downscaled in the browser before upload. Five wrong
passwords lock login for 15 minutes.

## Run locally

Needs PHP: `php -S localhost:8000` in the repo root, then open
`http://localhost:8000`. Without PHP the pages still render from
`data/site.default.json`, but the admin won't work.
