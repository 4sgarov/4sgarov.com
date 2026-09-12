#!/bin/sh
# Stamp css/js links with a version so browsers/CDN fetch fresh files after a deploy.
v=$(date +%Y%m%d%H%M)
for f in *.php admin/index.html; do
  sed -i '' -E "s#(href=\"[^\"]*\.css)(\?v=[0-9]+)?\"#\1?v=$v\"#g; s#(src=\"[^\"]*\.js)(\?v=[0-9]+)?\"#\1?v=$v\"#g" "$f"
done
echo "assets stamped v=$v"
