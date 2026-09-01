#!/usr/bin/env bash
# Teable 本地开发：配置 + 数据库迁移
# 在项目根目录执行：bash scripts/setup-and-migrate.sh
# 仅在本脚本/本终端使用 Node v20.20.0，不会修改 nvm 默认版本

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 使用 Node v20.20.0（仅当前 shell，不改默认）
if [ -n "$NVM_DIR" ] && [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  nvm use v20.20.0 2>/dev/null || nvm use 20.20.0
fi

# 从 nextjs-app 加载 PRISMA_DATABASE_URL
ENV_FILE=""
[ -f "apps/nextjs-app/.env.development.local" ] && ENV_FILE="apps/nextjs-app/.env.development.local"
[ -z "$ENV_FILE" ] && [ -f "apps/nextjs-app/.env.development" ] && ENV_FILE="apps/nextjs-app/.env.development"
if [ -n "$ENV_FILE" ]; then
  export PRISMA_DATABASE_URL=$(grep -E '^PRISMA_DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | head -1)
fi

if [ -z "$PRISMA_DATABASE_URL" ]; then
  echo "错误: 未找到 PRISMA_DATABASE_URL，请检查 apps/nextjs-app/.env.development.local 或 .env.development"
  exit 1
fi

echo ">>> 1. 生成 Prisma Client..."
cd packages/db-main-prisma
pnpm prisma generate --schema=./prisma/postgres/schema.prisma

echo ">>> 2. 执行数据库迁移..."
pnpm prisma migrate deploy --schema=./prisma/postgres/schema.prisma

cd "$ROOT"
echo ">>> 迁移完成。"
echo ">>> 启动项目（请先在本终端执行 nvm use v20.20.0，不会改默认版本）："
echo "    cd apps/nestjs-backend && pnpm dev"
