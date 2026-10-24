#!/bin/bash
# 打包出可以直接丢到服务器的 zip
set -e
cd "$(dirname "$0")"

OUT=dist
rm -rf "$OUT"
mkdir -p "$OUT"

zip -q -r "$OUT/kaixinguor-site.zip" \
  index.html wish.html 404.html \
  style.css favicon.svg \
  hark snipread assets \
  _headers robots.txt sitemap.xml \
  -x "*.DS_Store"

echo "✅ $OUT/kaixinguor-site.zip  ($(du -h "$OUT/kaixinguor-site.zip" | cut -f1))"
echo "   解压到站点根目录，保证 index.html 在最外层。"
