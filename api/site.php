<?php
/* GET: current content. POST (auth): replace content. */
require __DIR__ . '/config.php';
ensure_dirs();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  /* Fill in sections added after the site was first installed. */
  $site = read_json(SITE_FILE, []);
  foreach (read_json(SITE_DEFAULT, []) as $k => $v) if (!isset($site[$k])) $site[$k] = $v;
  json_out($site ?: new stdClass());
}

require_same_origin();
require_auth();

$site = body_json();
if (!isset($site['home'], $site['about'], $site['portfolio'])) fail('Invalid content');
$site['booking'] = $site['booking'] ?? [];

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
  'booking' => [
    'intro' => $str($site['booking']['intro'] ?? ''),
    'services' => [],
    'locations' => [],
    'notifyEmail' => filter_var($str($site['booking']['notifyEmail'] ?? ''), FILTER_VALIDATE_EMAIL) ?: '',
  ],
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

foreach ((array)($site['booking']['services'] ?? []) as $s) {
  $id = preg_replace('/[^a-z0-9-]/', '', strtolower($str($s['id'] ?? '')));
  if ($id === '') continue;
  $kind = in_array($s['kind'] ?? '', ['tattoo', 'coverup', 'seminar'], true) ? $s['kind'] : 'tattoo';
  $clean['booking']['services'][] = ['id' => $id, 'name' => $str($s['name'] ?? ''), 'kind' => $kind];
}
$date = fn($v) => preg_match('/^\d{4}-\d{2}-\d{2}$/', $str($v)) ? $str($v) : '';
foreach ((array)($site['booking']['locations'] ?? []) as $l) {
  $id = preg_replace('/[^a-z0-9]/', '', strtolower($str($l['id'] ?? ''))) ?: bin2hex(random_bytes(4));
  $code = strtoupper(preg_replace('/[^A-Za-z]/', '', $str($l['code'] ?? '')));
  if (strlen($code) !== 2) continue;
  $clean['booking']['locations'][] = [
    'id' => $id, 'code' => $code,
    'country' => $str($l['country'] ?? ''), 'city' => $str($l['city'] ?? ''),
    'from' => $date($l['from'] ?? ''), 'to' => $date($l['to'] ?? ''),
    'blocked' => array_values(array_unique(array_filter(array_map($date, (array)($l['blocked'] ?? []))))),
  ];
}

write_json(SITE_FILE, $clean);
json_out(['ok' => true]);
