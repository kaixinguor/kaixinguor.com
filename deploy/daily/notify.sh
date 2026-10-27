#!/usr/bin/env bash
# 发送 AI 日报通知。成功/失败都不应该反过来影响日报任务，所以每个通道都 || true。
#
# 用法：
#   notify.sh success "AI 日报 2026-10-27 已发布：https://kaixinguor.com/"
#   notify.sh failure "AI 日报 2026-10-27 生成失败，详见 journalctl -u kaixinguor-dsh"
#
# 配置：/etc/kaixinguor/notify.env（权限 600），支持以下任意组合：
#   BARK_URL=https://api.day.app/<key>/
#   NTFY_URL=https://ntfy.sh/<random-topic>
#   FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/...
#   TELEGRAM_BOT_TOKEN=...
#   TELEGRAM_CHAT_ID=...
#
set -uo pipefail

STATUS="${1:-info}"
shift || true
MESSAGE="${*:-AI Daily notification}"
ENV_FILE="${KAIXINGUOR_NOTIFY_ENV:-/etc/kaixinguor/notify.env}"
TITLE="AI 日报 · ${STATUS}"

if [ -r "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a
  . "$ENV_FILE"
  set +a
fi

json_escape() {
  if command -v jq >/dev/null 2>&1; then
    jq -nc --arg t "$TITLE" --arg b "$MESSAGE" '{title:$t,body:$b}'
  else
    # 没有 jq 时至少保证 JSON 字符串合法；只用于 Bark 通道。
    local t b
    t=$(printf '%s' "$TITLE" | sed 's/\\/\\\\/g; s/"/\\"/g')
    b=$(printf '%s' "$MESSAGE" | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf '{"title":"%s","body":"%s"}' "$t" "$b"
  fi
}

# Bark（iPhone，国内可直接用）
if [ -n "${BARK_URL:-}" ]; then
  curl -fsS --max-time 10 -X POST "$BARK_URL" \
    -H 'Content-Type: application/json' \
    -d "$(json_escape)" >/dev/null 2>&1 || true
fi

# ntfy（Android/iOS/网页均可；topic 当密码用，别用可猜的名字）
if [ -n "${NTFY_URL:-}" ]; then
  curl -fsS --max-time 10 \
    -H "Title: ${TITLE}" \
    -H "Tags: robot" \
    -H "Priority: ${NTFY_PRIORITY:-default}" \
    -d "$MESSAGE" "$NTFY_URL" >/dev/null 2>&1 || true
fi

# 飞书自定义机器人（国内团队常用）
if [ -n "${FEISHU_WEBHOOK:-}" ]; then
  if command -v jq >/dev/null 2>&1; then
    PAYLOAD=$(jq -nc --arg t "$TITLE" --arg b "$MESSAGE" \
      '{msg_type:"text",content:{text:($t + "\n" + $b)}}')
  else
    PAYLOAD=$(printf '{"msg_type":"text","content":{"text":"%s\\n%s"}}' \
      "$(printf '%s' "$TITLE" | sed 's/\\/\\\\/g; s/"/\\"/g')" \
      "$(printf '%s' "$MESSAGE" | sed 's/\\/\\\\/g; s/"/\\"/g')")
  fi
  curl -fsS --max-time 10 -H 'Content-Type: application/json' \
    -d "$PAYLOAD" "$FEISHU_WEBHOOK" >/dev/null 2>&1 || true
fi

# Telegram（需要服务器能访问 api.telegram.org）
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  curl -fsS --max-time 10 -X POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${TITLE}"$'\n'"${MESSAGE}" >/dev/null 2>&1 || true
fi

# 同时写 syslog，方便排查“到底发没发”
if command -v logger >/dev/null 2>&1; then
  logger -t kaixinguor-notify -- "$STATUS: $MESSAGE" 2>/dev/null || true
fi

exit 0
