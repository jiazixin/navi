# 接口约定

本文是 Navi 接口、错误响应、服务状态代码和导航失败代码的唯一契约来源，适用于 Go 服务端（`internal/app/http_errors.go`、`internal/app/handlers.go`、`internal/catalog`、`internal/favicon`）与 Web 客户端（请求包装 `web/src/app/api.ts`、错误文案 `web/src/app/errors.ts` 与 `web/src/features/auth/loginErrors.ts`、状态与导航代码 `web/src/app/serverCodes.ts`）。通用规则见 [代码规范.md](../代码规范.md) 第 5.3 节。服务端只返回英文说明和代码，界面文案由客户端按代码映射。

## 端点

JSON 字段一律 snake_case；可选字段缺省时省略；客户端忽略未知字段。每个响应带 `X-Request-ID`；所有 `/api/` 响应（包括 SSE 和图标）带 `Cache-Control: no-store`。启用认证时，目录、状态、图标、事件与会话查询需要有效 Cookie；登录和退出不要求已有有效会话。跨站写请求由 `Sec-Fetch-Site` / `Origin` 校验拒绝（403 `permission_denied`）。

| 方法与路径 | 说明 |
| --- | --- |
| `GET /healthz` | 无需登录。正常（含降级）返回 200 `{"status":"ok"}`；目录尚不可用时返回 503 `catalog_unavailable` |
| `GET /api/info` | 无需登录。`{"version": "...", "capabilities": ["catalog_events", "favicons"]}` |
| `POST /api/auth/login` | 请求体 `{"username", "password"}`（`application/json`，最大 8 KiB，拒绝未知字段）；用户名限 1–128 UTF-8 字节、密码限 1–72 UTF-8 字节，超出返回 400 `invalid_argument`；成功返回会话对象并设置 Cookie |
| `POST /api/auth/logout` | 204，清除会话 |
| `GET /api/auth/session` | `{"authenticated": true, "auth_required": bool}` |
| `GET /api/catalog` | `{"revision", "pages": [{"id", "title", "subtitle", "groups": [{"name", "links": [{"runtime_id", "name", "description", "private_url", "public_url", "tags"}]}]}]}`；支持 `ETag` / `If-None-Match` |
| `GET /api/status` | 见下文“服务状态” |
| `GET /api/events` | SSE：`catalog_updated`、`catalog_error`、`status_updated`、`favicon_updated`（`{"type", "runtime_id"}`） |
| `GET /api/icons/{runtime_id}` | 缓存的图标；支持 `ETag` |
| `GET /go/{runtime_id}` | 302 跳转到探测选中的地址；失败时返回导航失败页 |

## 错误响应

```json
{"error": {"code": "invalid_credentials", "message": "invalid username or password"}}
```

| 状态码 | `code` | 含义 |
| --- | --- | --- |
| 400 | `invalid_argument` | 登录请求不是一个有效 JSON 对象；`details.fields` 为 `[{"path": "", "reason": "invalid_json"}]` |
| 401 | `unauthenticated` | 未登录或会话过期 |
| 401 | `invalid_credentials` | 账号或密码不正确 |
| 413 | `payload_too_large` | 登录请求体超过 8 KiB |
| 415 | `unsupported_media_type` | 登录请求体不是 `application/json` |
| 403 | `permission_denied` | 跨站请求被拒绝 |
| 404 | `not_found` | 接口、图标或静态资源不存在 |
| 404 | `icon_cache_unavailable` | 图标缓存不可用 |
| 405 | `method_not_allowed` | 方法不受支持，响应带 `Allow` |
| 412 | `precondition_failed` | 图标的 HTTP 前置条件不满足 |
| 416 | `invalid_argument` | 图标的字节范围非法或超出文件大小 |
| 429 | `rate_limited` | 登录尝试过多 |
| 500 | `internal` | 未预期的服务端错误，详情只写日志 |
| 503 | `catalog_unavailable` | 目录尚不可用 |
| 503 | `frontend_not_built` | 前端资源尚未构建 |
| 503 | `sessions_full` | 会话数已满 |

## 服务状态

`GET /api/status` 返回 `{"health", "revision", "code", "message"}`。目录可用时 `health` 为 `ok` 或 `degraded`；降级时 `code` 说明原因，`message` 为英文说明。目录不可用时返回 503 `catalog_unavailable` 错误信封，与其他 API 错误一致：

| `code` | 含义 |
| --- | --- |
| `catalog_unavailable` | 目录尚不可用（HTTP 503，错误信封） |
| `catalog_reload_failed` | 目录重载失败，仍显示最近一次有效内容 |
| `icon_cache_unavailable` | 图标缓存不可用，使用字标 |
| `icon_cache_write_failed` | 图标缓存写入失败 |

SSE 的 `catalog_error` 事件带同样的 `code`（`catalog_reload_failed`）。

## 导航失败页

`/go/` 跳转失败时返回 HTML，根元素的 `data-navigation-error` 为代码：`link_not_found`、`link_unavailable` 或 `catalog_unavailable`。客户端按代码显示标题与操作，要求启用 JavaScript；Go 只注入代码和受限的重试路径，不生成用户文案或备用 HTML。嵌入入口缺失或无有效根节点时返回 503 `frontend_not_built` JSON 错误信封。

## 客户端边界

客户端保留响应字段原名，不对 snake_case 做统一重命名。唯一 JSON 包装拒绝重定向，支持 AbortSignal，限制响应读取为 8 MiB；超限为客户端 `invalid_response`，保留 X-Request-ID。登录与退出是无自动重试的 mutation，卸载会取消未完成请求。客户端确认登录 Cookie 未保存时使用本地错误码 `session_cookie_rejected`。

登录字段长度错误返回 `400 invalid_argument`，`details.fields` 中包含 `username` / `password` 路径和 `invalid_length` 原因码；客户端按原因码显示中文提示，未知原因显示通用字段提示，不展示服务端说明。错误密码仍返回 `401 invalid_credentials`。前后端共用样例为 `tests/fixtures/api/login-invalid-length.json`。用户名最多 128 UTF-8 字节，密码最多 72 UTF-8 字节。

## 当前协议与页面入口

项目尚未上线，SSE 事件名及 JSON `type` 使用 `catalog_updated`、`catalog_error`、`status_updated`、`favicon_updated`，不监听点分形式的旧事件名。SSE 同样返回 `Cache-Control: no-store`。

页面入口为 `/`、`/login` 和 `/go/{runtime_id}`。未知页面（包括 `/navigation`、`/client-route`、`/index.html`）返回 HTTP 404 并渲染“页面不存在”，不作为首页别名。静态资源仍按其真实路径提供。

客户端对单次订阅最多自动重连两次，连接仅收到响应头不会清零预算；用户刷新或网络恢复可以重新开始。状态请求失败显示错误提示并保留已有目录；用户可通过页面刷新按钮重试。
