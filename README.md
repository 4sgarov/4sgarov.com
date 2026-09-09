# 4sgarov.com — Portfolio

Animasiyalı, dark-mode şəxsi portfolio saytı. Xalis HTML, CSS və JavaScript
ilə yazılıb — heç bir build addımı tələb olunmur.

## Struktur

```
index.html      Səhifənin əsas strukturu
css/style.css   Dizayn və animasiyalar
js/script.js    Scroll reveal, typewriter, counter, navbar davranışı
```

## Lokal işlətmək

`index.html` faylını brauzerdə açmaq kifayətdir, və ya:

```bash
python3 -m http.server 8000
```

sonra `http://localhost:8000` ünvanına daxil olun.

## Məzmunu redaktə etmək

- Ad, haqqında mətni, bacarıqlar və layihələr — `index.html`
- Email və sosial linklər — `index.html` içində `mailto:` və `github.com/...` linkləri
- Rənglər — `css/style.css` faylının başındakı `:root` dəyişənləri

## GitHub Pages ilə yayımlamaq

Repo → **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main` / `root`.
