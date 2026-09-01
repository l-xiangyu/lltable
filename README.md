# Teable 本地配置与启动指南

按下面步骤操作即可完成配置并启动项目。**只需启动一次（后台），前后台会一起跑。**

---

## 一、前后台是怎么跑的？

- **只启动一个服务**：在 `apps/nestjs-backend` 里执行 `pnpm dev`。
- **后台（NestJS）**：提供 API、数据库、WebSocket 等。
- **前台（Next.js）**：由后台在启动时通过 `NextService` 自动创建并挂载，**不需要单独起前台**。
- 访问 **http://localhost:3000** 即可使用完整应用（页面 + 接口）。

---

## 二、环境要求

| 项目     | 要求                          |
|----------|-------------------------------|
| Node.js  | 使用 **v20.20.0**（见下方说明） |
| pnpm     | ≥ 9.13.0                      |
| PostgreSQL | 已安装并可连接，库名为 `teable` |

**Node 版本说明**：本项目用 **Node v20.20.0**，通过 `nvm use v20.20.0` 切换，**只影响当前终端，不会改你的 nvm 默认版本**。

---

## 三、当前配置一览

### 1. Node 版本（.nvmrc）

- 路径：项目根目录 **`.nvmrc`**
- 内容：`20.20.0`
- 作用：在项目目录执行 `nvm use` 时会用到，仅当前终端生效。

### 2. 开发环境变量

- 主配置：**`apps/nextjs-app/.env.development.local`**（优先）
- 备选：**`apps/nextjs-app/.env.development`**
- 后端和 Prisma 都会从上述文件读取配置（尤其是 `PRISMA_DATABASE_URL`）。

### 3. 关键环境变量说明（.env.development.local）

| 变量 | 说明 | 当前示例值 |
|------|------|------------|
| `PRISMA_DATABASE_URL` | 数据库连接串 | `postgresql://postgres:123456@192.168.1.106:5432/teable?schema=public&statement_cache_size=1` |
| `PUBLIC_DATABASE_PROXY` | 数据库代理地址 | `192.168.1.106:5432` |
| `PORT` | 服务端口 | `3000` |
| `SOCKET_PORT` | WebSocket 端口 | `3001` |
| `PUBLIC_ORIGIN` | 前端访问地址 | `http://localhost:3000` |
| `NEXTJS_DIR` | Next 应用目录（相对后端） | `../nextjs-app` |

若数据库在本机，可把 `192.168.1.106` 改为 `localhost`。

### 4. 一键脚本

- 路径：**`scripts/setup-and-migrate.sh`**
- 作用：使用 Node v20.20.0，读取上面 env 中的 `PRISMA_DATABASE_URL`，执行 **Prisma generate + 数据库迁移**。

---

## 四、一步一步操作（首次 + 日常）

### 首次：安装依赖 + 配置 + 迁移 + 启动

1. **进入项目根目录**
   ```bash
   cd /Users/skysx/Downloads/teable-develop
   ```

2. **（可选）切 Node 版本（仅当前终端）**
   ```bash
   nvm use v20.20.0
   ```
   或直接：`nvm use`（会读根目录 `.nvmrc` 的 20.20.0）。

3. **安装依赖**
   ```bash
   pnpm install
   ```

4. **确认/编辑环境变量**
   - 确保存在 **`apps/nextjs-app/.env.development.local`**（没有则从 `apps/nextjs-app/.env.development` 复制一份）。
   - 根据你的 Postgres 地址/密码，修改其中的 `PRISMA_DATABASE_URL` 和 `PUBLIC_DATABASE_PROXY`（本地数据库可改为 `localhost`）。

5. **创建数据库（若尚未创建）**
   - 在 PostgreSQL 里执行：`CREATE DATABASE teable;`

6. **执行迁移（生成 Prisma Client + 建表）**
   ```bash
   bash scripts/setup-and-migrate.sh
   ```
   脚本里会自动用 Node v20.20.0（若已加载 nvm），并读取 `.env.development.local` 里的 `PRISMA_DATABASE_URL`。

7. **启动项目（前后台一起）**
   ```bash
   nvm use v20.20.0   # 若新开终端，再切一次
   cd apps/nestjs-backend
   pnpm dev
   ```

8. **浏览器访问**
   - 打开：**http://localhost:3000**

---

### 日常：只启动项目

1. 进入项目根目录，切 Node（仅当前终端）：
   ```bash
   cd /Users/skysx/Downloads/teable-develop
   nvm use v20.20.0
   ```
2. 启动：
   ```bash
   cd apps/nestjs-backend
   pnpm dev
   ```
3. Debug启动:
   ```
   # 切换node版本(可选)
   nvm use v20.20.0
   # 进入后台目录
   cd apps/nestjs-backend
   # 断点启动
   pnpm start-debug
   # 执行后点击F5挂到工具监听服务
   ```
3. 访问：**http://localhost:3000**

---

## 五、常见问题

| 现象 | 处理 |
|------|------|
| `The table public.space does not exist` | 未做迁移，执行：`bash scripts/setup-and-migrate.sh` |
| 数据库连接失败 | 检查 Postgres 是否启动、`PRISMA_DATABASE_URL` / `PUBLIC_DATABASE_PROXY` 的 host/端口/密码 |
| 端口 3000 被占用 | `lsof -i:3000` 查进程并结束，或改 `.env.development.local` 里的 `PORT` |
| 不想用 nvm 改默认版本 | 只在需要跑本项目的终端里执行 `nvm use v20.20.0` 即可，不会改 default |

---

## 六、小结

- **配置**：主要看 **`apps/nextjs-app/.env.development.local`**，尤其是数据库相关。
- **迁移**：首次或表结构变更后执行 **`bash scripts/setup-and-migrate.sh`**。
- **启动**：只跑 **`cd apps/nestjs-backend && pnpm dev`**，**前后台都会起来**，浏览器访问 http://localhost:3000 即可。

---

## 七、AI 功能与配置

### 为何目前看不到 AI 聊天？

1. **AI 聊天面板未渲染**：表格页里的 AI 聊天面板（ChatPanel）在当前代码中被注释掉了（`apps/nextjs-app/src/features/app/blocks/table/Table.tsx` 中 `{/* <ChatPanel /> */}`），且 ChatPanel 组件已不在仓库中，因此**表格右侧不会出现 AI 聊天入口**。若要恢复，需要自行实现或从其他分支恢复 ChatPanel 并取消注释。
2. **必须先配置 AI**：即使用户端有入口，后端也要求先完成「AI 配置」才会返回可用状态（见下方）。

### 如何开启 AI、在哪配置 API？

AI 能力由**实例级配置**控制，需要**管理员账号**在**管理后台**里配置。

| 步骤 | 说明 |
|------|------|
| 1. 管理员入口 | 用**管理员账号**登录后，在空间切换器或侧边栏进入 **「管理」/ 管理后台**，或直接访问：**http://localhost:3000/admin/setting** |
| 2. 配置清单 | 在设置页右侧「配置清单」中有一项 **「LLM API」**，点击会跳转到 AI 配置（已重定向到同一设置页）。 |
| 3. AI 配置入口 | 若项目中有独立的 AI 设置页，地址一般为 **http://localhost:3000/admin/ai-setting**（当前已重定向到 `/admin/setting`）。 |

**AI API 配置内容（在管理后台中完成）：**

- **方式一：AI Gateway（推荐）**  
  - 填写 **AI Gateway API Key**（如 Vercel AI Gateway）。  
  - 在「模型池」中启用要用的模型。  
  - 在「默认模型」里为**聊天**选一个模型（如大模型）。

- **方式二：自定义 LLM 提供商**  
  - 添加 LLM 提供商：类型（如 OpenAI）、名称、**Base URL**、**API Key**，以及可用模型列表。  
  - 同样在「默认模型」里为**聊天**选择模型。

- **开启 AI**：在配置里勾选「启用 AI」并保存。

配置会通过 **`/api/admin/setting`** 的 `updateSetting` 写入实例的 `aiConfig`（含 `llmProviders` / `aiGatewayApiKey`、`gatewayModels`、`chatModel`、`enable` 等），**无需在 .env 里配置 OPENAI 环境变量**（新版统一走管理后台的 aiConfig）。

### 环境变量说明（可选 / 旧版）

- 代码中曾有一个**旧的聊天代理**（`apps/nestjs-backend/src/features/chat/chat.service.ts`）依赖环境变量：  
  `OPENAI_API_ENDPOINT`、`OPENAI_API_KEY`。  
- 当前主流程的 **AI 生成与聊天**走的是 **AiService** 和上述**管理后台的 aiConfig**，**不需要**在 `apps/nextjs-app/.env.development.local` 里配置这两个变量即可使用新 AI 功能。  
- 若你使用或保留了基于 `chat.service` 的接口，则需在**后端**读取到的环境里配置：  
  - `OPENAI_API_ENDPOINT`：例如 `https://api.openai.com`  
  - `OPENAI_API_KEY`：你的 OpenAI API Key  

### LLM 在页面上如何配置（含阿里云通义）

在 **管理后台 → 设置**（http://localhost:3000/admin/setting）页面中，已提供 **「LLM API」** 配置区块：

1. 在设置页面向下滚动到 **「LLM API」** 区块（或从右侧配置清单点击「LLM API」下的「前往设置」）。
2. 选择 **「自定义模型」**（Custom Model）模式（不选 AI Gateway 时即为自定义）。
3. 点击 **「添加服务商」**，在列表中选择需要的厂商并填写：
   - **阿里云通义（Qwen）**：服务商选 **「Qwen」**；  
     - **Base URL**：`https://dashscope.aliyuncs.com/compatible-mode/v1`（已预填）；  
     - **API Key**：填写阿里云 DashScope 的 API Key（在阿里云控制台开通灵积模型服务后获取）；  
     - **模型**：填写模型名，如 `qwen-turbo`、`qwen-plus`、`qwen-max`，多个用英文逗号分隔。
   - **其他兼容 OpenAI 的厂商**：可选 **「OpenAI Compatible」**，填写该厂商的 Base URL 和 API Key、模型列表。
4. 在 **「模型池」** 中确认已添加的模型可用。
5. 在 **「默认模型」** 中为 **「高级聊天模型」** 选择一个模型（如 `qwen-plus`）。
6. 打开 **「启用 AI」** 开关并保存。

保存后，AI 对话、AI 字段、自动化等将使用你配置的 LLM。**无需在代码或 .env 中配置**。

### 若管理后台没有 AI 配置表单

若你使用的构建中设置页没有「LLM API」配置区块，可以：

- 使用 **API** 更新实例配置：`PATCH /api/admin/setting`，body 中传 `aiConfig`（需管理员鉴权）。  
- 或查看你是否在使用带「空间 → 集成 → AI」的定制版本（如 Cloud/EE），在空间设置的集成里配置。

### 应用构建器（v0 API）

- **提示含义**：若看到「您尚未配置 v0 API，应用构建器功能将无法使用，前往设置」，表示**尚未配置** v0 API Key，应用构建器功能不可用。
- **配置方式**：点击 **「前往设置」** 会跳转到管理后台设置页并滚动到「应用构建器」区块；在该区块内可直接填写 **v0 API 密钥**（及可选的 v0 API 代理地址），失焦或点击「保存」后即写入实例配置（`appConfig`）。无需在代码或 .env 中配置。
- **获取密钥**：需在 [v0 设置](https://v0.dev/chat/settings/keys) 获取 API 密钥（v0 付费订阅）。官方说明见 [Help - AI Settings - App Builder](https://help.teable.ai/en/basic/admin-panel/ai-setting#7-app-builder)。

### LLM 是否要在代码里配置？

**不需要。** LLM（AI 对话、AI 字段、自动化等）均在**管理后台**或 **API** 中配置，无需改代码：

- 在管理后台设置页完成 **LLM API / AI 配置**（见上文「如何开启 AI」）。  
- 若当前构建没有 LLM 配置表单，可用 `PATCH /api/admin/setting` 传 `aiConfig` 进行配置。  
配置后即可使用，无需在项目代码或环境变量里写死 API Key（除非使用旧的 chat 代理接口）。

### 如何确认 LLM 是否被请求？

1. **浏览器开发者工具**  
   - 打开 DevTools（F12）→ **Network（网络）**，筛选 **Fetch/XHR**。  
   - 能触发真实 LLM 调用的接口是：**`/api/{baseId}/ai/generate-stream`**（POST，流式返回）。  
   - 若你点了会发 AI 请求的入口（见下），应看到该请求，状态 200 且 Response 里逐步有文本。  
   - 另外会有 **`/api/{baseId}/ai/config`**（GET）用于读取 AI 配置，不直接调 LLM。

2. **后端终端日志**  
   - 当有请求命中 **流式生成** 时，后端会打一条日志，例如：  
     `[AiService] [AI] generateStream requested, baseId=xxx, promptLength=xx`  
   - 在运行 `pnpm dev` 的终端里看到这条，说明请求已到达并开始用你配置的模型生成。

3. **哪些功能会真的调 LLM？**  
   - **已实现并会请求 LLM**：任何调用 **`/api/:baseId/ai/generate-stream`** 的前端功能（例如若启用了 AI 聊天面板，对话就会走这里）。  
   - **AI 填充单格（同步）**：表格里单元格旁的 **「刷新」按钮** 调用 **`POST /api/table/{tableId}/record/{recordId}/{fieldId}/auto-fill`**。该接口会读取字段的 AI 配置与提示词、调用 `AiService.generateText` 生成内容、写回单元格，并返回 `{ taskId: 'sync', value: '...' }`，前端会立即用返回的 `value` 做乐观展示。

### 为什么点击「刷新」没有 AI 生成结果？

若已配置 Base 的 AI 模型且字段已设置「AI 提取」提示词，点击单元格旁的 **刷新图标（↻）** 会：

- **接口**：`POST /api/table/{tableId}/record/{recordId}/{fieldId}/auto-fill`  
- **行为**：根据提示词（支持 `{字段ID}` 引用同记录其他字段）调用 LLM 生成文本，写回该单元格，并返回 `{ taskId: 'sync', value: '生成的内容' }`，前端会立即显示返回的 `value`。

若仍无结果，请检查：1）Base 是否已配置 AI 模型；2）该字段是否配置了「AI 提取」提示词；3）后端日志是否有报错。  
**流式生成**（`/api/:baseId/ai/generate-stream`）用于 AI 对话等场景；若恢复 AI 聊天面板并发送消息，可在 Network 里看到对 `generate-stream` 的请求，并在终端看到 `[AI] generateStream requested` 日志。

---

## 八、补充
- 启动前请确保已安装了 `redis` 和 `postgres`，可以本地安装或 Docker 安装。
- 清库方法(慎重): pnpm -F @teable/db-main-prisma prisma-migrate-reset --schema ./prisma/postgres/schema.prisma


## 代码提交:
- 1. 目前严格按照 配置文件 commitlint.config.js 校验的
- 2. 提交分支必须含 fix:  feat: .... 前缀
- 3. 提交失败. 需要检查错误. 有规则校验