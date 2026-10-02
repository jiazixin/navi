# 设计与协议

本文描述当前实现；开发验证见 [IMPLEMENTATION.md](IMPLEMENTATION.md)，界面约定见 [UI_SPEC.md](UI_SPEC.md)。配置示例及运行命令见根目录 README。历史设计讨论由 Git 保留，不再维护多份重复规范。

## 产品与架构

Navi 是自托管、只读的个人导航页。`urls.yaml` 是导航内容、分页、分组和顺序的唯一来源；提供可选账号密码认证；不提供数据库、管理后台或目录写入 API。React 生产资源嵌入 Go 二进制，运行时不依赖 Node。

| 模块 | 职责 |
| --- | --- |
| `internal/config` | 主配置选择、默认值、严格校验及相对路径解析 |
| `internal/catalog` | YAML 校验、稳定链接 ID、不可变快照、文件监听及事件通知 |
| `internal/navigation` | 有并发上限的 private/public 探测、缓存及选择 |
| `internal/favicon` | 后台发现、下载、校验和可重建的磁盘缓存 |
| `internal/app` | 组装、启动、关闭、后台维护、会话认证、HTTP API、SSE、跳转、健康检查与静态资源 |
| `web/src` | React 页面、功能组件、协议校验与样式 |

## 配置约定

完整字段、默认值和约束仅维护在 [config.example.yaml](../configs/config.example.yaml)；初始化、环境变量空值语义和部署示例见 [README.zh-CN.md](../README.zh-CN.md#配置)。

`CONFIG_FILE` 选择主配置；未设置时只查找 `./configs/config.local.yaml`，缺失使用内置默认值；显式空值、文件不存在或不可读时报错。优先级为 `NAVI_<字段>` / `NAVI_<节>_<字段>` 环境变量 > 文件 > 内置默认值。`storage` 与 `catalog.path`（包括环境覆盖）相对所选配置目录解析，缺失隐式文件时仍以预期的 `configs/` 为基准；此既有协议已登记为 README 的目录例外。部署使用绝对路径。

主配置更改需要重启，只有导航 YAML 支持热加载。未知字段、重复 YAML 键、多个 YAML 文档及非法值启动失败。YAML 使用 snake_case，JSON API 使用 camelCase。主题和背景可由浏览器本地选择覆盖，存储不可用时仍允许当前会话切换；外部搜索入口选择仅在当前会话有效。

## 导航数据

根字段为 `version: 1` 和 `pages`。文件最大 2 MiB，1–20 页，总计最多 1000 链接。每页必须显式包含 `urls`，允许 `[]`。

| 字段 | 约束 |
| --- | --- |
| 页 `id` | 全局唯一，`^[a-z][a-z0-9-]{0,31}$` |
| 页 `title` / `subtitle` | 必填 1–40 / 可选 0–100 字符 |
| 链接 `name` / `group` | 必填 1–60 / 1–40 字符 |
| `description` | 可选，最多 120 字符 |
| `tags` | 最多 10 项，每项 1–24 字符 |
| `private_url` / `public_url` | 至少一个，只接受有主机名的绝对 HTTP(S) URL；保留查询与片段，显式端口为 1–65535 |

字符长度统一按 Unicode 码点计数，文本去除首尾空白。分组按首次出现顺序排列，组内保持 YAML 相对顺序。同页相同 group、name、private/public URL 的重复项被拒绝。`runtimeId` 由 page ID、分组、名称和 URL 哈希生成；修改描述或标签不会改变 ID。

热加载监听父目录，支持普通保存及原子替换。只有整份目录校验通过才发布新 revision；失败保留最近有效快照并报告 degraded。revision 是进程内序号，重启后重新计数，不能作为跨重启内容版本。

## 跳转与图标

点击 `/go/{runtimeId}`：先探测 private，成功即 302；否则探测 public；全部失败返回 502 失败页，复用前端主题与组件样式，提供重试和返回导航；禁用 JavaScript 时仍保留基本提示和可用链接。手动重试只清除不可达缓存，仍受超时和并发上限约束。可达性是 **Navi 服务端** 的网络视角，不能保证浏览器能访问相同地址。

探测使用 HEAD，405/501 回退 `Range: bytes=0-0` GET；100–499 视为可达，5xx/网络错误不可达。最多跟随 3 次重定向。排队和等待合并请求也计入调用超时。相同 URL 合并并发请求，取消/超时结果不写缓存，不转发浏览器 Cookie 或 Authorization。

图标发现顺序为 public 再 private，读取页面中的 icon/apple-touch-icon，按声明尺寸评分，去重后最多尝试 16 个声明候选，并保留该 origin 的 `/favicon.ico` 回退。发现页非 2xx、读取失败、超时或超过 256 KiB 时仍尝试根图标；调用上下文取消则立即停止。

支持 ICO、PNG、JPEG、GIF、WebP 和隔离提供的 SVG，下载协商不声明未支持的 AVIF。保存前检查 PNG/JPEG/GIF 可解码的图像头、SVG 完整 XML、ICO 条目边界及 WebP RIFF/帧块结构；位图每边限 1–2048 像素，避免小体积巨幅图片进入浏览器。仅匹配 MIME 签名不足以通过，不进行完整像素解码。下载仍受 `max_file_bytes` 限制；远端文件名不作为本地路径。

启动、目录更新及周期维护会调度缺失/过期图标。周期为 `refresh_interval`；缓存到期后可能再等一个维护周期。远端 ETag/Last-Modified 用于条件刷新，本地 ETag 来自内容。图标 API 允许缓存但要求重新验证，不对内容可变化的固定 URL 声明 immutable。下载失败保留旧图标，无缓存显示字标。元数据对应的图标文件丢失或变成目录时视为缓存缺失；条件刷新返回 304 而本地文件已丢失时重新请求完整内容。本地写入/维护失败报告 degraded 并通过 status.updated 通知页面，后续成功写入或失败链接移除后恢复；单个远端站点无图标不影响服务健康。启动时存储不可用需要修复后重启。移除链接的缓存经过至少 24 小时宽限期后由维护回收。

启动时重新校验已有图标缓存的类型、结构和尺寸，单文件读取上限为 4 MiB；不合格文件保留在磁盘但不载入有效索引，随后重新下载，不沿用其远端条件请求标识。

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
| `/api/icons/{runtimeId}` | 图标、内容 ETag、no-cache；认证模式为 private，公开模式为 public；不存在返回 404 |
| `/go/{runtimeId}` | 探测后 302 或失败 HTML，no-store |
| 配置的健康路径 | `ok`/`degraded` 为 200，目录不可用为 503 |
| `/assets/` | 仅提供实际存在的静态文件；缺失或目录请求为 404 |
| 其他页面路径 | 带配置主题的嵌入首页或 SPA fallback；no-store |

除登录和退出使用 POST 外，目录及静态路由仅接受 GET、HEAD、OPTIONS。认证写请求要求 `X-Navi-Request: 1`，存在 Origin 时校验同主机，拒绝 cross-site 请求；无跨域许可。生产入口无内联脚本，Zod 关闭 JIT；保持禁止 unsafe-inline/unsafe-eval 的 CSP。发布构建默认不生成 sourcemap，减少二进制体积；诊断时可显式生成，不将诊断产物当作默认发布包。SSE 是有界的失效通知流，不是持久事件日志；队列满时合并为全量刷新通知。每帧写入受 `server.write_timeout` 限制，空闲等待时清除写入期限，请求取消会中断阻塞写入。客户端首次连通及重连后补拉目录和状态，并重试图标。

## 部署边界

账号密码均为空或省略 auth 时不启用认证，首页、API、SSE、图标和跳转直接可用，不创建会话，隐藏退出入口；访问登录页自动回首页。仅填写一项时报错。两者均配置时启用单一账号认证：未认证页面访问 302 到 `/login`；目录、状态、SSE、图标 API 返回 401，`/go/` 跳转前认证。会话由 32 字节随机令牌索引内存记录，固定 24 小时过期，最多 4096 个；退出或重启后失效。Cookie 为 HttpOnly、SameSite=Strict；TLS 或 secure_cookie=true 时加 Secure。SSE 每次发送事件和心跳前复查会话。前端每 30 秒及聚焦时重新检查会话。登录页、`/assets/` 和健康检查公开。登录按直接连接 IP 限制一分钟五次，成功清零；不信任 X-Forwarded-*，代理用户共享限额，限流表最多 4096 项。API 会返回配置的内外网 URL，不应在 URL 内放凭证。服务端会访问受信任 YAML 中的地址及其图标/重定向目标；不能让不可信用户写该文件。远程访问使用 HTTPS 反向代理，设置 auth.secure_cookie=true；保护包含明文凭证的 configs/config.local.yaml 文件权限。

Docker 运行时通过环境变量设置 `NAVI_SERVER_LISTEN=0.0.0.0`、`NAVI_STORAGE=/app/.cache`，以 `/app` 为工作目录。热加载推荐只读挂载配置目录：单文件 bind mount 在宿主机编辑器原子替换后可能继续指向旧文件。配置目录和文件需允许 UID 65532 遍历、读取，缓存目录需允许其写入。反向代理应保留原始 Host，关闭 SSE 缓冲并允许长连接。

## 源码与构建边界

通用归属仅由根目录 [目录规范.md](../目录规范.md) 规定，项目布局与已接受例外见 README。`web/src` 和 `web/public`（有公开资源时）是可编辑来源，Vite 生成唯一 `web/dist`，Go 的 `web/embed.go` 直接嵌入该目录。任何会编译嵌入包的检查、构建或开发启动，都先执行前端构建。容器按锁文件重新安装和构建，不复制本地依赖或旧产物。
