<?php
/* Public: dates that are already taken, per location id
   (confirmed bookings + dates blocked by hand in the admin). */
require __DIR__ . '/config.php';
ensure_dirs();
json_out(taken_dates());
