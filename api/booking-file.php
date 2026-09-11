<?php
/* Auth: stream an image attached to a booking request. */
require __DIR__ . '/config.php';
require_auth();

$id = preg_replace('/[^0-9a-f-]/i', '', (string)($_GET['id'] ?? ''));
$name = basename((string)($_GET['file'] ?? ''));
$path = BOOKINGS_DIR . "/$id/$name";
if ($id === '' || $name === '' || !is_file($path)) fail('Not found', 404);
$info = @getimagesize($path);
if (!$info) fail('Not an image', 404);
header_remove('Content-Type');
header('Content-Type: ' . $info['mime']);
header('Content-Length: ' . filesize($path));
header('Cache-Control: private, max-age=3600');
readfile($path);
exit;
