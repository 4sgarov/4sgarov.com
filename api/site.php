<?php
/* GET: current content. POST (auth): replace content. */
require __DIR__ . '/config.php';
ensure_dirs();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  json_out(read_json(SITE_FILE, read_json(SITE_DEFAULT, new stdClass())));
}

require_same_origin();
require_auth();

$site = body_json();
if (!isset($site['home'], $site['about'], $site['portfolio'])) fail('Invalid content');

/* Keep only known keys / shapes so the file can't be polluted. */
$str = fn($v) => is_string($v) ? trim($v) : '';
$media = fn($m) => ['desktop' => $str($m['desktop'] ?? ''), 'mobile' => $str($m['mobile'] ?? '')];
$clean = [
  'home' => ['cover' => $media($site['home']['cover'] ?? [])],
  'about' => [
    'hero' => $media($site['about']['hero'] ?? []),
    'name' => $str($site['about']['name'] ?? ''),
    'role' => $str($site['about']['role'] ?? ''),
    'columns' => [],
  ],
  'portfolio' => ['categories' => [], 'works' => []],
];
foreach (array_slice((array)($site['about']['columns'] ?? []), 0, 2) as $c) {
  $clean['about']['columns'][] = ['heading' => $str($c['heading'] ?? ''), 'text' => $str($c['text'] ?? '')];
}
foreach ((array)($site['portfolio']['categories'] ?? []) as $c) {
  $id = preg_replace('/[^a-z0-9-]/', '', strtolower($str($c['id'] ?? '')));
  if ($id === '') continue;
  $clean['portfolio']['categories'][] = ['id' => $id, 'name' => $str($c['name'] ?? '')];
}
foreach ((array)($site['portfolio']['works'] ?? []) as $w) {
  $link = $str($w['link'] ?? '');
  if ($link !== '' && !preg_match('#^(https?://|mailto:|tel:|/)#i', $link)) $link = 'https://' . $link;
  $clean['portfolio']['works'][] = [
    'id' => preg_replace('/[^a-z0-9]/', '', strtolower($str($w['id'] ?? ''))) ?: bin2hex(random_bytes(4)),
    'image' => $str($w['image'] ?? ''),
    'title' => $str($w['title'] ?? ''),
    'category' => preg_replace('/[^a-z0-9-]/', '', strtolower($str($w['category'] ?? ''))),
    'link' => $link,
  ];
}

write_json(SITE_FILE, $clean);
json_out(['ok' => true]);
