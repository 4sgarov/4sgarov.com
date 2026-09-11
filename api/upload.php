<?php
/* Chunked upload: the browser sends a file in small parts so hosting
   upload limits don't matter. Parts are stored under data/tmp/<id>/ and
   joined when the last one arrives. */
require __DIR__ . '/config.php';
ensure_dirs();
require_same_origin();
require_auth();

$allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'm4v'];

$id = preg_replace('/[^a-z0-9]/', '', strtolower((string)($_POST['uploadId'] ?? '')));
$index = (int)($_POST['index'] ?? -1);
$total = (int)($_POST['total'] ?? 0);
$name = (string)($_POST['name'] ?? '');

if ($id === '' || $index < 0 || $total < 1 || $index >= $total) fail('Bad chunk parameters');
if (empty($_FILES['chunk']) || $_FILES['chunk']['error'] !== UPLOAD_ERR_OK) fail('Chunk missing (' . ($_FILES['chunk']['error'] ?? 'none') . ')');

$ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
if (!in_array($ext, $allowed, true)) fail('File type not allowed: .' . $ext);
$base = preg_replace('/[^a-z0-9_-]/', '-', strtolower(pathinfo($name, PATHINFO_FILENAME)));
$base = trim(preg_replace('/-+/', '-', $base), '-') ?: 'file';

$dir = TMP_DIR . '/' . $id;
if (!is_dir($dir)) mkdir($dir, 0755, true);
if (!move_uploaded_file($_FILES['chunk']['tmp_name'], $dir . '/' . $index)) fail('Cannot store chunk', 500);

/* Not the last chunk yet */
if ($index < $total - 1) json_out(['ok' => true, 'received' => $index + 1]);

/* Join all chunks */
for ($i = 0; $i < $total; $i++) if (!is_file("$dir/$i")) fail("Chunk $i missing — upload again", 400);

$final = $base . '.' . $ext;
$n = 1;
while (is_file(UPLOAD_DIR . '/' . $final)) $final = $base . '-' . (++$n) . '.' . $ext;
$out = fopen(UPLOAD_DIR . '/' . $final, 'wb');
if (!$out) fail('Cannot create file', 500);
for ($i = 0; $i < $total; $i++) {
  $in = fopen("$dir/$i", 'rb');
  stream_copy_to_stream($in, $out);
  fclose($in);
  unlink("$dir/$i");
}
fclose($out);
@rmdir($dir);

/* Sanity check: images must really be images */
if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'], true) && @getimagesize(UPLOAD_DIR . '/' . $final) === false) {
  unlink(UPLOAD_DIR . '/' . $final);
  fail('File is not a valid image');
}

/* Clean stale temp dirs (older than a day) */
foreach (glob(TMP_DIR . '/*', GLOB_ONLYDIR) ?: [] as $d) {
  if (filemtime($d) < time() - 86400) { foreach (glob("$d/*") ?: [] as $f) unlink($f); @rmdir($d); }
}

json_out(['ok' => true, 'path' => UPLOAD_URL . '/' . $final, 'size' => filesize(UPLOAD_DIR . '/' . $final)]);
