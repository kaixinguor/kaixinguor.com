#!/usr/bin/env bash
# 09:00 的 DSH 定时任务如果没跑成，10:30 的 watchdog 会检查当天日报是否存在。
# 服务器在 10:30 之后才开机时，systemd timer 的 Persistent=true 会立即补跑本脚本；
# 这里再等 15 分钟，给“开机后才开始生成”的任务留时间，避免误报。
#
# 用法：watchdog.sh
# 环境：SITE_DIR、STATE_DIR、NOTIFY
set -euo pipefail

SITE_DIR="${SITE_DIR:-/opt/kaixinguor/site}"
STATE_DIR="${STATE_DIR:-/var/lib/kaixinguor}"
NOTIFY="${NOTIFY:-/opt/kaixinguor/bin/notify.sh}"
TODAY="$(TZ=Asia/Shanghai date +%F)"
ZH="$SITE_DIR/daily/$TODAY.html"
EN="$SITE_DIR/daily/$TODAY-en.html"
MARKER="$STATE_DIR/watchdog-$TODAY"

mkdir -p "$STATE_DIR"

# 已经生成（中英文都在）就什么都不做
if [ -s "$ZH" ] && [ -s "$EN" ]; then
  exit 0
fi

# 最多等 15 分钟：3 次 × 5 分钟
for _ in 1 2 3; do
  sleep 300
  if [ -s "$ZH" ] && [ -s "$EN" ]; then
    exit 0
  fi
done

# 同一天只提醒一次，避免重启后重复轰炸
if [ -e "$MARKER" ]; then
  exit 0
fi
touch "$MARKER"

"$NOTIFY" failure "AI 日报 $TODAY 未生成。请检查：journalctl -u kaixinguor-dsh -n 120 --no-pager" || true
