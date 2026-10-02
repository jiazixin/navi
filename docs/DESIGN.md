# 设计与协议

本文描述当前实现；开发验证见 [IMPLEMENTATION.md](IMPLEMENTATION.md)，界面约定见 [UI_SPEC.md](UI_SPEC.md)。配置示例及运行命令见根目录 README。历史设计讨论由 Git 保留，不再维护多份重复规范。

## 产品与架构

Navi 是自托管、只读的个人导航页。`urls.yaml` 是导航内容、分页、分组和顺序的唯一来源；提供账号密码认证；不提供数据库、管理后台或目录写入 API。React 生产资源嵌入 Go 二进制，运行时不依赖 Node。

| 模块 | 职责 |
| --- | --- |
| `internal/config` | 主配置选择、默认值、严格校验及相对路径解析 |
| `internal/catalog` | YAML 校验、稳定链接 ID、不可变快照、文件监听及事件通知 |
| `internal/navigation` | 有并发上限的 private/public 探测、缓存及选择 |
| `internal/favicon` | 后台发现、下载、校验和可重建的磁盘缓存 |
| `internal/app` | 组装、启动、关闭、后台维护、会话认证、HTTP API、SSE、跳转、健康检查与静态资源 |
| `web/src` | React 页面、功能组件、协议校验与样式 |

## 配置约定

`CONFIG_FILE` 选择主配置；未设置时只读取 `./configs/config.local.yaml`，缺失则使用默认值，显式空路径或不存在时报错。字段优先级为 `NAVI_<节>_<字段>` 环境变量 > 文件 > 内置默认值。`storage` 和 `catalog.path` 相对主配置文件所在目录解析。主配置更改需要重启；仅导航 YAML 支持热加载。未知字段、重复 YAML 键、多个 YAML 文档及非法值报错。

保留 `auth`、`storage`、`theme`、`background_pattern`、`web_search`、`server`、`health`、`logging`、`catalog`、`navigation`、`favicon`。旧 `datadir` 和顶层 `site/urls` 不再支持，不添加静默兼容别名。YAML 使用 snake_case；JSON API 使用 camelCase；Go 使用惯用导出命名。`StorageDir` 与 YAML `storage` 的区别是内部类型表达，不是待删除字段。

| 字段 | 默认值 / 约束 |
| --- | --- |
| `auth` | username/password 默认均为空，直接进入首页；两者同时填写则启用认证（分别 1–128 / 1–1024 字节），拒绝单项配置和纯空白凭证；secure_cookie=false，HTTPS 代理部署设为 true |
| `storage` | `../.cache`；非空，缓存位于其 `favicons` 子目录 |
| `server.listen` / `port` | `127.0.0.1` / `8080`；端口 1–65535 |
| 服务超时 | read_header 5s、read 20s、write 30s、idle 90s、shutdown 10s；全部正数 |
| `health.uri` | `/health`；规范化的绝对路径，不能为 `/`、`/login`、`/index.html`、`/assets` 前缀、`/api`、`/go` 或 `/api/`、`/go/` 子路径；不能含查询或片段 |
| `logging` | info、json、access_log=true、log_health_checks=false；级别 debug/info/warn/error，格式 json/logfmt |
| `catalog` | path=`./urls.yaml`、watch=true、reload_debounce=250ms |
| `navigation` | private_probe_timeout=800ms、public_probe_timeout=1200ms、probe_cache_ttl=30s、max_concurrent_probes=32 |
| `favicon` | fetch_timeout=3s、refresh_interval=168h、max_file_bytes=1048576、workers=4；文件限制 1024–4194304 字节，worker 1–16 |

主题：`default`、`navy-blossom`、`mint-tide`、`moss-court`、`tea-mist`、`amber-tide`、`sunny-coast`、`violet-lime`。

背景：`none`、`meridian-grid`（默认）、`orbital-rings`、`pisces`、`sagittarius`、`roman-meander`、`rose-window`、`eight-point-star`、`star-trails`。

外部搜索：`baidu`（默认）、`google`、`yandex`、`bing`、`github`、`chatgpt`、`claude`、`gemini`。主题和背景可由浏览器本地选择覆盖，存储不可用时仍允许当前会话切换；搜索入口选择仅在当前会话有效。

## 导航数据

根字段为 `version: 1` 和 `pages`。文件最大 2 MiB，1–20 页，总计最多 1000 链接。每页必须显式包含 `urls`，允许 `[]`。

| 字段 | 约束 |
| --- | --- |
| 页 `id` | 全局唯一，`^[a-z][a-z0-9-]{0,31}$` |
| 页 `title` / `subtitle` | 必填 1–40 / 可选 0–100 字符 |
| 链接 `name` / `group` | 必填 1–60 / 1–40 字符 |
| `description` | 可选，最多 120 字符 |
| `tags` | 最多 10 项，每项 1–24 字符 |
| `private_url` / `public_url` | 至少一个，只接受绝对 HTTP(S) URL |

字符长度统一按 Unicode 码点计数，文本去除首尾空白。分组按首次出现顺序排列，组内保持 YAML 相对顺序。同页相同 group、name、private/public URL 的重复项被拒绝。`runtimeId` 由 page ID、分组、名称和 URL 哈希生成；修改描述或标签不会改变 ID。

热加载监听父目录，支持普通保存及原子替换。只有整份目录校验通过才发布新 revision；失败保留最近有效快照并报告 degraded。revision 是进程内序号，重启后重新计数，不能作为跨重启内容版本。

## 跳转与图标

点击 `/go/{runtimeId}`：先探测 private，成功即 302；否则探测 public；全部失败返回 502 失败页，复用前端主题与组件样式，提供重试和返回导航；禁用 JavaScript 时仍保留基本提示和可用链接。手动重试只清除不可达缓存，仍受超时和并发上限约束。可达性是 **Navi 服务端** 的网络视角，不能保证浏览器能访问相同地址。

探测使用 HEAD，405/501 回退 `Range: bytes=0-0` GET；100–499 视为可达，5xx/网络错误不可达。最多跟随 3 次重定向。排队和等待合并请求也计入调用超时。相同 URL 合并并发请求，取消/超时结果不写缓存，不转发浏览器 Cookie 或 Authorization。

图标发现顺序为 public 再 private，读取页面中的 icon/apple-touch-icon，按声明尺寸评分，再尝试该 origin 的 `/favicon.ico`。发现页非 2xx、读取失败、超时或超过 256 KiB 时仍尝试根图标；调用上下文取消则立即停止。支持 ICO、PNG、JPEG、GIF、WebP、隔离提供的 SVG；不使用远端文件名作为本地路径。

启动、目录更新及周期维护会调度缺失/过期图标。周期为 `refresh_interval`；缓存到期后可能再等一个维护周期。远端 ETag/Last-Modified 用于条件刷新，本地 ETag 来自内容。图标 API 允许缓存但要求重新验证，不对内容可变化的固定 URL 声明 immutable。下载失败保留旧图标，无缓存显示字标。本地写入/维护失败报告 degraded 并通过 status.updated 通知页面，后续成功写入或失败链接移除后恢复；单个远端站点无图标不影响服务健康。启动时存储不可用需要修复后重启。移除链接的缓存经过至少 24 小时宽限期后由维护回收。

## HTTP 表面

| 路径 | 行为 |
| --- | --- |
| `/api/auth/login` | POST JSON username/password，成功设置会话 Cookie；错误凭证 401，格式错误 400，限流 429 |
| `/api/auth/session` | GET/HEAD；未启用认证返回 authenticated=true、authRequired=false；启用时有效会话 200（两字段 true），否则 401；no-store |
| `/api/auth/logout` | POST；撤销当前会话、清除 Cookie，204 |
| `/login` | 公开登录页面；登录成功进入首页 |
| `/api/catalog` | revision、theme、backgroundPattern、webSearch、pages；无服务端写操作；no-store |
| `/api/status` | health、revision、可选通用 message；no-store |
| `/api/events` | SSE：catalog.updated、catalog.error、favicon.updated、status.updated；15 秒心跳；HEAD 立即返回 |
| `/api/icons/{runtimeId}` | 图标、内容 ETag、no-cache；不存在返回 404 |
| `/go/{runtimeId}` | 探测后 302 或失败 HTML，no-store |
| 配置的健康路径 | `ok`/`degraded` 为 200，目录不可用为 503 |
| 其他路径 | 嵌入静态资源或 SPA fallback |

除登录和退出使用 POST 外，目录及静态路由仅接受 GET、HEAD、OPTIONS。认证写请求要求 `X-Navi-Request: 1`，存在 Origin 时校验同主机，拒绝 cross-site 请求；无跨域许可。生产入口无内联脚本，Zod 关闭 JIT；保持禁止 unsafe-inline/unsafe-eval 的 CSP。SSE 是有界的失效通知流，不是持久事件日志；队列满时合并为全量刷新通知。每帧写入受 `server.write_timeout` 限制，空闲等待时清除写入期限，请求取消会中断阻塞写入。客户端首次连通及重连后补拉目录和状态，并重试图标。

## 部署边界

账号密码均为空或省略 auth 时不启用认证，首页、API、SSE、图标和跳转直接可用，不创建会话，隐藏退出入口；访问登录页自动回首页。仅填写一项时报错。两者均配置时启用单一账号认证：未认证页面访问 302 到 `/login`；目录、状态、SSE、图标 API 返回 401，`/go/` 跳转前认证。会话由 32 字节随机令牌索引内存记录，固定 24 小时过期，最多 4096 个；退出或重启后失效。Cookie 为 HttpOnly、SameSite=Strict；TLS 或 secure_cookie=true 时加 Secure。SSE 每次发送事件和心跳前复查会话。前端每 30 秒及聚焦时重新检查会话。登录页、`/assets/` 和健康检查公开。登录按直接连接 IP 限制一分钟五次，成功清零；不信任 X-Forwarded-*，代理用户共享限额，限流表最多 4096 项。API 会返回配置的内外网 URL，不应在 URL 内放凭证。服务端会访问受信任 YAML 中的地址及其图标/重定向目标；不能让不可信用户写该文件。远程访问使用 HTTPS 反向代理，设置 auth.secure_cookie=true；保护包含明文凭证的 configs/config.local.yaml 文件权限。

Docker 配置必须设置 `server.listen: 0.0.0.0`、`storage: /app/.cache`。热加载推荐只读挂载配置目录：单文件 bind mount 在宿主机编辑器原子替换后可能继续指向旧文件。缓存目录需允许容器 UID 65532 写入。反向代理应关闭 SSE 缓冲并允许长连接。

## 仓库目录

通用基线见根目录 `目录规范.md`，实际布局见 README。前端源码与 Go 嵌入入口统一在 `web/`，Vite 输出 `web/dist/`；运行 YAML 位于 `configs/`，默认加载 `configs/config.local.yaml`，本地配置不提交。图标是可重建缓存，默认 `storage: ../.cache`。可执行产物输出到 `bin/navi`。HTTP 装配、会话与处理器统一位于 `internal/app/`；前端 API 在 `web/src/app/api/`，跨域 UI 在 `components/`，顶栏在 `layouts/`，动效变量在 `styles/`，浏览器测试在 `web/e2e/`。
