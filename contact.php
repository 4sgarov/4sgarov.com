<?php require __DIR__ . '/inc/site.php'; $S = site(); ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<?php seo_head('contact'); ?>
<link rel="stylesheet" href="css/style.css?v=202609121654">
</head>
<body class="contact-page">

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

<section class="contact">
  <h1 class="contact-title">Contact me</h1>

<?php $trips = array_values(array_filter((array)($S['booking']['locations'] ?? []), fn($l) => !empty($l['from'])));
      $showGuest = !empty($S['contact']['guestSpotEnabled']) && $trips; ?>
  <div class="guest" id="guest"<?= $showGuest ? '' : ' hidden' ?>>
    <h2 class="guest-title">Guest Spot</h2>
    <ul class="guest-list">
<?php foreach ($trips as $l): ?>
      <li><span class="g-flag"><?= flag($l['code']) ?></span><span class="g-place"><?= e($l['country'] . ' — ' . $l['city']) ?></span><span class="g-dates"><?= e(fmt_day($l['from']) . (!empty($l['to']) ? ' – ' . fmt_day($l['to']) : '')) ?></span></li>
<?php endforeach; ?>
    </ul>
  </div>

  <ul class="socials">
<?php foreach ((array)($S['contact']['socials'] ?? []) as $so): if (empty($so['url'])) continue; ?>
    <li><a href="<?= e($so['url']) ?>" target="_blank" rel="noopener"><span class="s-text"><span class="s-label"><?= e($so['label'] ?? $so['url']) ?></span><span class="s-handle"><?= e($so['handle'] ?? '') ?></span></span></a></li>
<?php endforeach; ?>
  </ul>

  <div class="map" id="map"></div>
</section>

<script src="js/menu.js?v=202609121654"></script>
<script src="js/site.js?v=202609121654"></script>
</body>
</html>
