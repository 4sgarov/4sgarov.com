<?php require __DIR__ . '/inc/site.php'; $S = site(); ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<?php seo_head('portfolio'); ?>
<link rel="stylesheet" href="css/style.css?v=202609121640">
</head>
<body class="portfolio-page">

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

<section class="portfolio-hero">
  <h1 class="portfolio-title">
    <span>TATTOO</span>
    <span>PORTFOLIO</span>
  </h1>
</section>

<section class="works">
<?php $cats = []; foreach ((array)($S['portfolio']['categories'] ?? []) as $c) $cats[$c['id']] = $c['name']; ?>
  <div class="filters">
    <button class="filter is-active" data-filter="all">All</button>
<?php foreach ($cats as $id => $name): ?>
    <button class="filter" data-filter="<?= e($id) ?>"><?= e($name) ?></button>
<?php endforeach; ?>
  </div>
  <div class="grid">
<?php foreach ((array)($S['portfolio']['works'] ?? []) as $w): $tag = !empty($w['link']) ? 'a' : 'div'; ?>
    <<?= $tag ?> class="card" data-genre="<?= e($w['category'] ?? '') ?>"<?= !empty($w['link']) ? ' href="' . e($w['link']) . '" target="_blank" rel="noopener"' : '' ?>>
      <div class="card-img"><?php if (!empty($w['image'])): ?><img src="<?= e($w['image']) ?>" alt="<?= e($w['title'] ?? '') ?> — tattoo by Rauf Asgarov" loading="lazy"><?php endif; ?></div>
      <div class="card-body"><h3 class="card-title"><?= e($w['title'] ?? '') ?></h3><p class="card-genre"><?= e($cats[$w['category'] ?? ''] ?? '') ?></p></div>
    </<?= $tag ?>>
<?php endforeach; ?>
  </div>
</section>

<script src="js/menu.js?v=202609121640"></script>
<script src="js/site.js?v=202609121640"></script>
</body>
</html>
