#!/usr/bin/env bash
# 启动脚本：./deploy-on-server.sh test|production
# test 用 .env.test、占 2999；production 用 .env.production、占 3000
# 重启时只停"本环境"的旧进程：靠进程标记 TEABLE_RUN_ENV 识别，端口兜底，绝不动另一个环境

set -euo pipefail

cd "$(dirname "$0")/.."

# 参数决定环境和端口，其他一律报错
case "${1:-}" in
  test)            ENV=test;       PORT=2999 ;;
  production|prod) ENV=production; PORT=3000 ;;
  *) echo "用法: $0 test|production" >&2; exit 1 ;;
esac

# 代码在 dist 里；日志、pid 放在 dist 外层，避免同步 dist 时被删
BASE_DIR="/jbs/project/"
case "$ENV" in
  test)       BASE_DIR+="llTeablTest" ;;
  production) BASE_DIR+="llTeablProd" ;;
esac
ROOT="$BASE_DIR/dist"

echo "基础路径: $BASE_DIR"
echo "代码路径: $ROOT"

# node：优先 NODE_BIN，否则用 PATH 里的
NODE_BIN="${NODE_BIN:-$(command -v node 2>/dev/null || true)}"
[ -x "$NODE_BIN" ] || { echo "找不到 node，可设置 NODE_BIN" >&2; exit 1; }
# dotenv-flow 内部还会调 node，得让它在 PATH 里
export PATH="$(dirname "$NODE_BIN"):$PATH"

DOTENV_FLOW="$ROOT/apps/nextjs-app/node_modules/.bin/dotenv-flow"
BACKEND="$ROOT/apps/nestjs-backend"
LOG_DIR="${LOG_DIR:-$BASE_DIR/logs}"
LOG="$LOG_DIR/lltable-$ENV.log"
PIDFILE="$LOG_DIR/lltable-$ENV.pid"

# 启动前检查
[ -f "$ROOT/apps/nextjs-app/.env.$ENV" ] || { echo "缺少 .env.$ENV" >&2; exit 1; }
[ -x "$DOTENV_FLOW" ]                     || { echo "缺少 dotenv-flow" >&2; exit 1; }
[ -f "$BACKEND/dist/index.js" ]           || { echo "缺少 dist/index.js" >&2; exit 1; }
mkdir -p "$LOG_DIR"

# 查占用指定端口的进程号
port_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:"$1" 2>/dev/null || true
  else
    ss -lntp 2>/dev/null | grep ":$1 " | grep -oP 'pid=\K[0-9]+' || true
  fi
}

# 读进程的环境标记 TEABLE_RUN_ENV 的值，读不到返回空
marker_of() {
  [ -r "/proc/$1/environ" ] || return 0
  tr '\0' '\n' < "/proc/$1/environ" 2>/dev/null | sed -n 's/^TEABLE_RUN_ENV=//p' | head -1 || true
}

# 停一个进程：先正常停，停不掉再强杀
stop_pid() {
  kill "$1" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    kill -0 "$1" 2>/dev/null || return 0
    sleep 1
  done
  kill -9 "$1" 2>/dev/null || true
}

# 待停的候选进程：本环境端口上的 + pid 文件里记的，去重
CANDIDATES="$(port_pids "$PORT")"
[ -f "$PIDFILE" ] && CANDIDATES="$CANDIDATES $(cat "$PIDFILE" 2>/dev/null || true)"

for pid in $(echo "$CANDIDATES" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -u || true); do
  kill -0 "$pid" 2>/dev/null || continue
  MARK="$(marker_of "$pid")"
  if [ "$MARK" = "$ENV" ] || [ -z "$MARK" ]; then
    # 带本环境标记的，或老的没标记进程（该端口本就是本环境专用），停掉
    echo "[$ENV] 停止旧进程 PID=$pid"
    stop_pid "$pid"
  else
    # 带了别的环境标记，绝不动
    echo "[$ENV] 跳过 PID=$pid（属于 $MARK 环境，不处理）" >&2
  fi
done
rm -f "$PIDFILE"

# 端口仍被占就别启动，避免起两个
if [ -n "$(port_pids "$PORT")" ]; then
  echo "[$ENV] 端口 $PORT 仍被占用，已退出，请人工确认: $(port_pids "$PORT")" >&2
  exit 1
fi

# 启动：
#  TEABLE_RUN_ENV=$ENV 给进程打标记，重启时据此只认本环境
#  外层 NODE_ENV=$ENV 让 dotenv-flow 读 .env.$ENV
#  内层 NODE_ENV=production 是应用运行模式
cd "$BACKEND"
nohup env TEABLE_RUN_ENV="$ENV" NODE_ENV="$ENV" "$DOTENV_FLOW" -p "$ROOT/apps/nextjs-app" -- \
  env NODE_ENV=production "$NODE_BIN" dist/index.js >>"$LOG" 2>&1 &

# 等端口起来，把真正监听的进程号写进 pid 文件
for _ in $(seq 1 100); do
  sleep 1
  RUNNING="$(port_pids "$PORT")"
  if [ -n "$RUNNING" ]; then
    echo "$RUNNING" | tr ' ' '\n' | grep -E '^[0-9]+$' | head -1 > "$PIDFILE" || true
    echo "[$ENV] 已启动，端口 $PORT，PID $RUNNING，日志 $LOG"
    exit 0
  fi
done

echo "[$ENV] 启动未确认，端口 $PORT 没监听，看日志: tail -50 $LOG" >&2
exit 1
