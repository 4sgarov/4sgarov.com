<?php
/* Post view counter. GET → {postId: count}. POST {id} → +1 (public). */
require __DIR__ . '/config.php';
ensure_dirs();
define('VIEWS_FILE', DATA_DIR . '/views.json');

if ($_SERVER['REQUEST_METHOD'] === 'GET') json_out((object)read_json(VIEWS_FILE, []));

require_same_origin();
$b = body_json();
$id = preg_replace('/[^a-z0-9]/', '', strtolower((string)($b['id'] ?? '')));
if ($id === '') fail('Bad id');

/* Only count ids that are real posts */
$site = read_json(SITE_FILE, read_json(SITE_DEFAULT, []));
$ok = false;
foreach ((array)($site['news']['posts'] ?? []) as $p) if (($p['id'] ?? '') === $id) { $ok = true; break; }
if (!$ok) fail('Unknown post', 404);

/* One count per visitor per post per day */
$key = md5(($_SERVER['REMOTE_ADDR'] ?? '') . '|' . ($_SERVER['HTTP_USER_AGENT'] ?? '') . '|' . $id . '|' . date('Y-m-d'));
$seenFile = TMP_DIR . '/seen-' . $key;
if (is_file($seenFile)) json_out(['ok' => true, 'counted' => false]);
touch($seenFile);
foreach (glob(TMP_DIR . '/seen-*') ?: [] as $f) if (filemtime($f) < time() - 2 * 86400) @unlink($f);

$views = read_json(VIEWS_FILE, []);
$views[$id] = (int)($views[$id] ?? 0) + 1;
write_json(VIEWS_FILE, $views);
json_out(['ok' => true, 'counted' => true, 'views' => $views[$id]]);
