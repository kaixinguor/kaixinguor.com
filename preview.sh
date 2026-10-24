#!/bin/bash
# 本地预览官网：起一个静态服务并打开浏览器。
# 双击 index.html 也可以看，但用这个更接近线上效果。
set -e
cd "$(dirname "$0")"
PORT="${1:-8899}"
echo "→ http://127.0.0.1:$PORT/"
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
sleep 1
open "http://127.0.0.1:$PORT/"
echo "预览中… 按 Ctrl+C 停止"
trap 'kill $SERVER_PID 2>/dev/null' EXIT
wait $SERVER_PID
