# LLTable

开源多维表格与指标协同平台。在字段、视图、公式、协作等通用表格能力之上，提供与业务系统联动的指标映射、引用下钻、受控编辑回写与 AI 辅助填表能力，适合需要跨系统维护指标、穿透分析与合规协同的场景。

## Features

- **多维表格基础能力**：多字段类型、多视图、公式、查找、汇总与实时协作
- **业务系统双向联动**：表格中维护的数据可回写业务系统，形成「表格编辑、系统生效」闭环
- **引用与递归下钻**：按引用关系自动创建关联表，支持多层级穿透展开
- **主数据驱动建表**：以指标 / 字段定义为源，自动映射为表格字段模型；口径变更后结构可跟随更新
- **受控协同编辑**：只读 / 可编辑等模式，结合权限校验与操作审计，兼顾协同与合规
- **AI 辅助填表**：上传文件后由大模型识别并填写指标，降低手工录入成本
- **信创与国产化部署**：支持国产数据库读写回写与国产化环境部署

## Tech Stack

| 层级 | 技术 |
| --- | --- |
| 前端 | Next.js、React、TypeScript |
| 后端 | NestJS、Prisma |
| 数据 | PostgreSQL、Redis |
| 工程 | pnpm monorepo、Node.js 20 |

## Requirements

- Node.js **v20.20.0**（推荐使用 nvm）
- pnpm ≥ 9.13.0
- PostgreSQL
- Redis

## Quick Start

```bash
# 克隆仓库
git clone https://github.com/l-xiangyu/lltable.git
cd lltable

# 使用项目约定的 Node 版本
nvm use

# 安装依赖
pnpm install

# 配置环境变量（优先）
cp apps/nextjs-app/.env.development apps/nextjs-app/.env.development.local
# 编辑 .env.development.local，至少配置：
#   PRISMA_DATABASE_URL
#   PUBLIC_DATABASE_PROXY
#   PUBLIC_ORIGIN=http://localhost:3000

# 创建数据库（示例）
# CREATE DATABASE lltable;

# 生成 Prisma Client 并执行迁移
bash scripts/setup-and-migrate.sh

# 启动（NestJS 会自动挂载 Next.js，无需单独起前端）
cd apps/nestjs-backend
pnpm dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

### 关键环境变量

| 变量 | 说明 |
| --- | --- |
| `PRISMA_DATABASE_URL` | PostgreSQL 连接串 |
| `PUBLIC_DATABASE_PROXY` | 数据库代理地址（host:port） |
| `PORT` | HTTP 端口，默认 `3000` |
| `SOCKET_PORT` | WebSocket 端口，默认 `3001` |
| `PUBLIC_ORIGIN` | 对外访问地址 |
| `NEXTJS_DIR` | Next 应用相对路径，默认 `../nextjs-app` |

## Development

日常启动：

```bash
nvm use
cd apps/nestjs-backend
pnpm dev
```

Debug：

```bash
cd apps/nestjs-backend
pnpm start-debug
# 再在 IDE 中 F5 附加调试器
```

### 常见问题

| 现象 | 处理 |
| --- | --- |
| `The table public.space does not exist` | 执行 `bash scripts/setup-and-migrate.sh` |
| 数据库连接失败 | 检查 Postgres 与 `PRISMA_DATABASE_URL` / `PUBLIC_DATABASE_PROXY` |
| 端口 3000 被占用 | `lsof -i:3000` 结束进程，或修改 `PORT` |

### AI 配置（可选）

管理员登录后访问 `/admin/setting`，在 **LLM API** 中配置服务商（如 OpenAI 兼容接口、通义等）、模型与 API Key，并启用 AI。配置写入实例设置，无需在代码中硬编码密钥。

## Project Structure

```
apps/
  nestjs-backend/   # API、鉴权、WebSocket、业务适配
  nextjs-app/       # Web 前端
packages/           # 共享包（SDK、UI、数据库 Schema 等）
plugins/            # 插件
scripts/            # 迁移与辅助脚本
```

## Contributing

- Commit message 需符合 [Conventional Commits](https://www.conventionalcommits.org/)（如 `feat:`、`fix:`），由 `commitlint.config.js` 校验
- 提交前会跑 husky / lint-staged；失败时按提示修复后再提交

## License

[AGPL-3.0](./AGPL_LICENSE)
