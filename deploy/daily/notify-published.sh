#!/usr/bin/env bash
# 人工修好一份日报后，补发一条标准成功通知。
#
#   notify-published.sh ai              # 当天 AI 日报
#   notify-published.sh economy 12      # 带上用时
#   notify-published.sh psychology --dry-run
#
# 为什么需要它：run-daily.sh 只在它自己跑完并验收通过后发通知。
# 如果是人工改链接、补发稿子、重跑发布脚本（比如 2026-11-28 那次 sync-site 权限问题），
# 页面已经上线，但手机不会收到消息——别人会以为这一天没发。
# 这个脚本只做"验收 + 发消息"，不改任何文件。
set -uo pipefail

usage() {
  echo "用法：notify-published.sh ai|economy|education|psychology [用时分钟] [--dry-run]" >&2
  exit 2
}

SECTION=""
MIN=""
DRY=0
for arg in "$@"; do
  case "$arg" in
    ai|economy|education|psychology) SECTION="$arg" ;;
    --dry-run) DRY=1 ;;
    ""|*[!0-9]*) usage ;;
    *) MIN="$arg" ;;
  esac
done
[ -n "$SECTION" ] || usage

SITE_DIR="${SITE_DIR:-/opt/kaixinguor/site}"
NOTIFY="${NOTIFY:-/opt/kaixinguor/bin/notify.sh}"
TOKEN_FILE="${TOKEN_FILE:-/etc/kaixinguor/social-token}"

case "$SECTION" in
  ai)         LABEL="AI 日报";     URL_PART="daily-ai" ;;
  economy)    LABEL="经济日报";    URL_PART="daily-economy" ;;
  education)  LABEL="教育日报";    URL_PART="daily-education" ;;
  psychology) LABEL="心理学日报";  URL_PART="daily-psychology" ;;
esac

DATE="$(TZ=Asia/Shanghai date +%F)"
ZH="$SITE_DIR/$URL_PART/web/${DATE}.html"
EN="$SITE_DIR/$URL_PART/web/${DATE}-en.html"

PROBLEM=""
[ -s "$ZH" ] || PROBLEM="缺中文稿 $(basename "$ZH")"
[ -s "$EN" ] || PROBLEM="${PROBLEM:+${PROBLEM}；}缺英文稿 $(basename "$EN")"

if [ -z "$PROBLEM" ]; then
  for u in "https://kaixinguor.com/${URL_PART}/web/${DATE}.html" \
           "https://kaixinguor.com/${URL_PART}/web/${DATE}-en.html"; do
    CODE=""
    for attempt in 1 2 3; do
      CODE="$(curl -sL --max-time 20 -o /dev/null -w '%{http_code}' "$u" || true)"
      [ "$CODE" = "200" ] && break
      sleep 5
    done
    [ "$CODE" = "200" ] || PROBLEM="${PROBLEM:+${PROBLEM}；}线上未 200：$u -> ${CODE:-fail}"
  done
fi

if [ -n "$PROBLEM" ]; then
  echo "验收未通过：$PROBLEM" >&2
  [ "$DRY" -eq 1 ] || "$NOTIFY" failure "${LABEL} ${DATE} 补发通知前验收没过：${PROBLEM}" || true
  exit 1
fi

ISSUE="$(grep -o "第 [0-9]\+ 期" "$ZH" 2>/dev/null | head -1)"
DETAIL=""
[ -n "$ISSUE" ] && DETAIL="$ISSUE"
[ -n "$MIN" ] && DETAIL="${DETAIL:+${DETAIL}，}${MIN} 分"

SOCIAL=""
if [ -r "$TOKEN_FILE" ] && [ -d "$SITE_DIR/$URL_PART/social/${DATE}/wechat" ]; then
  TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
  SOCIAL="
配图（手机点开长按存图）：https://kaixinguor.com/ks-${TOKEN}/${DATE}/"
fi

NOTE=""
[ -n "$DETAIL" ] && NOTE="（${DETAIL}）"

MSG="${LABEL} ${DATE} 已发布${NOTE} https://kaixinguor.com/${URL_PART}/${DATE}${SOCIAL}"

if [ "$DRY" -eq 1 ]; then
  echo "（dry-run，不发送）"
  printf '%s\n' "$MSG"
  exit 0
fi

"$NOTIFY" success "$MSG"
echo "已发送："
printf '%s\n' "$MSG"
