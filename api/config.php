<?php
/* Shared bootstrap for the admin API. */
declare(strict_types=1);

define('ROOT', dirname(__DIR__));
define('DATA_DIR', ROOT . '/data');
define('SITE_FILE', DATA_DIR . '/site.json');
define('SITE_DEFAULT', DATA_DIR . '/site.default.json');
define('AUTH_FILE', DATA_DIR . '/auth.json');
define('TMP_DIR', DATA_DIR . '/tmp');
define('BOOKINGS_FILE', DATA_DIR . '/bookings.json');
define('BOOKINGS_DIR', DATA_DIR . '/bookings');
define('UPLOAD_DIR', ROOT . '/assets/uploads');
define('UPLOAD_URL', 'assets/uploads');
define('SESSION_DAYS', 30);
define('MAX_LOGIN_FAILS', 5);
define('LOCK_MINUTES', 15);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function json_out($data, int $code = 200): void {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function fail(string $msg, int $code = 400): void { json_out(['error' => $msg], $code); }

function read_json(string $file, $default) {
  if (!is_file($file)) return $default;
  $j = json_decode((string)file_get_contents($file), true);
  return $j === null ? $default : $j;
}
function write_json(string $file, $data): void {
  $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
  if (file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", LOCK_EX) === false) {
    fail('Cannot write ' . basename($file), 500);
  }
  rename($tmp, $file);
}

function ensure_dirs(): void {
  foreach ([DATA_DIR, TMP_DIR, UPLOAD_DIR, BOOKINGS_DIR] as $d) if (!is_dir($d)) @mkdir($d, 0755, true);
  if (!is_file(BOOKINGS_DIR . '/.htaccess')) @file_put_contents(BOOKINGS_DIR . '/.htaccess', "Require all denied\n");
  if (!is_file(SITE_FILE) && is_file(SITE_DEFAULT)) copy(SITE_DEFAULT, SITE_FILE);
}

function start_session(bool $long = false): void {
  $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
  $life = $long ? SESSION_DAYS * 86400 : 0;
  session_set_cookie_params(['lifetime' => $life, 'path' => '/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax']);
  session_name('adm_sess');
  if ($long) ini_set('session.gc_maxlifetime', (string)($life));
  session_start();
}

/* Same-origin guard against CSRF for state-changing requests. */
function require_same_origin(): void {
  if ($_SERVER['REQUEST_METHOD'] === 'GET') return;
  if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'XMLHttpRequest') fail('Bad request', 403);
  $host = $_SERVER['HTTP_HOST'] ?? '';
  foreach (['HTTP_ORIGIN', 'HTTP_REFERER'] as $h) {
    if (!empty($_SERVER[$h])) {
      $o = parse_url($_SERVER[$h], PHP_URL_HOST);
      if ($o && strcasecmp($o, explode(':', $host)[0]) !== 0) fail('Cross-origin request blocked', 403);
      return;
    }
  }
}

function require_auth(): void {
  start_session();
  if (empty($_SESSION['admin'])) fail('Not signed in', 401);
}

function body_json(): array {
  $raw = file_get_contents('php://input');
  $j = json_decode($raw ?: '', true);
  return is_array($j) ? $j : [];
}
