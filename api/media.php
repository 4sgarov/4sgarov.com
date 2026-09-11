<?php
/* POST (auth): delete an uploaded file. */
require __DIR__ . '/config.php';
require_same_origin();
require_auth();

$b = body_json();
$path = (string)($b['path'] ?? '');
if (strpos($path, UPLOAD_URL . '/') !== 0) fail('Not an uploaded file');
$name = basename($path);
if ($name !== substr($path, strlen(UPLOAD_URL) + 1)) fail('Bad path');
$file = UPLOAD_DIR . '/' . $name;
if (is_file($file)) unlink($file);
json_out(['ok' => true]);
