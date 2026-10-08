# Orbit

一个 AI 原生、可自托管的工作事项系统。自然语言捕捉意图，四象限分配注意力，项目连接行动，事件历史留下可追溯的工作记忆。

## 已实现

- 账号登录、多个工作空间、owner/admin/member/viewer 权限、空间隔离。
- 默认星图首页，工作舱按需打开项目、周报、历史和设置。
- 事项、项目、一级子事项、四象限、状态、发生/截止/完成时间、提醒、归档、可撤销删除和恢复。
- 追加式操作历史、服务端搜索和分页、工作空间 JSON 导出。
- AI 自然语言草稿、象限建议、任务拆解、周报辅助概括；模型不可用时明确显示规则降级。
- 系统管理员控制台统一管理 AI 接入端点，提供用户、空间、事项、七日活跃度和 AI 成功率概览。
- 晨间摘要、到期/遗忘提示、应用内通知、邮件、Web Push、免打扰、暂停、上限和稍后提醒。
- 有来源的可编辑 Markdown 周报、复制和下载。
- 版本化 API、工作空间访问令牌、幂等写入、乐观版本冲突和 Skill 接入说明。
- 手机/桌面响应式 PWA、全局 Ctrl/Cmd+K、完成庆祝和减少动效。

AI 草稿确认后才写入事项；周报只保存草稿，不自动发送。未配置模型/邮件/推送时不会假装调用成功。

## 工程结构

- `src/app`：Next.js 页面、API 和样式。
- `src/components`：工作台、表单、项目、历史、周报、设置。
- `src/lib`：数据库、权限、业务事务、AI 适配、提醒投递。
- `packages/core`：共享输入校验、角色、时区、规则解析和 Skill 注册表。
- `apps/worker`：Redis/BullMQ 后台扫描与投递。
- `prisma`：PostgreSQL 模型、初始迁移、显式演示种子。
- `skills/orbit`：可供 AI 客户端加载的 Skill。
- `tests`：核心逻辑、真实 API/数据库/队列与浏览器测试。

Node.js 22.16+；本次锁定 Next.js 15、React 19、Prisma 6。依赖版本由 package-lock.json 固定；PostCSS 和 deepmerge-ts 的 override 用于修复其上游依赖中的已知公告。

## 本地启动

```sh
npm ci
cp .env.example .env
# 设置 ENCRYPTION_KEY（64 位十六进制）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
docker compose -f compose.dev.yaml up -d
npm run db:migrate
npm run dev
# 另一个终端运行提醒 Worker
npm run worker
```

打开 http://localhost:3000。空数据库的第一个账号会成为自己工作空间的所有者；当前默认开启公开注册；如需关闭，将 `.env` 中的 `ALLOW_REGISTRATION` 设为 `false` 并重启 Web。管理员仍可在空间设置添加现有账号或创建新账号。生产环境请根据你的用户策略决定是否开放。

没有 Docker 时，可在另一个终端用 `npm run db:local` 启动项目内 PostgreSQL（127.0.0.1:55432）；数据保存在 `.data/postgres`。Redis 仍需自行提供或用 Docker。数据库、Web 和 Worker 都应常驻运行。

### 本次已准备的本地体验

当前工作区已有本地配置及标注为“示例 · 创作工作室”的示例数据。体验账号为 `demo@orbit.local`，密码为 `Orbit-Demo-2026`，仅用于本机预览，不能用于生产。演示种子不会覆盖已有账号。

在一个新的开发数据库中可显式创建演示数据：

```sh
SEED_PASSWORD='your-local-demo-password' npm run db:seed
```

## 云端部署

1. 将项目复制到服务器，准备 Docker Compose，域名 A 记录指向服务器，开放 80/443。
2. 从 `.env.example` 创建 `.env`，设置 `ORBIT_DOMAIN`、随机十六进制 `POSTGRES_PASSWORD`、64 位十六进制 `ENCRYPTION_KEY`；妥善备份该加密密钥。
3. 运行 `docker compose up -d --build`。迁移服务先完成，Web 与 Worker 随后启动，Caddy 自动申请 HTTPS。
4. 创建你的正式账号，检查 `/api/v1/health`，运行 `docker compose ps` 确认 Web 与 Worker 健康。
5. 使用 `npm run admin:provision` 创建系统管理员并写入首个全局 AI 端点；通知渠道仍在空间设置中管理。不要把本地 `.env`、`.data` 或演示数据库复制到生产。

数据库和 Redis 不暴露公网端口。`APP_URL` 由生产 Compose 设置为 HTTPS 域名，Cookie 自动启用 Secure。若使用其他反向代理，确保 `APP_URL` 与浏览器实际访问的来源一致，否则 CSRF 校验会拒绝写入。

容器中的 `localhost` 是容器本身。连接服务器上的 Ollama 时应使用容器可达地址；可以将 Ollama 加入同一 Compose 网络。

## AI 与通知

### AI

系统管理员登录后会自动看到「系统控制台」，可添加、测试、切换和移除 OpenAI-compatible 或 Ollama 原生端点。当前激活端点统一服务所有工作空间；普通空间成员只能看到服务状态，不能读取或修改端点。Key 用 ENCRYPTION_KEY 进行 AES-GCM 加密，接口只返回 `hasKey` 状态，不回传密文或明文。

首次部署可将 `ORBIT_ADMIN_EMAIL`、`ORBIT_ADMIN_PASSWORD`、`AI_ENDPOINT_NAME`、`AI_PROVIDER`、`AI_BASE_URL`、`AI_MODEL` 和 `AI_API_KEY` 仅传给 `npm run admin:provision`。脚本创建或提升系统管理员并激活该端点；管理员密码无需保存在运行环境。没有数据库端点时，服务器 AI 环境变量继续作为兼容回退。单次模型请求超时 15 秒。自然语言相对日期按工作空间时区处理；规则降级支持“今天/明天/后天/周几”和数字/中文小时，不把它伪装为完整语言模型理解。请在草稿里核对日期。

```sh
ORBIT_ADMIN_EMAIL=admin@example.com \
ORBIT_ADMIN_PASSWORD='replace-with-a-strong-password' \
AI_ENDPOINT_NAME='主端点' \
AI_PROVIDER=openai \
AI_BASE_URL='https://api.example.com/v1' \
AI_MODEL='provider/model-id' \
AI_API_KEY='provider-key' \
npm run admin:provision
```

每次 AI 执行记录模型、提示词版本、输入哈希、来源 ID、结果与状态。发送给模型的工作内容由具体操作限定；不要接入未经你批准的数据接收方。

### 通知

Worker 每分钟扫描一次，PostgreSQL 中的 Reminder 与 Notification 为持久记录，Redis 管理执行队列。Worker 停机期间事项不会丢失，恢复后会扫描到期提醒。应用内消息不依赖外部渠道。

- 邮件：配置 SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM。
- 推送：运行 `npx web-push generate-vapid-keys`，将公私钥和 VAPID_SUBJECT 写入环境变量，重启 Web/Worker；在设置中为当前设备开启通知。
- Android Chrome、桌面 Chrome/Edge/Firefox 可在 HTTPS 下使用推送。
- iPhone/iPad 要求 iOS/iPadOS 16.4+，先添加到主屏幕，再从主屏幕打开并主动授予通知权限。
- 实际推送由浏览器和操作系统控制，不保证后台即时到达；邮件和应用内历史可补充追溯。

外部投递失败最多重试 5 次，指数退避；状态留存在 Notification。邮件与推送采用至少一次投递，极端进程中断下可能重复；应用内通知有唯一去重键，推送使用 tag 去重。免打扰与每日限额针对外部投递，不删除应用内消息。

## 数据备份与恢复

生产使用 PostgreSQL 工具备份：

```sh
./scripts/backup.sh
./scripts/restore.sh backups/orbit-YYYYMMDD-HHMMSS.dump orbit_restore_check
```

恢复脚本只允许新建 `orbit_restore_` 开头的数据库，不覆盖 `orbit`。核对恢复内容后再由管理员切换 DATABASE_URL。将备份加密复制到另一台机器或对象存储，按自己的运维系统安排每日运行。必须同时安全保存 ENCRYPTION_KEY，否则恢复后的模型密钥无法解密。

本地无 Docker 时，`node --env-file=.env --import tsx scripts/backup-local.ts` 可对本地演示数据库创建一致性 JSON 快照，并恢复到独立数据库逐表核对。此工具用于开发验证；生产仍使用 pg_dump/pg_restore。

“永久归档”表示应用不会因完成或归档删除事项与事件；真正的数据持久性还依赖磁盘、备份与运维。

## 测试

```sh
npm test
npm run typecheck
npm run build
```

API 集成测试要求独立 `orbit_test` 数据库，执行迁移后在 3001 端口启动应用：

```sh
DATABASE_URL=postgresql://orbit:orbit@127.0.0.1:55432/orbit_test npm run db:migrate
DATABASE_URL=postgresql://orbit:orbit@127.0.0.1:55432/orbit_test APP_URL=http://localhost:3001 ALLOW_REGISTRATION=true COOKIE_SECURE=false npm start -- --hostname 127.0.0.1 --port 3001
npm run test:integration
npm run test:e2e
```

队列测试要求 Redis 127.0.0.1:56379。浏览器测试使用本机 Google Chrome，同时要求 3000 端口的本地演示工作区和 3001 的独立测试服务。测试数据只写入测试工作空间；截图位于 `.impeccable/review`。也可修改 Playwright 配置使用已安装的 Chromium。

## 当前边界

- 本机已验证 PostgreSQL 迁移、完整业务流程、逻辑备份恢复、真实 Redis 队列、PWA 和响应式页面；云端容器启动、TLS 签发、真实邮件/推送提供商需要你的服务器、域名及凭证后验证。
- PWA 支持安装和安全离线提示；离线编辑与冲突合并不在本版范围内。
- 主页与四象限加载最近 1000 条未归档事项；时光回放支持完整分页检索，单事项详情可查询任意记录。事件接口支持时间游标，空间导出包含完整历史。
- 附件、原生 App、公开 Skill 市场与其他方法论插件未纳入此版。
- 源码仓库不包含本地密钥、数据库、备份或构建缓存；运行配置由各部署环境独立维护。

本产品独立实现；设计机制参考任务工具的快速捕捉、可追溯日志和可组合自动化思想，没有复制开源产品源码或品牌资产。

## 星云四象限更新

登录或刷新后直接进入全屏星图，无常驻侧栏或管理顶栏。左上角「工作舱」打开导航抽屉，可进入今日、收件箱、项目、周报、时光回放和空间设置；底部可直接自然语言记录事项，AI 草稿仍需确认。筛选按需展开，保留沉浸模式、100%–200% 缩放、搜索及项目/状态筛选。

横轴向右越重要，纵轴向上越紧急。拖动可在象限内调整位置，也可跨轴重新归类；坐标与归类同步保存。轴心的金色太阳是完成目标：拖入并松手，成功保存后星体沿弧线缩小飞入太阳，随后展示完成反馈。详情内点击完成也使用相同反馈。

开始拖动后，地图下方才出现紫色黑洞；拖入并松手是删除，不计为完成。删除会同步处理子事项并停止提醒，界面提供「撤销删除」，也可在「时光回放 → 已删除」中恢复。恢复后需重新设置提醒。删除和归档各自保留可追溯历史，互不混淆。

手机支持触屏拖动，键盘可用 Alt + 方向键移动、Escape 取消拖动，详情提供完成和删除按钮。保存失败保留星体并显示错误；减少动效模式关闭吸入和持续旋转，保留结果文字。

截止前 14 天开始向紧急方向漂移，自动漂移不跨越当前象限。星体坐标保持不变，标题单独避让并用引线连接；空间不足时按象限分组翻页，桌面每区最多 6 件、手机每区最多 3 件，实际数量由可用标签空间决定。子事项继续在父事项详情内管理。

升级已有部署须运行 `npm run db:migrate` 应用坐标迁移 `202609290002_orbit_position` 和删除迁移 `202609300001_item_deletion`，然后重新构建并重启 Web 与 Worker。生产 Compose 的迁移服务会自动执行。开发预览与构建同时运行时，使用 `ORBIT_DIST_DIR=.next-build npm run build` 隔离产物，避免覆盖开发缓存；对应启动也须指定同一 `ORBIT_DIST_DIR`。
