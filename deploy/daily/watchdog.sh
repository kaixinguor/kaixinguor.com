#!/usr/bin/env bash
# 09:00 / 09:30 的 DSH 定时任务如果没跑成，10:30 的 watchdog 会检查当天两份日报是否存在。
# 服务器在 10:30 之后才开机时，systemd timer 的 Persistent=true 会立即补跑本脚本；
# 这里再等 15 分钟，给「开机后才开始生成」的任务留时间，避免误报。
#
# 检查两个版块：
#   AI 日报   → daily-ai/$TODAY.html       + daily-ai/$TODAY-en.html
#   经济日报 → daily-economy/$TODAY.html  + daily-economy/$TODAY-en.html
#
# 用法：watchdog.sh
# 环境：SITE_DIR、STATE_DIR、NOTIFY
set -euo pipefail

SITE_DIR="${SITE_DIR:-/opt/kaixinguor/site}"
STATE_DIR="${STATE_DIR:-/var/lib/kaixinguor}"
NOTIFY="${NOTIFY:-/opt/kaixinguor/bin/notify.sh}"
TODAY="$(TZ=Asia/Shanghai date +%F)"
MARKER="$STATE_DIR/watchdog-$TODAY"

mkdir -p "$STATE_DIR"

present() {
  [ -s "$SITE_DIR/$1/$TODAY.html" ] && [ -s "$SITE_DIR/$1/$TODAY-en.html" ]
}

# 今天还缺哪些版块，用「、」分隔；都齐了返回空串
missing() {
  local out=""
  present daily-ai || out="AI 日报"
  if ! present daily-economy; then
    if [ -z "$out" ]; then out="经济日报"; else out="${out}、经济日报"; fi
  fi
  printf '%s' "$out"
}

# 都生成了就什么都不做
[ -z "$(missing)" ] && exit 0

# 最多等 15 分钟：3 次 × 5 分钟
for _ in 1 2 3; do
  sleep 300
  [ -z "$(missing)" ] && exit 0
done

# 同一天只提醒一次，避免重启后重复轰炸
if [ -e "$MARKER" ]; then
  exit 0
fi
touch "$MARKER"

GAP="$(missing)"
"$NOTIFY" failure "日报未生成：${GAP}（${TODAY}）。请检查：journalctl -u kaixinguor-dsh -n 120 --no-pager" || true
