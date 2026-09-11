<?php
/* Public: receive a booking request (multipart form). Stores it privately
   under data/ and emails the artist if a notification address is set. */
require __DIR__ . '/config.php';
ensure_dirs();
require_same_origin();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);

/* Honeypot + simple per-IP rate limit (5 / hour) */
if (!empty($_POST['website'])) json_out(['ok' => true]);
$ip = $_SERVER['REMOTE_ADDR'] ?? '0';
$rlFile = TMP_DIR . '/rl-' . md5($ip) . '.json';
$hits = array_filter(read_json($rlFile, []), fn($t) => $t > time() - 3600);
if (count($hits) >= 5) fail('Too many requests — please try again later.', 429);

$site = read_json(SITE_FILE, read_json(SITE_DEFAULT, []));
$booking = $site['booking'] ?? [];
$services = []; foreach ((array)($booking['services'] ?? []) as $s) $services[$s['id']] = $s;
$locations = []; foreach ((array)($booking['locations'] ?? []) as $l) $locations[$l['id']] = $l;

$str = fn($k, $max = 200) => mb_substr(trim((string)($_POST[$k] ?? '')), 0, $max);
$first = $str('firstName', 60);
$last = $str('lastName', 60);
$contact = $str('contact', 120);
$locId = $str('location', 40);
$date = $str('date', 10);
$svcId = $str('service', 40);
$idea = $str('idea', 3000);
$adult = !empty($_POST['adult']);

if ($first === '' || $last === '') fail('Please enter your first and last name.');
if ($contact === '') fail('Please enter your email, phone or Instagram.');
if (!isset($locations[$locId])) fail('Please choose a city.');
if (!isset($services[$svcId])) fail('Please choose a style.');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || strtotime($date) === false) fail('Please pick a date.');
$loc = $locations[$locId];
if ($loc['from'] && $date < $loc['from']) fail('Date is before the trip starts.');
if ($loc['to'] && $date > $loc['to']) fail('Date is after the trip ends.');
if ($date < date('Y-m-d')) fail('Date is in the past.');
if ($idea === '') fail('Please describe your idea.');
if (!$adult) fail('You must confirm you are 18 or older.');

$svc = $services[$svcId];
$kind = $svc['kind'] ?? 'tattoo';

/* Images: image1 required for tattoo/coverup; image2 required for coverup */
function take_image(string $field, bool $required): ?array {
  if (empty($_FILES[$field]) || $_FILES[$field]['error'] === UPLOAD_ERR_NO_FILE) {
    if ($required) fail('Please add the required image.');
    return null;
  }
  $f = $_FILES[$field];
  if ($f['error'] !== UPLOAD_ERR_OK) fail('Image upload failed (' . $f['error'] . ').');
  if ($f['size'] > 15 * 1024 * 1024) fail('Each image must be under 15 MB.');
  $info = @getimagesize($f['tmp_name']);
  if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP], true)) fail('Only JPG, PNG, GIF or WebP images.');
  $ext = image_type_to_extension($info[2], false);
  return ['tmp' => $f['tmp_name'], 'ext' => $ext === 'jpeg' ? 'jpg' : $ext];
}
$img1 = $kind === 'seminar' ? null : take_image('image1', true);
$img2 = $kind === 'seminar' ? null : take_image('image2', $kind === 'coverup');

$id = date('Ymd-His') . '-' . bin2hex(random_bytes(3));
$dir = BOOKINGS_DIR . '/' . $id;
$files = [];
foreach ([1 => $img1, 2 => $img2] as $n => $im) {
  if (!$im) continue;
  if (!is_dir($dir)) mkdir($dir, 0755, true);
  $name = 'image' . $n . '.' . $im['ext'];
  if (!move_uploaded_file($im['tmp'], "$dir/$name")) fail('Could not store image.', 500);
  $files[] = $name;
}

$rec = [
  'id' => $id,
  'created' => date('c'),
  'firstName' => $first, 'lastName' => $last, 'contact' => $contact,
  'location' => ['code' => $loc['code'], 'country' => $loc['country'], 'city' => $loc['city']],
  'date' => $date,
  'service' => ['id' => $svcId, 'name' => $svc['name'], 'kind' => $kind],
  'idea' => $idea,
  'images' => $files,
  'status' => 'new',
];
$all = read_json(BOOKINGS_FILE, []);
array_unshift($all, $rec);
write_json(BOOKINGS_FILE, $all);
$hits[] = time(); write_json($rlFile, array_values($hits));

/* Notify */
$to = $booking['notifyEmail'] ?? '';
if ($to && filter_var($to, FILTER_VALIDATE_EMAIL)) {
  $host = preg_replace('/^www\./', '', $_SERVER['HTTP_HOST'] ?? 'site');
  $body = "New booking request\n\n"
    . "Name: $first $last\nContact: $contact\n"
    . "City: {$loc['city']}, {$loc['country']}\nDate: $date\nStyle: {$svc['name']}\n"
    . "Images: " . (count($files) ?: 'none') . "\n\nIdea:\n$idea\n\n"
    . "Open the admin panel to see it: https://$host/admin/\n";
  @mail($to, "[$host] Booking: $first $last — {$svc['name']}, {$loc['city']} $date", $body,
    "From: noreply@$host\r\nReply-To: " . (filter_var($contact, FILTER_VALIDATE_EMAIL) ? $contact : "noreply@$host") . "\r\nContent-Type: text/plain; charset=UTF-8");
}

json_out(['ok' => true]);
