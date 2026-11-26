#!/usr/bin/env bash
# 跑一份日报：dsh headless + 超时 + 日志 + 通知。
#
#   run-daily.sh ai|economy|education|psychology
#
# 由 systemd timer 在 08:00 / 08:30 / 09:00 / 09:30（Asia/Shanghai）调用。
# 提示词在 /opt/kaixinguor/prompts/<section>.txt，__DATE__ 会被替换成当天日期。
set -uo pipefail

SECTION="${1:-}"
case "$SECTION" in
  ai|economy|education|psychology) ;;
  *) echo "用法：run-daily.sh ai|economy|education|psychology" >&2; exit 2 ;;
esac

SITE_DIR="${SITE_DIR:-/opt/kaixinguor/site}"
PROMPT_DIR="${PROMPT_DIR:-/opt/kaixinguor/prompts}"
LOG_DIR="${LOG_DIR:-/var/log/kaixinguor}"
NOTIFY="${NOTIFY:-/opt/kaixinguor/bin/notify.sh}"
DSH="${DSH:-/usr/local/bin/dsh}"
TIMEOUT_SEC="${TIMEOUT_SEC:-10800}"   # 3 小时兜底

case "$SECTION" in
  ai)         LABEL="AI 日报";     URL_PART="daily-ai" ;;
  economy)    LABEL="经济日报";    URL_PART="daily-economy" ;;
  education)  LABEL="教育日报";    URL_PART="daily-education" ;;
  psychology) LABEL="心理学日报";  URL_PART="daily-psychology" ;;
esac

DATE="$(TZ=Asia/Shanghai date +%F)"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/${SECTION}-${DATE}.log"
ln -sfn "$LOG" "$LOG_DIR/${SECTION}-latest.log"

PROMPT_FILE="$PROMPT_DIR/${SECTION}.txt"
if [ ! -r "$PROMPT_FILE" ]; then
  echo "缺少提示词：$PROMPT_FILE" >&2
  "$NOTIFY" failure "${LABEL} ${DATE} 未启动：缺少提示词 $PROMPT_FILE" || true
  exit 2
fi

TASK="$(sed "s/__DATE__/${DATE}/g" "$PROMPT_FILE")"

cd "$SITE_DIR" || exit 2

echo "==> ${LABEL} ${DATE} 开始 $(date '+%F %T %Z')" | tee -a "$LOG"

# 先同步仓库：Mac 上改过的文档/模板要能被这一轮用上；
# 上一轮 push 失败留下的本地提交也在这里被发现。
if ! PULL_OUT="$(git pull --ff-only --quiet 2>&1)"; then
  echo "==> git pull 失败：$PULL_OUT" | tee -a "$LOG"
  "$NOTIFY" failure "${LABEL} ${DATE} 未启动：git pull --ff-only 失败，请先处理服务器仓库分叉" || true
  exit 3
fi

START=$(date +%s)

# dsh headless 会把最终答复写到 stdout；--json 不用，日志可读性优先
timeout --preserve-status -k 120 "$TIMEOUT_SEC" "$DSH" headless "$TASK" >>"$LOG" 2>&1
RC=$?

DUR=$(( $(date +%s) - START ))
MIN=$(( DUR / 60 ))
echo "==> ${LABEL} ${DATE} 结束 rc=${RC} 用时 ${MIN} 分" | tee -a "$LOG"

if [ "$RC" -eq 0 ]; then
  "$NOTIFY" success "${LABEL} ${DATE} 已发布（${MIN} 分） https://kaixinguor.com/${URL_PART}/${DATE}" || true
elif [ "$RC" -eq 124 ] || [ "$RC" -eq 137 ]; then
  "$NOTIFY" failure "${LABEL} ${DATE} 超时 ${MIN} 分被终止，见 $LOG" || true
else
  "$NOTIFY" failure "${LABEL} ${DATE} 失败 rc=${RC}（${MIN} 分），见 $LOG" || true
fi

exit "$RC"
