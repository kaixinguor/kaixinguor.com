#!/usr/bin/env bash
# 在服务器上安装日报自动化（幂等，可重复跑）。
#
#   sudo bash deploy/daily/install-server.sh
#
# 做四件事：
#   1. 脚本 → /opt/kaixinguor/bin
#   2. 提示词 → /opt/kaixinguor/prompts
#   3. systemd 单元 → /etc/systemd/system，启用 4 个 timer + watchdog
#   4. 打印状态
#
# 前置：Node 24 + dsh 已装；用户 kaixinguor 存在；仓库在 /opt/kaixinguor/site；
#       /etc/kaixinguor/dsh.env 有 DEEPSEEK_API_KEY。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
USER_NAME=kaixinguor
BIN=/opt/kaixinguor/bin
PROMPTS=/opt/kaixinguor/prompts

[ "$(id -u)" -eq 0 ] || { echo "需要 root：sudo bash deploy/daily/install-server.sh" >&2; exit 1; }

echo "==> 安装脚本到 $BIN"
install -d -o "$USER_NAME" -g "$USER_NAME" "$BIN" "$PROMPTS" /var/log/kaixinguor
for f in notify.sh watchdog.sh sync-site.sh run-daily.sh; do
  install -m 755 -o "$USER_NAME" -g "$USER_NAME" "$ROOT/deploy/daily/$f" "$BIN/$f"
done

echo "==> 安装提示词到 $PROMPTS"
for f in "$ROOT"/deploy/daily/prompts/*.txt; do
  install -m 644 -o "$USER_NAME" -g "$USER_NAME" "$f" "$PROMPTS/$(basename "$f")"
done

echo "==> 安装技能到 $WORKSPACE/.dsh/skills"
WORKSPACE="${WORKSPACE:-/opt/kaixinguor/site}"
install -d -o "$USER_NAME" -g "$USER_NAME" "$WORKSPACE/.dsh/skills/kaixinguor-daily"
install -m 644 -o "$USER_NAME" -g "$USER_NAME" \
  "$ROOT/deploy/daily/skills/kaixinguor-daily/SKILL.md" \
  "$WORKSPACE/.dsh/skills/kaixinguor-daily/SKILL.md"

echo "==> 安装 systemd 单元"
install -m 644 "$ROOT/deploy/daily/kaixinguor-daily@.service" /etc/systemd/system/
install -m 644 "$ROOT"/deploy/daily/kaixinguor-daily@*.timer /etc/systemd/system/
install -m 644 "$ROOT/deploy/daily/kaixinguor-dsh.service" /etc/systemd/system/
install -m 644 "$ROOT/deploy/daily/kaixinguor-watchdog.service" /etc/systemd/system/
install -m 644 "$ROOT/deploy/daily/kaixinguor-watchdog.timer" /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now kaixinguor-daily@ai.timer kaixinguor-daily@economy.timer \
  kaixinguor-daily@education.timer kaixinguor-daily@psychology.timer \
  kaixinguor-watchdog.timer

echo "==> 下次运行时间"
systemctl list-timers 'kaixinguor-*' --no-pager || true

echo "==> 检查 DSH Web（默认不随开机启动，排障时手动 start）"
systemctl is-enabled kaixinguor-dsh.service 2>/dev/null || true
systemctl is-active kaixinguor-dsh.service 2>/dev/null || true

echo
echo "完成。手动试跑一份："
echo "  sudo systemctl start kaixinguor-daily@ai.service"
echo "  journalctl -u kaixinguor-daily@ai.service -f"
echo "  tail -f /var/log/kaixinguor/ai-latest.log"
