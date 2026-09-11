<?php
/* GET (auth): download a zip with site.json and all uploaded media. */
require __DIR__ . '/config.php';
require_auth();

if (!class_exists('ZipArchive')) fail('ZipArchive is not available on this server', 500);

$tmp = tempnam(sys_get_temp_dir(), 'bak');
$zip = new ZipArchive();
if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) fail('Cannot create zip', 500);

if (is_file(SITE_FILE)) $zip->addFile(SITE_FILE, 'data/site.json');
foreach (glob(UPLOAD_DIR . '/*') ?: [] as $f) {
  if (is_file($f) && basename($f)[0] !== '.') $zip->addFile($f, 'assets/uploads/' . basename($f));
}
$zip->close();

$name = 'backup-4sgarov-' . date('Y-m-d-Hi') . '.zip';
header_remove('Content-Type');
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $name . '"');
header('Content-Length: ' . filesize($tmp));
readfile($tmp);
unlink($tmp);
exit;
