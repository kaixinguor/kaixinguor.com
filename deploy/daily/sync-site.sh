#!/usr/bin/env bash
# 把仓库里的静态产物同步到本机 nginx 目录（服务器上跑，不用 SSH）。
#
# DSH 定时任务里的顺序是：
#   publish-daily.mjs ... --push      # 写日报 + build + git commit/push
#   sync-site.sh                      # stage + rsync 到 nginx，线上才真的变
#
# 用法：
#   sync-site.sh              # 生成 dist/site/ 并同步
#   sync-site.sh --no-build   # publish 刚构建过，只 stage + rsync
#
# 环境：
#   SITE_DIR=${SITE_DIR:-/opt/kaixinguor/site}
#   TARGET_DIR=${TARGET_DIR:-/home/project/kaixinguor.com}
set -euo pipefail

SITE_DIR="${SITE_DIR:-/opt/kaixinguor/site}"
TARGET_DIR="${TARGET_DIR:-/home/project/kaixinguor.com}"
BUILD=1

for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    *) echo "未知参数：$arg" >&2; exit 2 ;;
  esac
done

cd "$SITE_DIR"

if [ ! -d "$TARGET_DIR" ]; then
  echo "目标目录不存在：$TARGET_DIR" >&2
  exit 1
fi

if [ ! -w "$TARGET_DIR" ]; then
  echo "当前用户对 $TARGET_DIR 没有写权限；先执行：sudo chown -R $(id -un):$(id -gn) $TARGET_DIR" >&2
  exit 1
fi

if [ "$BUILD" -eq 1 ]; then
  echo "==> 重建首页 / 往期 / RSS / sitemap"
  node scripts/build.mjs
fi

echo "==> 生成 dist/site/"
node scripts/stage.mjs

echo "==> 同步到 $TARGET_DIR"
rsync -a --delete \
  --exclude '_headers' \
  --exclude '_redirects' \
  --exclude '.nojekyll' \
  --exclude '.DS_Store' \
  dist/site/ "$TARGET_DIR/"

echo "==> 完成：$(TZ=Asia/Shanghai date '+%F %T %Z')"
