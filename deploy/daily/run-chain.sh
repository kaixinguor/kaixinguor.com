#!/usr/bin/env bash
# 四份日报串行跑：上一份成功才跑下一份，任何一份失败就停并通知。
#
#   run-chain.sh                     # 从 AI 开始，AI → 经济 → 教育 → 心理
#   run-chain.sh education           # 从教育开始（前一份刚失败、修好后接着跑）
#
# 由 systemd timer 每天 08:00 调用（kaixinguor-daily-chain.timer）。
# 每份的细节（pull、超时、日志、验收、通知）都在 run-daily.sh 里，这里只负责排队和兜底。
set -uo pipefail

SITE_DIR="${SITE_DIR:-/opt/kaixinguor/site}"
LOG_DIR="${LOG_DIR:-/var/log/kaixinguor}"
NOTIFY="${NOTIFY:-/opt/kaixinguor/bin/notify.sh}"
RUN_ONE="${RUN_ONE:-/opt/kaixinguor/bin/run-daily.sh}"

ALL=(ai economy education psychology)
START="${1:-ai}"

case "$START" in
  ai|economy|education|psychology) ;;
  *) echo "用法：run-chain.sh [ai|economy|education|psychology]" >&2; exit 2 ;;
esac

DATE="$(TZ=Asia/Shanghai date +%F)"
mkdir -p "$LOG_DIR"
CHAIN_LOG="$LOG_DIR/chain-${DATE}.log"
ln -sfn "$CHAIN_LOG" "$LOG_DIR/chain-latest.log"

label_of() {
  case "$1" in
    ai)         echo "AI 日报" ;;
    economy)    echo "经济日报" ;;
    education)  echo "教育日报" ;;
    psychology) echo "心理学日报" ;;
  esac
}

# 从 START 开始，按固定顺序取子序列
QUEUE=()
REACHED=0
for s in "${ALL[@]}"; do
  [ "$s" = "$START" ] && REACHED=1
  [ "$REACHED" -eq 1 ] && QUEUE+=("$s")
done

TOTAL_START=$(date +%s)
echo "==> 链路开始 ${DATE} $(date '+%T')，队列：${QUEUE[*]}" | tee -a "$CHAIN_LOG"

for s in "${QUEUE[@]}"; do
  L="$(label_of "$s")"
  echo "==> 链路：开始 ${L}" | tee -a "$CHAIN_LOG"
  "$RUN_ONE" "$s"
  RC=$?
  if [ "$RC" -ne 0 ]; then
    echo "==> 链路：${L} 失败 rc=${RC}，后面的不跑了" | tee -a "$CHAIN_LOG"
    "$NOTIFY" failure "日报链路在「${L}」终止（rc=${RC}），后面几份今天不跑。
修好后可从该份接着跑：sudo -u kaixinguor /opt/kaixinguor/bin/run-chain.sh ${s}
过程见 ${LOG_DIR}/${s}-latest.log" || true
    exit "$RC"
  fi
done

MIN=$(( ($(date +%s) - TOTAL_START) / 60 ))
echo "==> 链路完成 ${DATE} $(date '+%T')，总用时 ${MIN} 分" | tee -a "$CHAIN_LOG"
"$NOTIFY" success "四份日报全部发布完成（${MIN} 分） https://kaixinguor.com/" || true
