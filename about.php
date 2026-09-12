<?php require __DIR__ . '/inc/site.php'; $S = site(); ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<?php seo_head('about'); ?>
<link rel="stylesheet" href="css/style.css?v=202609121654">
</head>
<body class="about-page">

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

<section class="hero" aria-hidden="true"></section>

<section class="about">
  <div class="about-head">
    <h1 class="about-name"><?= e($S['about']['name'] ?? '') ?></h1>
    <p class="about-role"><?= e($S['about']['role'] ?? '') ?></p>
  </div>
  <div class="about-cols">
<?php foreach (array_slice((array)($S['about']['columns'] ?? []), 0, 2) as $c): ?>
    <div class="about-col">
      <h2 class="about-heading"><?= e($c['heading'] ?? '') ?></h2>
      <p class="about-text"><?= e($c['text'] ?? '') ?></p>
    </div>
<?php endforeach; ?>
  </div>
</section>

<script src="js/menu.js?v=202609121654"></script>
<script src="js/site.js?v=202609121654"></script>
</body>
</html>
