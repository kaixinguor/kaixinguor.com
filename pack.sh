#!/bin/bash
# 打包出可以直接丢到服务器的 zip（内容与 dist/site/ 一致）
set -e
cd "$(dirname "$0")"

node scripts/stage.mjs
rm -f dist/kaixinguor-site.zip
(cd dist/site && zip -q -r ../kaixinguor-site.zip . -x "*.DS_Store")

echo "✅ dist/kaixinguor-site.zip  ($(du -h dist/kaixinguor-site.zip | cut -f1))"
echo "   解压到站点根目录，保证 index.html 在最外层。"
