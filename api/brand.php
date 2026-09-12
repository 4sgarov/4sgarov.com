<?php
/* Auth: save the share image (assets/og.jpg) and favicon (assets/favicon.png). */
require __DIR__ . '/config.php';
require_same_origin();
require_auth();

$saved = [];
foreach (['og' => ['file' => ROOT . '/assets/og.jpg', 'type' => IMAGETYPE_JPEG], 'icon' => ['file' => ROOT . '/assets/favicon.png', 'type' => IMAGETYPE_PNG]] as $k => $spec) {
  if (empty($_FILES[$k]) || $_FILES[$k]['error'] !== UPLOAD_ERR_OK) continue;
  $info = @getimagesize($_FILES[$k]['tmp_name']);
  if (!$info || $info[2] !== $spec['type']) fail("Bad $k image");
  if (!move_uploaded_file($_FILES[$k]['tmp_name'], $spec['file'])) fail("Cannot save $k", 500);
  $saved[] = $k;
}
if (!$saved) fail('Nothing uploaded');
json_out(['ok' => true, 'saved' => $saved]);
