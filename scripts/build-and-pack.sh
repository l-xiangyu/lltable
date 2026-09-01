#!/usr/bin/env bash
# Jenkins 打包用。装依赖、编译、打出带 node_modules 的部署包，服务器不用再来一遍 install。
# ./scripts/build-and-pack.sh              -> dist/
# ./scripts/build-and-pack.sh package      -> tar.gz
# 在 Linux 上打，和服务器系统要对上。

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
OUT_NAME="Teable-built-$(date +%Y%m%d-%H%M).tar.gz"

# prisma generate 要从网下二进制，国内用这个镜像
export PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma

# 第一个参数是 package 就打 tar，否则落到 dist 目录
PACK_MODE=dist
OUT_FILE=""
if [ "${1:-}" = "package" ]; then
  PACK_MODE=package
  OUT_FILE="${2:-$ROOT/$OUT_NAME}"
fi

# 下面这些会原样带到服务器
DEPLOY_ITEMS=(
  node_modules
  apps
  packages
  plugins
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  .npmrc
  .husky
  scripts/deploy-on-server.sh
)

# 排除部分不打包到dist
TAR_EXCLUDES=(
  --exclude='.pnpm-store'
  --exclude='.cache'
  --exclude='.git'
  --exclude='.env.local'
  --exclude='.env.*.local'
  --exclude='*.tar.gz'
  --exclude='dist'
)

echo "[1/5] 安装依赖"
pnpm install --registry https://registry.npmmirror.com --frozen-lockfile

echo "[2/5] 构建 packages"
# openapi、core 这些公共包，后端编译依赖它们的 dist
pnpm run build:packages

echo "[3/5] 构建 nextjs-app"
NODE_ENV=production pnpm -C apps/nextjs-app build

echo "[4/5] 构建 nestjs-backend"
NODE_ENV=production pnpm -C apps/nestjs-backend build

echo "[5/5] 校验依赖"
# 从后端启动目录测，和 pm2 跑 dist/index.js 时找包的路径一致；别在仓库根目录 require，pnpm 子包依赖根上解析不到
cd "$ROOT/apps/nestjs-backend"
node -e "require('@teable/openapi')"
cd "$ROOT"

if [ "$PACK_MODE" = "package" ]; then
  echo "[生成] 生成压缩包"
  tar "${TAR_EXCLUDES[@]}" -czf "$OUT_FILE" "${DEPLOY_ITEMS[@]}"
  echo "[完成] $OUT_FILE"
else
  echo "[生成] 生成至dist目录"
  DIST_DIR="$ROOT/dist"
  rm -rf "$DIST_DIR"
  mkdir -p "$DIST_DIR/scripts"
  for item in "${DEPLOY_ITEMS[@]}"; do
    if [ "$item" = "scripts/deploy-on-server.sh" ]; then
      cp -a "$ROOT/$item" "$DIST_DIR/scripts/"
    else
      cp -a "$ROOT/$item" "$DIST_DIR/"
    fi
  done
fi
