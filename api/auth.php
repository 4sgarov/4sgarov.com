<?php
/* Password auth: status / setup / login / logout / change */
require __DIR__ . '/config.php';
ensure_dirs();
require_same_origin();

$action = $_GET['action'] ?? '';
$auth = read_json(AUTH_FILE, []);
$hasPassword = !empty($auth['hash']);

if ($action === 'status') {
  start_session();
  json_out(['setup' => !$hasPassword, 'signedIn' => !empty($_SESSION['admin'])]);
}

if ($action === 'setup') {
  if ($hasPassword) fail('Password already set', 409);
  $b = body_json();
  $pw = (string)($b['password'] ?? '');
  if (strlen($pw) < 8) fail('Password must be at least 8 characters');
  write_json(AUTH_FILE, ['hash' => password_hash($pw, PASSWORD_DEFAULT), 'fails' => 0, 'lockUntil' => 0]);
  start_session(!empty($b['remember']));
  session_regenerate_id(true);
  $_SESSION['admin'] = true;
  json_out(['ok' => true]);
}

if ($action === 'login') {
  if (!$hasPassword) fail('No password set yet', 409);
  if (($auth['lockUntil'] ?? 0) > time()) {
    fail('Too many attempts. Try again in ' . ceil((($auth['lockUntil']) - time()) / 60) . ' min.', 429);
  }
  $b = body_json();
  $pw = (string)($b['password'] ?? '');
  if (!password_verify($pw, $auth['hash'])) {
    $auth['fails'] = ($auth['fails'] ?? 0) + 1;
    if ($auth['fails'] >= MAX_LOGIN_FAILS) { $auth['fails'] = 0; $auth['lockUntil'] = time() + LOCK_MINUTES * 60; }
    write_json(AUTH_FILE, $auth);
    usleep(500000);
    fail('Wrong password', 401);
  }
  $auth['fails'] = 0; $auth['lockUntil'] = 0;
  write_json(AUTH_FILE, $auth);
  start_session(!empty($b['remember']));
  session_regenerate_id(true);
  $_SESSION['admin'] = true;
  json_out(['ok' => true]);
}

if ($action === 'logout') {
  start_session();
  $_SESSION = [];
  if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
  }
  session_destroy();
  json_out(['ok' => true]);
}

if ($action === 'change') {
  require_auth();
  $b = body_json();
  if (!password_verify((string)($b['current'] ?? ''), $auth['hash'])) fail('Current password is wrong', 401);
  $new = (string)($b['password'] ?? '');
  if (strlen($new) < 8) fail('New password must be at least 8 characters');
  $auth['hash'] = password_hash($new, PASSWORD_DEFAULT);
  write_json(AUTH_FILE, $auth);
  json_out(['ok' => true]);
}

fail('Unknown action', 404);
