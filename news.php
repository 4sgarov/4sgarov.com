<?php require __DIR__ . '/inc/site.php'; $S = site(); ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<?php $post = null; $pid = $_GET['id'] ?? ''; foreach ((array)($S['news']['posts'] ?? []) as $pp) if (($pp['id'] ?? '') === $pid) { $post = $pp; break; }
$lang = (($_GET['lang'] ?? '') === 'az' && $post && !empty($post['text_az'])) ? 'az' : 'en';
seo_head('news', $post ? ['post' => $post, 'lang' => $lang] : []); ?>
<link rel="stylesheet" href="css/style.css?v=202609121648">
</head>
<body class="news-page">

<button class="menu-btn" aria-label="Open menu" aria-expanded="false">
  <span></span><span></span><span></span>
</button>

<nav class="drawer">
  <a href="about.html" class="nav-link">About me</a>
  <a href="portfolio.html" class="nav-link">Portfolio</a>
  <a href="book.html" class="nav-link">Book now</a>
  <a href="academy.html" class="nav-link">Academy</a>
  <a href="news.html" class="nav-link">News</a>
  <a href="contact.html" class="nav-link">Contact</a>
</nav>

<section class="news" id="news-list">
  <h1 class="news-title">News</h1>
<?php $ncats = []; foreach ((array)($S['news']['categories'] ?? []) as $c) $ncats[$c['id']] = $c['name'];
      $posts = (array)($S['news']['posts'] ?? []);
      $featured = null; foreach ($posts as $pp) if (!empty($pp['featured'])) { $featured = $pp; break; }
      if (!$featured && $posts) $featured = $posts[0];
      $cover = fn($pp) => img_src(($pp['images'] ?? [])[0] ?? ''); ?>
  <a class="featured" id="featured" href="news.html?id=<?= e($featured['id'] ?? '') ?>"<?= $featured ? '' : ' hidden' ?>>
    <div class="featured-img"><?php if ($featured && $cover($featured)): ?><img src="<?= e($cover($featured)) ?>" alt="<?= e($featured['title']) ?>"><?php endif; ?></div>
    <div class="featured-body">
      <h2 class="featured-title"><?= e($featured['title'] ?? '') ?></h2>
      <div class="meta-row"><span class="n-cat"><?= e($ncats[$featured['category'] ?? ''] ?? '') ?></span><span class="n-date"><?= e($featured ? fmt_long($featured['date'] ?? '') : '') ?></span></div>
    </div>
    <span class="views"></span>
  </a>
  <div class="news-cards" id="news-cards">
<?php foreach ($posts as $pp): if ($pp === $featured) continue; ?>
    <a class="news-card" href="news.html?id=<?= e($pp['id']) ?>">
      <div class="card-thumb"><?php if ($cover($pp)): ?><img src="<?= e($cover($pp)) ?>" alt="<?= e($pp['title']) ?>" loading="lazy"><?php endif; ?></div>
      <div class="card-info"><h3 class="card-head"><?= e($pp['title']) ?></h3><div class="meta-row"><span class="n-cat"><?= e($ncats[$pp['category'] ?? ''] ?? '') ?></span><span class="n-date"><?= e(fmt_long($pp['date'] ?? '')) ?></span></div></div>
      <span class="views"></span>
    </a>
<?php endforeach; ?>
  </div>
  <p class="news-empty" id="news-empty"<?= $posts ? ' hidden' : '' ?>>No news yet.</p>
</section>

<div class="post-modal" id="post-modal" hidden>
  <div class="post-backdrop"></div>
  <article class="post" role="dialog" aria-modal="true">
    <button type="button" class="post-close" aria-label="Close">×</button>
    <div class="post-meta"><span class="n-cat"></span><span class="n-date"></span><a class="n-link" target="_blank" rel="noopener" hidden></a>
      <span class="lang-toggle" hidden><button type="button" data-lang="en" class="is-on">EN</button><button type="button" data-lang="az">AZ</button></span>
    </div>
    <div class="post-cover"></div>
    <h1 class="post-title"></h1>
    <div class="post-text"></div>
    <div class="post-gallery"></div>
    <div class="post-foot"><span class="views"></span></div>
  </article>
</div>

<script src="js/menu.js?v=202609121648"></script>
<script src="js/site.js?v=202609121648"></script>
</body>
</html>
