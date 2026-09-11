<?php
/* Auth: list / update status / delete booking requests. */
require __DIR__ . '/config.php';
ensure_dirs();
require_same_origin();
require_auth();

$all = read_json(BOOKINGS_FILE, []);

if ($_SERVER['REQUEST_METHOD'] === 'GET') json_out($all);

$b = body_json();
$action = $b['action'] ?? '';
$id = preg_replace('/[^0-9a-f-]/i', '', (string)($b['id'] ?? ''));
$idx = null;
foreach ($all as $i => $r) if ($r['id'] === $id) { $idx = $i; break; }
if ($idx === null) fail('Not found', 404);

if ($action === 'status') {
  $st = in_array($b['status'] ?? '', ['new', 'confirmed', 'done'], true) ? $b['status'] : 'new';
  if ($st === 'confirmed') {
    $me = $all[$idx];
    foreach ($all as $o) {
      if ($o['id'] !== $me['id'] && ($o['status'] ?? '') === 'confirmed'
          && ($o['location']['id'] ?? '') === ($me['location']['id'] ?? '') && $o['date'] === $me['date']) {
        fail('That date is already confirmed for ' . $o['firstName'] . ' ' . $o['lastName'] . '.', 409);
      }
    }
  }
  $all[$idx]['status'] = $st;
  write_json(BOOKINGS_FILE, $all);
  json_out(['ok' => true]);
}
if ($action === 'delete') {
  $dir = BOOKINGS_DIR . '/' . $id;
  if (is_dir($dir)) { foreach (glob("$dir/*") ?: [] as $f) unlink($f); @rmdir($dir); }
  array_splice($all, $idx, 1);
  write_json(BOOKINGS_FILE, $all);
  json_out(['ok' => true]);
}
fail('Unknown action');
