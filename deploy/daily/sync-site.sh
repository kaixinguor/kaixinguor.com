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

# agent 用写文件工具新建的 HTML 常是 600，nginx（www-data）读不到 → 新一期直接 403。
# 今天真踩过：发布后新页 403、旧页 200。统一放开读权限再同步。
# 当天的公众号配图：放到 <随机 token>/<日期>/ 下，给手机点开存图用。
# 路径随机、页面标 noindex、站点任何地方都不链接它，旧日期由 rsync --delete 清掉。
TODAY="$(TZ=Asia/Shanghai date +%F)"
TOKEN_FILE="${TOKEN_FILE:-/etc/kaixinguor/social-token}"
if [ -r "$TOKEN_FILE" ] && [ -d "$SITE_DIR/daily-ai/social/$TODAY/wechat" ]; then
  TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
  DEST="dist/site/ks-${TOKEN}/${TODAY}"
  mkdir -p "$DEST/wechat"
  cp -R "$SITE_DIR/daily-ai/social/$TODAY/wechat/." "$DEST/wechat/"
  [ -f "$SITE_DIR/daily-ai/social/$TODAY/公众号-图片消息.md" ] && \
    cp "$SITE_DIR/daily-ai/social/$TODAY/公众号-图片消息.md" "$DEST/"
  {
    printf '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
    printf '<meta name="viewport" content="width=device-width,initial-scale=1">'
    printf '<meta name="robots" content="noindex,nofollow">'
    printf '<title>AI 日报配图 %s</title>' "$TODAY"
    printf '<style>body{margin:0;padding:12px;background:#f6f4ef;font:15px/1.5 -apple-system,sans-serif}'
    printf 'h1{font-size:16px;margin:4px 0 12px}p{color:#666;font-size:13px;margin:0 0 12px}'
    printf 'img{width:100%%;display:block;margin:0 0 12px;border-radius:6px}</style></head><body>'
    printf '<h1>AI 日报 · %s 公众号配图</h1>' "$TODAY"
    printf '<p>长按图片存到相册，顺序 01 → 05。文案见同目录 md 文件。</p>'
    for f in "$DEST"/wechat/*.png; do
      [ -f "$f" ] || continue
      printf '<img src="wechat/%s" alt="">' "$(basename "$f")"
    done
    printf '</body></html>'
  } > "$DEST/index.html"
  echo "==> 配图页：/ks-${TOKEN}/${TODAY}/"
fi

find dist/site -type d -exec chmod 755 {} + 2>/dev/null || true
find dist/site -type f -exec chmod 644 {} + 2>/dev/null || true

echo "==> 同步到 $TARGET_DIR"
rsync -a --delete \
  --exclude '_headers' \
  --exclude '_redirects' \
  --exclude '.nojekyll' \
  --exclude '.DS_Store' \
  dist/site/ "$TARGET_DIR/"

echo "==> 完成：$(TZ=Asia/Shanghai date '+%F %T %Z')"
