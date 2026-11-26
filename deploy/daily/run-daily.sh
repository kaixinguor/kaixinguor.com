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

# 没配 key 就别跑：省得四份都跑一遍才在第一次模型调用上失败
if [ -z "${DEEPSEEK_API_KEY:-}" ] || [ "${DEEPSEEK_API_KEY}" = "sk-REPLACE_ME" ]; then
  echo "DEEPSEEK_API_KEY 未配置（/etc/kaixinguor/dsh.env）" >&2
  "$NOTIFY" failure "${LABEL} ${DATE} 未启动：DEEPSEEK_API_KEY 未配置" || true
  exit 4
fi

cd "$SITE_DIR" || exit 2

echo "==> ${LABEL} ${DATE} 开始 $(date '+%F %T %Z')" | tee -a "$LOG"

# 先同步仓库：Mac 上改过的文档/模板要能被这一轮用上；
# 上一轮 push 失败留下的本地提交也在这里被发现。
# GitHub 从国内拉偶尔会 TLS 断掉，重试三次再判定失败
PULL_OK=0
for attempt in 1 2 3; do
  if PULL_OUT="$(git pull --ff-only --quiet 2>&1)"; then PULL_OK=1; break; fi
  echo "==> git pull 第 ${attempt} 次失败：$PULL_OUT" | tee -a "$LOG"
  sleep 10
done
if [ "$PULL_OK" -ne 1 ]; then
  "$NOTIFY" failure "${LABEL} ${DATE} 未启动：git pull --ff-only 连续失败（网络或仓库分叉），见 $LOG" || true
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
  # 不信 agent 的自述：文件在不在、线上是不是 200，自己验
  ZH="$SITE_DIR/$URL_PART/web/${DATE}.html"
  EN="$SITE_DIR/$URL_PART/web/${DATE}-en.html"
  PROBLEM=""
  [ -s "$ZH" ] || PROBLEM="缺中文稿 $(basename "$ZH")"
  [ -s "$EN" ] || PROBLEM="${PROBLEM:+$PROBLEM；}缺英文稿 $(basename "$EN")"

  if [ -z "$PROBLEM" ]; then
    for u in "https://kaixinguor.com/${URL_PART}/web/${DATE}.html" "https://kaixinguor.com/${URL_PART}/web/${DATE}-en.html"; do
      CODE=""
      for attempt in 1 2 3; do
        CODE="$(curl -sL --max-time 20 -o /dev/null -w '%{http_code}' "$u" || true)"
        [ "$CODE" = "200" ] && break
        sleep 5
      done
      echo "  验收 $u -> ${CODE:-fail}" | tee -a "$LOG"
      [ "$CODE" = "200" ] || PROBLEM="${PROBLEM:+$PROBLEM；}线上未 200：$u -> ${CODE:-fail}"
    done
  fi

  if [ -n "$PROBLEM" ]; then
    "$NOTIFY" failure "${LABEL} ${DATE} 跑完但验收没过：${PROBLEM}（见 $LOG）" || true
    exit 5
  fi

  "$NOTIFY" success "${LABEL} ${DATE} 已发布（${MIN} 分） https://kaixinguor.com/${URL_PART}/${DATE}" || true
elif [ "$RC" -eq 124 ] || [ "$RC" -eq 137 ]; then
  "$NOTIFY" failure "${LABEL} ${DATE} 超时 ${MIN} 分被终止，见 $LOG" || true
else
  "$NOTIFY" failure "${LABEL} ${DATE} 失败 rc=${RC}（${MIN} 分），见 $LOG" || true
fi

exit "$RC"
