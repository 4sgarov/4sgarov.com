<?php
/* Server-side helpers: load content and render it into the pages so search
   engines (and social previews) see real text without running JavaScript.
   js/site.js re-renders the same content on the client for interactivity. */
declare(strict_types=1);

define('SITE_ROOT', dirname(__DIR__));
define('SITE_URL', 'https://4sgarov.com');

function site(): array {
  static $s = null;
  if ($s !== null) return $s;
  $read = function (string $f) { $j = is_file($f) ? json_decode((string)file_get_contents($f), true) : null; return is_array($j) ? $j : []; };
  $s = $read(SITE_ROOT . '/data/site.json');
  foreach ($read(SITE_ROOT . '/data/site.default.json') as $k => $v) if (!isset($s[$k])) $s[$k] = $v;
  return $s;
}
function e($v): string { return htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function flag(string $code): string {
  $out = '';
  foreach (str_split(strtoupper($code)) as $ch) $out .= mb_chr(0x1F1E6 + ord($ch) - 65, 'UTF-8');
  return $out;
}
function fmt_day(string $d): string { return $d ? date('j M', strtotime($d)) : ''; }
function fmt_long(string $d): string { return $d ? date('j F Y', strtotime($d)) : ''; }
function img_src($im): string { return is_array($im) ? (string)($im['src'] ?? '') : (string)$im; }

/* Plain text → paragraphs / bullet lists (same rules as richText in site.js) */
function rich(string $text): string {
  $html = ''; $inList = false;
  foreach (explode("\n", $text) as $line) {
    $t = trim($line);
    if ($t === '') { if ($inList) { $html .= '</ul>'; $inList = false; } continue; }
    if (preg_match('/^[•\-–*]\s*(.+)$/u', $t, $m)) {
      if (!$inList) { $html .= '<ul>'; $inList = true; }
      $html .= '<li>' . e($m[1]) . '</li>';
    } else {
      if ($inList) { $html .= '</ul>'; $inList = false; }
      $html .= '<p>' . e($t) . '</p>';
    }
  }
  if ($inList) $html .= '</ul>';
  return $html;
}

/* <head> tags: title, description, canonical, Open Graph, favicon, schema */
function seo_head(string $page, array $o = []): void {
  $S = site();
  $meta = [
    'index'     => ['Rauf Asgarov — Tattoo Artist in Baku', 'Rauf Asgarov — professional tattoo artist based in Baku, Azerbaijan. Realism, black & grey, fine line and cover up. Portfolio, booking, academy.', ''],
    'about'     => ['About Rauf Asgarov — Tattoo Artist, Baku', 'About Rauf Asgarov — tattoo artist based in Baku, Azerbaijan: signature style, recognition and mentorship.', 'about.html'],
    'portfolio' => ['Tattoo Portfolio — Rauf Asgarov, Baku', 'Tattoo portfolio of Rauf Asgarov — realism, black & grey, fine line, cover up, lettering. Baku, Azerbaijan.', 'portfolio.html'],
    'book'      => ['Book a Tattoo — Rauf Asgarov', 'Book a tattoo session or seminar with Rauf Asgarov: choose a city and date, describe your idea.', 'book.html'],
    'academy'   => ['Tattoo Academy — Rauf Asgarov', 'Tattoo academy by Rauf Asgarov: social media for artists, online seminars, private mentorship.', 'academy.html'],
    'news'      => ['News — Rauf Asgarov', 'News from Rauf Asgarov — guest spots, academy, new work and tattoo tips.', 'news.html'],
    'contact'   => ['Contact — Rauf Asgarov, Tattoo Artist in Baku', 'Contact Rauf Asgarov — guest spots, Instagram, WhatsApp and studio location in Baku.', 'contact.html'],
  ][$page];
  [$title, $desc, $path] = $meta;
  $url = SITE_URL . '/' . $path;
  $image = SITE_URL . '/assets/og.jpg';
  $type = 'website';
  if (!empty($o['post'])) {
    $p = $o['post'];
    $title = $p['title'] . ' — Rauf Asgarov';
    $plain = trim(preg_replace('/\s+/', ' ', preg_replace('/\{image\d+[^}]*\}/i', '', (string)$p['text'])));
    $desc = mb_substr($plain, 0, 160);
    $url = SITE_URL . '/news.html?id=' . rawurlencode($p['id']);
    $cover = img_src(($p['images'] ?? [])[0] ?? '');
    if ($cover) $image = SITE_URL . '/' . ltrim($cover, '/');
    $type = 'article';
  }
  echo '<title>' . e($title) . "</title>\n";
  echo '<meta name="description" content="' . e($desc) . "\">\n";
  echo '<link rel="canonical" href="' . e($url) . "\">\n";
  echo '<link rel="icon" type="image/png" href="assets/favicon.png">' . "\n";
  echo '<link rel="apple-touch-icon" href="assets/favicon.png">' . "\n";
  echo '<meta property="og:type" content="' . $type . "\">\n";
  echo '<meta property="og:site_name" content="Rauf Asgarov">' . "\n";
  echo '<meta property="og:title" content="' . e($title) . "\">\n";
  echo '<meta property="og:description" content="' . e($desc) . "\">\n";
  echo '<meta property="og:url" content="' . e($url) . "\">\n";
  echo '<meta property="og:image" content="' . e($image) . "\">\n";
  echo '<meta name="twitter:card" content="summary_large_image">' . "\n";
  echo '<meta name="twitter:title" content="' . e($title) . "\">\n";
  echo '<meta name="twitter:description" content="' . e($desc) . "\">\n";
  echo '<meta name="twitter:image" content="' . e($image) . "\">\n";

  if ($page === 'index' || $page === 'contact') {
    $same = [];
    foreach ((array)($S['contact']['socials'] ?? []) as $so) if (!empty($so['url']) && preg_match('#^https?://#', $so['url'])) $same[] = $so['url'];
    $ld = [
      '@context' => 'https://schema.org',
      '@type' => ['TattooParlor', 'LocalBusiness'],
      'name' => 'Rauf Asgarov Tattoo',
      'image' => $image,
      'url' => SITE_URL . '/',
      'address' => ['@type' => 'PostalAddress', 'addressLocality' => 'Baku', 'addressCountry' => 'AZ'],
      'founder' => ['@type' => 'Person', 'name' => 'Rauf Asgarov', 'jobTitle' => 'Tattoo artist'],
      'sameAs' => $same,
    ];
    echo '<script type="application/ld+json">' . json_encode($ld, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "</script>\n";
  }
  if (!empty($o['post'])) {
    $p = $o['post'];
    $ld = [
      '@context' => 'https://schema.org', '@type' => 'NewsArticle',
      'headline' => $p['title'], 'datePublished' => $p['date'] ?: null, 'image' => [$image],
      'author' => ['@type' => 'Person', 'name' => 'Rauf Asgarov'], 'mainEntityOfPage' => $url,
    ];
    echo '<script type="application/ld+json">' . json_encode($ld, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "</script>\n";
  }
}
