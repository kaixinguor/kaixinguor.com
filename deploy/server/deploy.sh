#!/usr/bin/env bash
# 把 kaixinguor.com 发布到阿里云服务器（与 mathster.cn 共存）。
#
#   bash deploy/server/deploy.sh              # 构建 + 同步
#   bash deploy/server/deploy.sh --dry-run    # 只看会传什么，不落盘
#   bash deploy/server/deploy.sh --skip-build # 只同步 dist/site/（已构建过）
#
# 目标目录可用环境变量覆盖：
#   KAIXINGUOR_TARGET=root@1.2.3.4:/home/project/kaixinguor.com/ bash deploy/server/deploy.sh
#
# 只传 dist/site/（scripts/stage.mjs 的产物），不会把源稿、脚本、docs 传上去。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET="${KAIXINGUOR_TARGET:-root@39.107.233.27:/home/project/kaixinguor.com/}"

DRY_RUN=0
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    *) echo "未知参数：$arg" >&2; exit 2 ;;
  esac
done

cd "$ROOT"

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "==> 构建首页 / 往期 / RSS / sitemap"
  node scripts/build.mjs
  echo "==> 生成 dist/site/"
  node scripts/stage.mjs
fi

if [ ! -f dist/site/index.html ]; then
  echo "dist/site/index.html 不存在，先跑一次构建" >&2
  exit 1
fi

RSYNC=(rsync -avz --delete
  --exclude '_headers'      # Cloudflare 专用，nginx 已在配置里复刻
  --exclude '_redirects'    # 同上
  --exclude '.nojekyll'     # GitHub Pages 专用
  --exclude '.DS_Store')

if [ "$DRY_RUN" -eq 1 ]; then
  RSYNC+=(--dry-run --itemize-changes)
  echo "==> DRY RUN，不会写入服务器"
fi

"${RSYNC[@]}" dist/site/ "$TARGET"

if [ "$DRY_RUN" -eq 0 ]; then
  cat <<EOF

已同步到 $TARGET
静态站无需 reload nginx，浏览器强刷即可。
验收： curl -I https://kaixinguor.com/ && curl -I https://kaixinguor.com/hark/
EOF
fi
