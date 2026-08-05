# Navi 变更文档

本文件记录需求、设计、接口、配置、验收标准和实施范围的变化，不替代 Git commit
历史。任何影响行为的修改必须在修改发生时同步记录，禁止在版本结束后集中补写。

## 1. 记录规则

每条变更必须包含：

- 唯一编号：`CHG-YYYYMMDD-NNN`。
- 日期和状态：proposed、accepted、implemented、rejected。
- 原需求或行为。
- 新需求或行为。
- 原因和影响范围。
- 受影响文档、代码和验收项。
- 完成实现后补充验证命令与结果。

变更处理顺序：

1. 先新增 accepted 记录。
2. 同步修改设计与验收文档。
3. 修改实施计划或代码。
4. 完成测试后将状态更新为 implemented。

纯错别字或不改变语义的排版修改可以合并为一条 documentation 记录。

## 2. 当前有效基线

截至 2026-08-01，已接受的产品基线为：

- Go 单进程、前端资源嵌入单二进制。
- `config.yaml` 管理程序运行参数并指向 `urls.yaml`。
- `urls.yaml` 是导航内容、分组和顺序的唯一事实来源。
- `urls.yaml` 使用严格的有序 `pages` 数组定义 `page1`、`page2` 等页面，不接受旧版顶层
  `site/urls` 结构。
- 系统只读，不含登录、数据库、拖拽、Web 编辑或 YAML 回写。
- 唯一核心目标是高质量 UI/UX；YAML 渲染、搜索、热加载和内外网自动选择均服务于体验。
- 站点 favicon 自动发现并作为派生缓存存入主配置指定的 `datadir`。
- 动效跟随显示器原生刷新率，不设置 60fps 或其他人为最高帧率。
- 所有实现必须遵守 `docs/CODING_STANDARDS.md` 的生产级命名、组织和零弃用门禁。
- 所有组件、响应式布局和视觉测试必须遵守 `docs/UI_SPEC.md`。

## 3. 变更记录

### CHG-20260805-038 建立最终验证记录

- 日期：2026-08-05
- 状态：implemented
- 类型：documentation / release verification
- 新行为：新增 `docs/FINAL_VERIFICATION.md`，集中记录代码、测试、性能、设备视口、集成、安全、产物和可维护性验证状态，并在验收文档的发布门禁处提供入口。
- 影响：不改变产品行为、API、配置或构建流程。
- 验证：文档内容已按项目负责人确认登记为 completed。

### CHG-20260805-037 补齐后端可观测性、Favicon 生命周期与集成门禁

- 日期：2026-08-05
- 状态：implemented
- 类型：backend / observability / favicon / lifecycle / security / frontend integration / testing
- 原行为：Go 后端核心路径可运行，但 `logging` 配置未驱动实际 logger 和访问日志；favicon 刷新
  未使用远端 ETag/Last-Modified，缓存清理未接入目录更新，`favicon.updated` 也无法精确刷新浏览器
  中使用长期缓存的图标；应用生命周期、异常路由和真实热加载集成覆盖不足。项目仍使用包含已知
  可达漏洞的 Go 1.24.3 和 `golang.org/x/net v0.50.0`。
- 新行为：
  - 主进程按 `logging.level` 和 `logging.format` 创建 `slog` logger；启动、目录更新和错误日志使用
    稳定结构化属性。HTTP 访问日志记录 request_id、method、route、status、duration 和 bytes，遵守
    `access_log`、`log_health_checks`，不记录查询参数。
  - favicon 缓存持久化远端 ETag/Last-Modified，刷新时发送条件请求并正确处理 304；页面发现和图标
    下载按来源合并并发请求。目录移除的缓存先标记为清理候选，保留 24 小时后删除，恢复引用时取消
    清理标记。
  - `favicon.updated` SSE 携带 runtime ID；前端只为对应图标增加本地版本参数，绕过 immutable 缓存，
    不刷新整份目录或改变图标容器几何。
  - HTTP 请求绑定应用生命周期 context；关闭时先取消 SSE 等长连接，再执行 graceful shutdown。
    `/api`、`/go`、空 ID、嵌套 ID 和未知业务路径不再误入 SPA fallback；unavailable/degraded、HEAD、
    只读方法和内部错误隔离均有集成测试。
  - Go 工具链升级到 1.25.12，`golang.org/x/net` 升级到 v0.55.0；Docker 构建阶段同步固定到
    `golang:1.25.12-alpine`。根二进制忽略规则改为 `/navi`，避免误伤 `cmd/navi/main.go`。
- 影响：`cmd/navi`、`internal/app`、`internal/catalog`、`internal/favicon`、`internal/httpapi`、前端
  SSE/favicon 渲染链路、Go/Docker 构建版本和后端测试覆盖。未新增写 API、数据库或导航状态源。
- 验收：补齐 `AC-P0-008`、`AC-P0-009`、`AC-P0-017` 至 `AC-P0-021`、`AC-P0-301` 至
  `AC-P0-303`、`AC-P0-402`、`AC-P0-405`、`AC-P0-406` 的自动化实现证据。
- 验证：
  - Go 1.25.12 下 `go test ./...`、`go test -race ./...`、`go vet ./...`、`staticcheck ./...`：通过；
    `govulncheck ./...` 为 0 个可达漏洞。
  - `go test -cover ./internal/...`：app 77.5%、catalog 80.7%、config 73.1%、favicon 65.4%、
    httpapi 77.1%、navigation 83.9%；原 app 0% 和 favicon 46.8% 的主要缺口已补齐。
  - `npm --prefix web run lint`、`typecheck`、`test`、`build`：通过；Vitest 19 个文件、72 项通过，
    statements 96.45%、branches 77.89%、functions 94.11%、lines 96.83%。
  - `npm --prefix web run storybook:test`：通过；上游 `module.register()` deprecation 与大 chunk 警告
    仍按既有记录保留，不来自项目源码。
  - `npm --prefix web run test:visual`：26/26 通过；
    `npm --prefix web run test:e2e`：Chromium、Firefox、WebKit 51/51 通过；两个高并发易抖动用例分别以 20 次重复压测全部通过。
  - `npm --prefix web audit --omit=dev`：0 vulnerabilities；`make build` 通过并生成嵌入式二进制。
  - 当前机器 Docker daemon 不可用，因此容器镜像实际构建仍保留为发布环境门禁。

### CHG-20260803-036 移除分组标题横向分隔线

- 日期：2026-08-03
- 状态：implemented
- 类型：frontend / UI / UX / documentation / testing
- 原行为：每个 GroupSection 标题行在主题刻度、标题与链接数量后渲染一条中性横向分隔线。
- 新行为：GroupSection 标题行只保留 3px 主题刻度、标题和链接数量，不渲染横向分隔线。
- 原因：用户确认该线条属于冗余视觉元素；目录用既有标题至 Grid 间距和分组间距表达层级。
- 影响：`GroupSection` JSX/CSS、组件回归测试、`docs/DESIGN.md`、`docs/UI_SPEC.md` 与
  `docs/ACCEPTANCE.md`。
- 验证：
  - `npm --prefix web run lint`、`typecheck`、`test`、`build`：通过；Vitest 19 个文件、70 项通过，
    statements 96.55%、branches 77.56%、functions 94.00%、lines 96.97%。
  - `npm --prefix web run test:visual -- --update-snapshots` 后再次运行 `test:visual`：26/26 通过，
    最新视觉基线已写入版本控制。
  - `npm --prefix web run test:e2e -- --workers=1`：Chromium、Firefox、WebKit 共 51/51 通过；
    `go test -race ./...` 与 `go vet ./...` 通过。
  - Codex in-app Browser：`http://127.0.0.1:10090/` 在 1280px 宽桌面与 390x844px 手机视口均检测
    10 个 GroupSection 标题行、0 条横向分隔线、`scrollWidth === clientWidth`；本地搜索 “Grafana”
    收敛至单个链接，控制台无 error 或 warn。

### CHG-20260803-035 分页改为固定 Morphing Page Dots

- 日期：2026-08-03
- 状态：implemented
- 类型：frontend / UI / UX / motion / accessibility / documentation
- 原行为：分页位于文档流末尾，长页面需要滚到底部才能操作；圆点只有普通选中态，整体视觉偏重
  标准分页控件。
- 新行为：分页固定在视口底部中央并保持在目录正文之上、sticky 顶栏及其菜单之下，无需滚动即可
  切页；定位层空白区域不捕获指针，正文根据 44px 触控高度、底部偏移和 safe area 预留空间，
  避免遮挡末尾卡片。单页不渲染固定层或额外底部留白。
- 视觉：按 21st.dev Ruixen UI Morphing Page Dots 的行为重新实现，无边框、无面板；Chevron 为
  低对比裸图标，非活动页为 6x6px 圆点，活动页为约 22x7px 短横胶囊。
- 动效：共享 Motion layout indicator 使用 280ms ease-out tween 在页点间形变移动，每次切页附带
  一次约 520ms 的低透明 ripple；内容继续使用方向相关的 24px/220ms 线性过渡。reduced motion
  下取消 indicator 移动、ripple 与内容水平位移。
- 文档：同步更新 `docs/DESIGN.md`、`docs/UI_SPEC.md`、`docs/IMPLEMENTATION.md`、
  `docs/ACCEPTANCE.md` 与 `docs/CHANGELOG.md`。
- 验证：
  - `npm --prefix web run lint`、`typecheck`、`build`：通过；生产 CSS gzip 10.56 KiB、JS gzip
    148.76 KiB，继续低于 300 KiB 门禁。
  - `npm --prefix web run test`：19 个文件、69 项通过；statements 96.55%、branches 77.56%、
    functions 94.00%、lines 96.97%。
  - `npm --prefix web run storybook:test`：通过；PagePagination 的 Interactive 与 LastPage story
    正常构建。仅保留 Storybook 上游 `module.register()` deprecation 与 chunk size warning。
  - `npm --prefix web run test:visual -- --update-snapshots` 后再次运行 `test:visual`：26/26 通过；
    固定分页影响的 desktop、mobile、主题和菜单基线已更新并稳定复跑。
  - `npx playwright test --project=chromium --project=firefox --project=webkit --workers=1`：51/51
    通过；覆盖 44x44px 触控区、滚动前后固定坐标、分页层级、菜单可操作性、overflow 与 axe。
  - Codex in-app Browser：1440x900 与 390x844 人工复核；最终分页为 176x44px，四个按钮均为
    44x44px，活动 indicator 为 22x7px；mobile 固定在 `y=788`、滚动 1500px 后不漂移，
    `scrollWidth === clientWidth`、`z-pagination=9`、顶栏背景菜单可覆盖分页，console 无错误或警告。

### CHG-20260803-034 引入严格多页目录与图标分页

- 日期：2026-08-03
- 状态：implemented
- 类型：configuration / backend / API / frontend / UI / UX / motion / accessibility / documentation
- 原行为：`urls.yaml` 只定义一组顶层 `site/urls`，API 返回单个站点标题与分组，UI 没有页面概念。
- 新行为：`urls.yaml` 改为严格有序 `pages` 数组，每页以 `id: page1/page2` 等稳定标识定义自己的
  标题、副标题和链接；旧结构直接校验失败，不实现兼容。API 使用根级公开外观设置与 `pages`。
- UI：底部新增 Lucide Chevron 图标按钮与圆点页标；当前页驱动顶栏、浏览器标题、目录和本地搜索。
  切页按方向执行 24px、220ms 的水平位移与淡入淡出，reduced motion 下取消位移。
- 数据：页面与页内链接均保持 YAML 数组顺序；页面 ID 纳入运行时链接 ID，允许跨页复用目标而不
  冲突；主动切页清空旧页搜索，热加载保留仍存在的当前页 ID。
- 影响：目录模型、严格加载器、favicon 调度、HTTP catalog 响应、前端 schema、fixture、Vite mock、
  App 状态、搜索、分页组件、单元/E2E/视觉测试和全部配置说明。
- 文档：`docs/DESIGN.md`、`docs/UI_SPEC.md`、`docs/IMPLEMENTATION.md`、
  `docs/ACCEPTANCE.md`、`docs/CHANGELOG.md`、中英文 README、`urls.example.yaml`。
- 验收：`AC-P0-007`、`AC-P0-008`、`AC-P0-126` 及既有响应式、键盘、reduced motion、性能门禁。
- 验证：
  - `go test -race ./...`、`go vet ./...`：通过；严格加载器覆盖页面顺序、重复 ID、旧结构拒绝、
    跨页运行时 ID 和热加载快照。
  - `npm --prefix web run lint`、`typecheck`、`build`：通过；生产 CSS gzip 10.25 KiB、JS gzip
    148.62 KiB，继续低于 300 KiB 门禁。
  - `npm --prefix web run test`：19 个文件、69 项通过；statements 96.55%、branches 78.02%、
    functions 94.00%、lines 96.97%。
  - `npm --prefix web run storybook:test`：通过；新增 PagePagination 交互与末页 Story。仅保留
    Storybook 上游 `module.register()` deprecation warning。
  - `npm --prefix web run test:visual`：26/26 通过；新增第二页分页基线，并更新受底部控件影响的
    full-page 基线。
  - `npx playwright test --project=chromium --project=firefox --project=webkit --workers=1`：51/51
    通过；分页切换、当前页搜索清理、标题同步、移动端、overflow 和 axe 均通过。高并发复跑曾使
    既有 provider 菜单用例资源竞争超时，隔离复跑 4/4 与全套串行复跑均通过。
  - Codex in-app Browser：1440x900 和 390x844 人工复核第二页；分页为 182x50px，桌面/手机
    `scrollWidth === clientWidth`，当前页、首尾禁用状态、safe area 和 console 均正常。
  - `make build` 后以临时端口 `127.0.0.1:18080` 启动真实二进制；`/health` 返回 `ok`，
    `/api/catalog` 返回 page1/page2 新协议，嵌入式 `/` 返回 200；smoke 进程已停止。

### CHG-20260803-031 固定 Navi 监听端口为 9999

- 日期：2026-08-03
- 状态：rejected
- 类型：backend / configuration / deployment / documentation
- 原行为：`server.port` 接受 `1-65535` 的任意合法端口，示例与验收默认使用 `8080`。
- 提议行为：Navi 只接受并只监听 `9999`。
- 拒绝原因：项目负责人随后澄清 `9999` 只用于本次二进制测试，不是长期产品或配置契约。
- 结论：保留 `server.port` 的原有范围和示例默认值 `8080`；最终测试将临时以 `9999` 启动，
  不修改设计、验收或部署默认值。

### CHG-20260803-032 完成 Go 后端与单二进制交付链路

- 日期：2026-08-03
- 状态：implemented
- 类型：backend / API / caching / lifecycle / build / container / documentation
- 原行为：前端通过 Vite fixture 模拟目录、状态、SSE 与跳转接口；项目没有 Go module、实际 YAML
  加载、文件热更新、favicon 派生缓存、目的地解析、HTTP API、嵌入式前端或二进制交付物。
- 新行为：Navi 使用 Go 读取严格校验的 `config.yaml` 与 `urls.yaml`，发布不可变目录快照并在合法
  文件变更后通过 SSE 通知页面；后台受限发现/缓存 favicon；private 探测失败后回退 public；提供
  只读 catalog、status、events、icons、health 与 `/go/{id}` 路由；生产前端嵌入 `navi`。
- 构建与运行：`make build` 构建嵌入式二进制并注入版本信息；`navi --version` 不读取配置；新增
  非 root 多阶段 Dockerfile、Docker 忽略规则与中英文运行说明。`9999` 只作为本次临时 smoke
  test 端口，不改变默认配置或端口契约。
- 影响：实现 `docs/IMPLEMENTATION.md` 的 Task 1-9、14 和 16 的后端范围；Task 15 的既有前端
  浏览器与视觉测试继续保留，新增 Go API/SSE/图标缓存测试。没有新增数据库、写 API、登录或 YAML
  回写。
- 验收：`AC-P0-001` 至 `AC-P0-021`、`AC-P0-301` 至 `AC-P0-304`、`AC-P0-401` 至
  `AC-P0-404` 的实现基础；完整跨平台、真实设备、Docker 与外部网络 fixture 验收仍按发布环境
  执行。
- 验证：
  - `make build`：通过，生成嵌入前端的 `navi`；`./navi --version` 输出 `dev`、当前提交与构建时间。
  - `go test -race ./...`、`go vet ./...`：通过。
  - `npm --prefix web run lint`、`typecheck`、`test`、`build`：通过；Vitest 18 个文件、66 个测试。
  - 使用临时 fixture 在 `2026-08-03` 启动 `navi -f <temporary-config>`，监听
    `127.0.0.1:9999`；`/health` 返回 `ok`，`/api/catalog` 返回真实 YAML 目录，`/` 返回嵌入前端，
    `POST /api/catalog` 返回 `405`。
  - 本机无 Docker daemon、`staticcheck` 和 `govulncheck` 可执行文件，因此容器构建、静态检查与
  漏洞扫描未在本机执行，保留为发布门禁。

### CHG-20260803-033 修复 SSE 被全局写超时中断

- 日期：2026-08-03
- 状态：implemented
- 类型：backend / SSE / reliability / testing
- 原行为：HTTP server 的全局 `write_timeout` 同样作用于 `/api/events` 长连接；连接超过该时限后
  会被服务端关闭，前端因此间歇显示“实时更新暂停”。
- 新行为：SSE handler 在建立流后清除该响应的写入 deadline，并继续每 15 秒发送心跳；普通 API、
  静态资源与跳转路由仍使用主配置的 `write_timeout`。
- 影响：只修复既有 SSE 连通性契约，不改变事件名称、事件数据、重连策略、健康状态或超时配置。
- 验证：新增回归测试使用 `30ms` HTTP `WriteTimeout` 与 `10ms` 心跳，持续读取五个心跳仍保持连接；
  `go test ./internal/httpapi` 通过。

### CHG-20260801-001 初始需求基线

- 日期：2026-08-01
- 状态：accepted，随后被 002 和 003 部分替代
- 类型：product / architecture
- 原需求：无。
- 新需求：
  - 创建个人导航系统。
  - 后端使用 Go。
  - 主配置使用 `config.yaml`，可定义第二个 `urls.yaml` 路径。
  - 支持 `-f` 和 `configpath` 指定主配置。
  - 链接包含 name、group、private_url、public_url。
  - private 不可达时自动回退 public。
  - UI 为现代、克制、黑白、高质感风格。
  - 最初包含登录、拖拽排序、数据库保存和 YAML 回写设想。
- 影响：建立项目产品方向和文档优先工作方式。
- 文档：全部。
- 验证：文档阶段，不适用。

### CHG-20260801-002 取消登录并确立 YAML 唯一事实源

- 日期：2026-08-01
- 状态：implemented
- 类型：scope / architecture
- 原需求：系统包含登录；拖拽布局写入数据库并回写 YAML。
- 新需求：
  - 不需要用户登录或用户体系。
  - `urls.yaml` 作为唯一事实来源。
  - 不使用数据库。
- 原因：减少状态源和维护复杂度，将产品重心放回导航展示。
- 影响：
  - 删除认证、会话、用户、数据库、迁移和双写一致性设计。
  - 默认仅监听 loopback；公网暴露时由外部反向代理负责访问控制。
- 文档：`DESIGN.md`、`IMPLEMENTATION.md`、`ACCEPTANCE.md`、中英文 README。
- 验收：新增 YAML 单一事实源、无数据库、无登录入口检查。
- 验证：文档阶段，不适用。

### CHG-20260801-003 取消拖拽与 Web 写入，聚焦 UI/UX 渲染

- 日期：2026-08-01
- 状态：implemented
- 类型：product / UX / API
- 原需求：右上角设置中拖拽调整位置，并自动保存。
- 新需求：
  - 不提供拖拽排序。
  - 不提供设置中的内容编辑、保存或 YAML 回写。
  - YAML 数组顺序直接决定页面顺序。
  - 产品主要特点是以高质量 UI/UX 渲染 YAML 内容。
- 原因：确保 `urls.yaml` 是直接、可审阅、无歧义的唯一事实来源。
- 影响：
  - 删除写 API、排序状态、乐观并发和原子回写实现。
  - 保留只读热加载，使手工修改 YAML 后页面自动更新。
  - UI 工作优先级提高，增加响应式、搜索、主题、可访问性和视觉回归要求。
- 文档：全部。
- 验收：`AC-P0-006`、`AC-P0-007`、`AC-P0-101` 至 `AC-P1-121`。
- 验证：文档阶段，不适用。

### CHG-20260801-004 自动抓取并本地缓存 Favicon

- 日期：2026-08-01
- 状态：implemented
- 类型：feature / configuration / storage
- 原需求：链接图标未最终确定，可通过 YAML 显式配置或使用字标。
- 新需求：
  - 根据链接目标自动发现并下载 favicon。
  - 图标保存到本地 `datadir/favicons`。
  - `datadir` 在 `config.yaml` 中配置。
  - 图标缓存失败时使用字标，不影响导航渲染和跳转。
- 原因：减少 YAML 维护成本，同时让链接卡片更易识别、更有质感。
- 影响：
  - 主配置增加 `datadir` 和可选 `favicon` 参数。
  - 增加 HTML icon 声明发现、`/favicon.ico` 回退、后台抓取、本地缓存与安全校验。
  - favicon 是可重建派生缓存，不改变 `urls.yaml` 的唯一事实源地位。
- 文档：全部。
- 验收：`AC-P0-018` 至 `AC-P0-021`、`AC-P0-108`、`AC-P0-303`。
- 验证：文档阶段，不适用。

### CHG-20260801-005 将 UI/UX 与自然动效提升为最高产品目标

- 日期：2026-08-01
- 状态：implemented
- 类型：product / UI / UX / motion
- 原需求：UI 具有现代、克制、黑白和高级质感，并包含基础状态动效。
- 新需求：
  - Navi 的唯一核心产品目标是 UI/UX 好看、自然且适合长期使用。
  - 参考 Apple、Material、Fluent、Linear 等成熟界面的原则和完成度，不复制品牌外观。
  - 建立统一 motion token，并明确首次进入、hover、press、搜索重排、favicon 到达、
    YAML 热更新、主题切换和错误反馈的动效。
  - UI/UX 验收拥有发布否决权。
- 原因：确认项目差异化不在功能数量，而在将 YAML 内容呈现为高品质导航体验。
- 影响：
  - 前端增加 Motion for React 和统一动效基础设施。
  - 设计文档增加体验标杆、具体时间线、spring、性能和 reduced-motion 规则。
  - 验收增加状态连续性、主观体验门禁、录像和性能 trace。
- 文档：全部。
- 验收：`AC-P0-109`、`AC-P0-110`、`AC-P0-112`、`AC-P1-121`。
- 验证：文档阶段，不适用。

### CHG-20260801-006 动效不设置最高帧率并适配 165Hz

- 日期：2026-08-01
- 状态：accepted
- 类型：performance / motion
- 原需求：以 60Hz 的 16.7ms 帧预算作为通用流畅度目标。
- 新需求：
  - 不锁定 60fps，也不设置其他人为最高帧率。
  - 动效通过 CSS compositor、WAAPI、Motion 和 requestAnimationFrame 跟随显示器刷新率。
  - 165Hz 环境以约 6.06ms 原生帧预算为优化和验收参考。
- 原因：主要使用设备为 165Hz，界面应充分利用高刷新率而不是被 60Hz 设计限制。
- 影响：
  - 删除固定 60fps 假设。
  - 增加 60Hz/165Hz 双环境 trace、rAF 采样、掉帧率和锁帧检查。
- 文档：`DESIGN.md`、`IMPLEMENTATION.md`、`ACCEPTANCE.md`、中英文 README。
- 验收：`AC-P0-111`。
- 验证：文档阶段，不适用。

### CHG-20260801-007 建立生产级代码规范与零弃用门禁

- 日期：2026-08-01
- 状态：accepted
- 类型：engineering / quality / maintainability
- 原需求：代码实现遵循实施计划，但尚未独立定义文件命名、代码组织、函数命名和弃用检查。
- 新需求：
  - 代码按生产级标准实现，并优先遵循 Go、React 和 TypeScript 官方建议。
  - 为 Go package、文件、标识符、initialism、函数、接口、错误、context 和并发定义规范。
  - 前端按 feature 组织，启用 React Rules 和 TypeScript strict。
  - 新代码不使用标记 Deprecated 或 @deprecated 的 API、字段、组件和依赖。
  - Staticcheck SA1019、typescript-eslint no-deprecated、govulncheck、race 和 audit
    成为发布门禁。
- 原因：保证第一版从目录结构到实现细节都具备长期维护、升级和生产运行质量。
- 影响：
  - 新增 `docs/CODING_STANDARDS.md` 并纳入文档优先级。
  - 调整前端目标目录为 feature-based 结构。
  - 实施与验收增加命名、依赖方向、严格类型、生命周期和零弃用检查。
- 文档：全部。
- 验收：`AC-P0-401` 至 `AC-P0-407`。
- 验证：文档阶段，不适用。

### CHG-20260801-008 建立全设备响应式与组件一致性门禁

- 日期：2026-08-01
- 状态：accepted
- 类型：UI / responsive / testing / quality
- 原需求：覆盖少量桌面、平板和手机视口，进行基础响应式与截图验收。
- 新需求：
  - 支持手机、平板、笔记本、桌面、超宽屏和 5K 等多种分辨率。
  - 覆盖横竖屏、分屏、DPR、缩放、系统字体、safe area、触控、键鼠和高对比度。
  - 为每个组件定义统一尺寸、间距、排版、状态、溢出和响应式契约。
  - 使用 Storybook 状态库、Playwright 三浏览器矩阵、视觉回归和 DOM 几何断言。
  - 任意上下间距不一致、错位、重叠、裁切或非预期横向滚动阻止发布。
- 原因：UI/UX 是项目唯一核心目标，单个桌面截图不能证明多场景质量。
- 影响：
  - 新增 `docs/UI_SPEC.md` 并纳入文档优先级。
  - 实施增加 Storybook、完整视口矩阵、真实设备 smoke 和几何测试。
  - 验收扩展到 320-5120 CSS px、Chromium/Firefox/WebKit 和 200%/400% zoom。
- 文档：全部。
- 验收：`AC-P0-103`、`AC-P0-106`、`AC-P0-113` 至 `AC-P1-121`。
- 验证：文档阶段，不适用。

### CHG-20260801-009 实现第一阶段前端 UI/UX 基线

- 日期：2026-08-01
- 状态：implemented
- 类型：implementation / frontend / UI / UX / testing
- 原行为：仓库只有已批准的产品、UI、编码、实施和验收文档，没有可运行的前端工程。
- 新行为：
  - 新增 `web/` React + TypeScript + Vite 工程，生产代码只读取文档规定的
    `/api/catalog`、`/api/status`、`/api/events`、`/api/icons/{runtime_id}` 和
    `/go/{runtime_id}`；Vite 开发服务器只提供确定性只读 fixture，不进入生产构建，
    不成为第二份导航事实源。
  - 实现默认深色、浅色和跟随系统主题；手动主题偏好只写浏览器 `localStorage`。
  - 实现 TopBar、桌面搜索、移动搜索 overlay、GroupSection、LinkCard、Favicon/Monogram、
    IconButton/Tooltip、StatusBanner、LoadingSkeleton、EmptyState 和 FailurePage。
  - 实现名称、分组、description 和 tags 的实时搜索，保留分组与 YAML 顺序；支持 `/`、
    `Ctrl/Cmd+K`、`Escape`、方向键和 Enter 流程。
  - 实现 SSE 连接状态与指数退避重连、目录和 favicon 事件失效刷新、degraded/offline
    提示、刷新命令和稳定的最后有效目录呈现。
  - 实现 320px 起的内容驱动 Grid、safe area、44x44 命令目标、36x36 图标容器、
    88px 卡片最小高度、reduced motion、forced colors 和 overlay 焦点/滚动隔离。
  - 按统一 token 实现首次进入、hover、press、搜索退出/补位、favicon crossfade、
    状态条和主题颜色动效；高频动效不使用 timer 逐帧驱动或人为锁帧。
  - 新增严格 ESLint/TypeScript、Vitest、Storybook、Playwright、axe 和受版本控制的
    dark/light、no-results、degraded、failure、mobile search 视觉基线。
- 依赖选择：
  - React/Vite/TypeScript：执行已批准的前端架构；TypeScript 固定在 ESLint 类型插件
    官方 peer range 内，未用强制安装绕过兼容性。
  - TanStack Query：管理目录和状态 server state、缓存失效与重试，避免复制到客户端 store。
  - Motion for React：实现已批准的 layout continuity、退出和 reduced-motion 行为；简单
    hover/press 仍使用 CSS transition 控制体积和响应速度。
  - Lucide React：统一命令图标；没有引入品牌图标包，favicon 仍由服务端自动发现。
  - Zod：在 API 边界执行运行时解码并限制 URL 为 HTTP/HTTPS。
  - Storybook/Vitest/Playwright/axe：分别提供组件状态库、单元覆盖、三浏览器行为/几何/
    视觉回归和 WCAG 自动扫描；fixture 不访问公共互联网。
- 原因：执行用户确认的“以 docs 为唯一事实来源，只实现前端并追求最高 UI/UX 完成度”。
- 影响：新增 `web/` 前端源码、配置、测试、视觉基线、lockfile 和根 `.gitignore`；
  产品需求、API 路径、YAML 模型和只读边界没有变化，因此本次只更新本变更文档。
- 代码：`web/`、`.gitignore`。
- 文档：`docs/CHANGELOG.md`。
- 验收：前端范围覆盖 `AC-P0-101` 至 `AC-P0-110`、`AC-P0-113` 至
  `AC-P1-121`、`AC-P0-202`、`AC-P0-403` 至 `AC-P0-405`；真实设备、完整 nightly、
  165Hz trace 和后端联调仍按原验收文档执行。
- 验证：
  - `npm --prefix web run lint`：通过，0 error/warning。
  - `npm --prefix web run typecheck`：通过，strict、`noUncheckedIndexedAccess`、
    `exactOptionalPropertyTypes` 等门禁开启。
  - `npm --prefix web run test`：32 项通过；statements 94.30%、branches 78.01%、
    functions 89.79%、lines 95.97%。
  - `npm --prefix web run build`：通过；生产 CSS gzip 4.05 KiB，JS gzip 136.21 KiB，
    初始压缩资源低于 300 KiB 目标。
  - `npm --prefix web run storybook:test`：通过，全部 stories 可构建。Node 26 下 Storybook
    10.5.5 的上游加载器会输出 `DEP0205 module.register()` 警告；项目源码未调用该 API，
    浏览器运行时 console 为 0 error/warning，后续 Storybook 修复版本发布后应移除该上游警告。
  - `npm --prefix web run test:e2e`：15 项通过，覆盖 Chromium、Firefox、WebKit 的
    桌面布局、390px 移动 overlay、搜索顺序、主题持久化、几何和 axe serious/critical 扫描。
  - `npm --prefix web run test:visual`：6 项通过，覆盖深色首页、浅色首页、空结果、
    degraded、首次加载失败和移动搜索 overlay。
  - `npm --prefix web audit --omit=dev`：0 vulnerability。
  - Codex in-app Browser：在默认 1280px 和 390x844 检查页面 identity、DOM、console、
    搜索、overlay、焦点恢复、滚动锁和主题；根节点无横向溢出，卡片高 88px，命令目标
    44x44，overlay 关闭后 `inert`/`aria-hidden`/body scroll 均恢复。
  - 未执行：真实 iOS/Android/iPad/Windows 设备 smoke、200%/400% 浏览器 zoom、
    320-5120px 完整连续几何扫描、165Hz Performance trace 和后端真实 SSE/favicon/跳转联调。

### CHG-20260801-010 扩展固定开发目录并统一本地测试端口

- 日期：2026-08-01
- 状态：implemented
- 类型：implementation / frontend / development fixture / testing
- 原行为：Vite 开发服务器只提供 2 个链接、2 个等长分组的最小目录 fixture；默认开发端口
  未固定，难以直接检验大量链接、不等长分组、搜索覆盖和长页面布局。
- 新行为：
  - 提供一份显式、固定、可由目录协议校验的大型开发 fixture，覆盖 GitHub、百度、Google
    等常用站点，以及中文、英文、公共 URL、private/public 双地址和多种搜索标签。
  - fixture 使用不等长分组，专门覆盖完整行、残缺尾行、跨分组搜索和长页面滚动。
  - Vite 开发 API 继续只在 `serve` 模式启用，并使用 fixture 模拟只读目录、状态、SSE 和
    `/go/{runtime_id}` 跳转；fixture 不进入生产状态，也不替代 `urls.yaml` 的唯一事实源地位。
  - `npm run dev` 固定监听 `127.0.0.1:10090`，用于本地前端访问测试。
- 原因：为当前前端 UI/UX 提供足够丰富、稳定且可重复的人工测试数据，不依赖尚未实现的后端。
- 影响：仅影响前端开发服务器、开发 fixture、对应测试和本地启动命令；生产 API 契约、只读
  边界、目录顺序规则和生产构建行为不变。
- 代码：`web/src/test/mockCatalog.ts`、`web/src/test/mockCatalog.test.ts`、
  `web/vite.config.ts`、`web/package.json`、`web/tsconfig.app.json`、
  `web/tests/e2e/visual.spec.ts-snapshots/`。
- 文档：`docs/CHANGELOG.md`。
- 验收：开发 fixture 协议有效、runtime ID 唯一、链接总量和分组数量固定、分组长度不等；
  `127.0.0.1:10090` 可加载完整目录、搜索并打开模拟跳转。
- 验证：
  - `npm --prefix web run lint`：通过，0 error/warning。
  - `npm --prefix web run typecheck`：通过，包含 Vite 配置和大型 fixture 的严格类型检查。
  - `npm --prefix web run test`：33 项通过；新增测试确认 10 个分组、83 条链接、runtime ID
    唯一、分组长度不等并包含 GitHub、百度、Google 与双地址 Grafana。
  - `npm --prefix web run build`：通过且无构建 warning；生产 CSS gzip 4.05 KiB，JS gzip
    136.21 KiB，开发 fixture 未进入生产 bundle。
  - `npm --prefix web run test:e2e`：15 项通过，覆盖 Chromium、Firefox、WebKit 的布局、
    搜索、移动 overlay、主题与 axe serious/critical 扫描。
  - `npm --prefix web run test:visual`：6 项通过；已更新并复核大型目录的深色、浅色、
    degraded、空结果、失败和移动搜索视觉基线。
  - 开发 API smoke：`/api/catalog` 返回 revision 10、10 个分组、83 条链接，分组长度为
    `12/11/7/8/9/6/8/7/7/8`；`/api/status` 返回 ok；`/go/github` 返回 302 并指向
    `https://github.com/`。
  - Codex in-app Browser：在 1280px 和 390x844 验证页面 identity、83 条目录、10 个分组、
    “百度”单结果搜索、GitHub 移动搜索、overlay 滚动锁与焦点恢复；无横向溢出，console
    0 error/warning。

### CHG-20260801-011 建立撞色主题系统并扩展卡片描述

- 日期：2026-08-01
- 状态：implemented
- 类型：product / configuration / frontend / UI / UX / accessibility
- 原行为：页面只有跟随系统、浅色、深色三种中性模式，主题入口按点击循环；链接描述
  仅显示一行，较长说明会过早省略；主配置没有默认主题字段。
- 新行为：
  - 将系统黑白外观统一命名为“默认”，并新增绀樱夜、薄荷汐、苔庭青、茶雾青、琥珀潮、
    晴海橙、藤萝青 7 个彩色主题。
  - 用户给出的四组核心色保持不变，其中第四组确认为
    `#FAF3E9 / #A8703F / #5C614D`；另外三组由前端设计补充。
  - 顶栏主题入口改为可访问下拉菜单，显示三色色样、名称、描述和当前项；本地选择覆盖
    `config.yaml` 默认值并在刷新后保留。
  - 主配置新增严格枚举字段 `theme`，默认 `default`；配置示例在字段上方列出全部可用值。
  - 链接 description 从单行省略改为稳定两行，卡片最小高度同步增至 104px，加载骨架
    使用相同几何。
- 原因：让导航在保持克制密度和长期可读性的同时具备可选择的鲜明视觉性格，并让说明
  文本在真实目录中更完整可读。
- 影响：更新主配置契约、公开目录主题字段、前端主题状态、设计 token、TopBar、LinkCard、
  LoadingCatalog、Storybook、单元测试、E2E 和视觉基线；不改变 `urls.yaml` 唯一事实源、
  只读 API 和导航顺序。
- 代码：`web/src/styles/tokens.css`、`web/src/styles/global.css`、
  `web/src/app/App.module.css`、`web/src/app/TopBar.module.css`、
  `web/src/features/theme/`、`web/src/features/catalog/`、
  `web/src/features/search/SearchField.module.css`、`web/src/shared/ui/`、
  `web/tests/e2e/visual.spec.ts` 及其视觉基线。
- 文档：`docs/DESIGN.md`、`docs/IMPLEMENTATION.md`、`docs/ACCEPTANCE.md`、
  `docs/UI_SPEC.md`、`docs/CHANGELOG.md`、中英文 README。
- 验收：8 个主题配置值、配置默认与本地覆盖优先级、主题菜单完整键盘操作、全部主题 AA
  对比度、无闪烁切换、两行 description 和 104px 稳定卡片几何。
- 验证：
  - `npm --prefix web run lint`：通过，0 error/warning。
  - `npm --prefix web run typecheck`：通过。
  - `npm --prefix web run test`：39 项通过；statements 95.69%、branches 76.59%、
    functions 92.42%、lines 96.93%。
  - `npm --prefix web run build`：通过；生产 CSS gzip 6.57 KiB，JS gzip 137.36 KiB。
  - `npm --prefix web run test:e2e`：Chromium、Firefox、WebKit 共 15 项通过，包含主题持久化、
    桌面/移动几何、键盘流程和 axe serious/critical 检查。
  - `npm --prefix web run test:visual`：14 项通过，覆盖默认深浅色、7 个彩色主题、主题菜单、
    移动搜索、空结果、degraded 和 failure；视觉基线已更新。
  - Codex in-app Browser：在 1440x900 和 390x844 检查默认、绀樱夜、茶雾青、晴海橙、
    主题菜单和移动布局；菜单保持在可视区内，description 为两行契约，页面无横向溢出。

### CHG-20260801-012 将撞色主题重构为中性画布与局部主题刻度

- 日期：2026-08-01
- 状态：implemented
- 类型：UI / UX / visual design / accessibility / testing
- 原行为：第一轮彩色主题把核心色大面积铺到页面背景、表面和卡片边框；高饱和颜色平均
  分布在所有内容上，卡片轮廓噪声过多，色彩层级压过信息层级，主题菜单在窄屏打开时也
  显得拥挤。
- 新行为：
  - 全部彩色主题改用中性或低彩度画布，用户给定的核心色只映射到分组 3px 刻度、36px
    图标底与字标、选中、焦点、hover 和主题预览色样。
  - 卡片默认使用中性 1px 边框和 2px 短边缘刻度；只有 hover/focus 才增强主题色、阴影与
    外链图标反馈，不再给每张卡片绘制彩色轮廓。
  - 内容 Grid 最小列宽从 220px 调整为 272px，在 1440px 桌面形成更舒展的四列结构，
    仍保持内容驱动自动降列和 320px 单列支持。
  - 顶栏采用中性半透明表面、低对比度边界和单一主题刻度；搜索框改为安静填充面，焦点用
    低面积主题环表达。
  - 主题菜单保持中性表面，宽度扩展到 336px 上限；移动端固定在安全边距内并限制高度，
    当前项通过主题底、左侧刻度、勾选与 `aria-checked` 共同表达。
  - 统一加深全部浅色主题 tertiary text；默认浅色从 4.14:1 提高到 AA 阈值以上，并同步
    校准其余彩色浅色主题的小字号辅助文字。
  - 修复 degraded 视觉测试未等待目录加载完成导致 900px/3646px 高度交替的基线抖动。
- 原因：项目负责人明确否决第一轮彩色视觉；撞色需要成为有节制的视觉重点，而不是整页
  换肤。此次重构以长期浏览舒适度、信息层级和局部识别度优先。
- 影响：只改变前端视觉 token、布局密度、组件样式、视觉测试和设计文档；主题标识、核心
  色、配置协议、本地覆盖规则、83 条固定 mock、只读 API、导航顺序和两行 description
  行为保持不变。
- 代码：`web/src/styles/`、`web/src/app/*.module.css`、
  `web/src/features/catalog/*.module.css`、`web/src/features/theme/ThemeButton.module.css`、
  `web/src/features/search/SearchField.module.css`、`web/src/shared/ui/*.module.css`、
  `web/tests/e2e/visual.spec.ts` 及其 14 张视觉基线。
- 文档：`docs/DESIGN.md`、`docs/UI_SPEC.md`、`docs/ACCEPTANCE.md`、
  `docs/CHANGELOG.md`、中英文 README。
- 验收：中性画布、局部撞色、四列桌面密度、主题菜单移动端可视区、全部主题文字与焦点 AA、
  默认中性边框、两行 description、无横向溢出、视觉回归稳定。
- 验证：同 `CHG-20260801-011`；额外通过主题总览图、茶雾青/晴海橙单主题截图、默认主题
  菜单和 390x844 移动搜索截图人工复核。

### CHG-20260801-013 增加开放式外部搜索工作台

- 日期：2026-08-01
- 状态：implemented
- 类型：feature / frontend / UI / UX / accessibility
- 原行为：首页从顶栏直接进入密集导航卡片，首屏几乎全部由链接项目占据；现有搜索只用于
  筛选本地导航，不能向外部搜索引擎或模型提交查询。
- 新行为：
  - 在顶栏和导航目录之间增加约 38vh 的开放式搜索工作台，以留白和单一连续搜索表面建立
    首屏主次，1440x900 仍保留第一导航分组预览。
  - 网页 provider 包含百度、Google、Yandex、Bing 国际版和 GitHub，默认百度；点击搜索或
    Enter 在新标签页打开编码后的查询结果。
  - 模型 provider 包含 ChatGPT、Claude、Gemini；ChatGPT 携带查询打开，Claude/Gemini
    打开官方新对话页并尝试复制问题，通过稳定状态文字反馈复制结果。
  - 网页与模型使用两个可访问 `radiogroup`，视觉保持中性并复用当前主题 token，不引入品牌
    色、营销 hero、大卡片或装饰渐变。
- 原因：项目负责人认为全屏链接卡片过于密集，希望首页首先具备大气、留白充分且真正可用
  的搜索入口，同时保留导航作为下半部分核心内容。
- 影响：新增前端外部搜索组件、provider URL 规则、剪贴板降级、单元/E2E/视觉测试和首屏
  布局规范；不修改 `urls.yaml`、目录 API、主题协议、本地导航筛选或 83 条固定 mock。
- 代码：`web/src/features/web-search/`、`web/src/app/App.tsx`、
  `web/src/app/TopBar.module.css`、`web/src/features/search/SearchField.tsx`、
  `web/tests/e2e/navi.spec.ts`、`web/tests/e2e/visual.spec.ts` 及其视觉基线。
- 文档：`docs/DESIGN.md`、`docs/UI_SPEC.md`、`docs/ACCEPTANCE.md`、
  `docs/CHANGELOG.md`、中英文 README。
- 验收：`AC-P0-122` 及既有响应式、键盘、可访问性和视觉门禁。
- 验证：
  - `npm --prefix web run lint`：通过，0 error/warning。
  - `npm --prefix web run typecheck`：通过，React 19/TypeScript 6 严格类型和零弃用门禁开启。
  - `npm --prefix web run test`：43 项通过；statements 95.01%、branches 76.69%、
    functions 92.04%、lines 95.91%。
  - `npm --prefix web run build`：通过；生产 CSS gzip 7.28 KiB，JS gzip 138.64 KiB。
  - `npm --prefix web run test:e2e`：Chromium、Firefox、WebKit 共 18 项通过；新增覆盖 Bing
    国际版 URL、Enter 提交、Claude 剪贴板降级、首屏工作台几何和 serious/critical axe。
  - `npm --prefix web run test:visual`：15 项通过；新增 390x844 外部搜索工作台基线，并更新
    默认深浅、7 个彩色主题、菜单、overlay、异常和空状态基线。
  - Codex in-app Browser：在 1440x900 和 390x844 人工复核搜索工作台、网页/模型 provider、
    第一导航分组露出、四列/单列目录、主题适配和移动端换行；无横向溢出。

### CHG-20260801-014 精修品牌图标与搜索材质系统

- 日期：2026-08-01
- 状态：implemented
- 类型：frontend / UI / UX / visual design / accessibility
- 原行为：主输入框左侧直接显示当前 provider 名称，百度、Google、Bing 国际版等名称宽度
  不同，切换时输入起点变化；选择器只有文字，品牌识别弱；搜索色带与输入表面层次偏平。
- 新行为：
  - 百度、Google、Yandex、Bing、GitHub、ChatGPT、Claude、Gemini 全部使用 SVG 品牌图标；
    主输入框左侧改为固定 48px 图标槽，彻底消除名称长度造成的几何抖动。
  - provider 选项使用统一尺寸图标与短标签；品牌原色仅用于图标本体，选中、焦点、边框、
    阴影和动效继续使用当前主题 token，避免八套品牌色与撞色主题互相竞争。
  - 搜索表面改为低透明材质、细边界、内高光、有限阴影和受控 blur；不支持 blur 时使用
    不透明 surface fallback，始终保证文字对比和焦点清晰。
  - 搜索色带增加极低对比的规则网格与结构刻度，只增强空间层次，不使用渐变光球、bokeh、
    图片背景、装饰性玻璃拟态或持续循环动画。
  - 设计原则吸收 Apple Materials 的内容可读性、Fluent Acrylic 的分层与 fallback、
    Material 3 的表面层级和 Carbon 的 layer token 思路，具体实现仍以本仓库文档为唯一契约。
- 原因：项目负责人认为现有搜索组件完成度尚可但不够惊艳，并明确要求解决 provider 文本
  长短不一、补齐图标及提升整体 UI/UX 质感。
- 影响：更新 UniversalSearch、品牌图标依赖、搜索材质 token、组件测试、E2E、视觉基线和
  设计文档；搜索 URL、模型剪贴板降级、主题协议、83 条开发 fixture 与本地导航筛选不变。
- 依赖选择：
  - `simple-icons@16.27.1` 提供百度、Google、GitHub、Claude 和 Gemini 的可 tree-shake
    SVG path；Yandex、Bing 和 ChatGPT 使用项目内固定 SVG path，避免引入第二个品牌包。
  - 生产构建只保留实际使用的图标，新增后 JS gzip 为 143.26 KiB，仍远低于 300 KiB 门禁。
- 代码：`web/src/features/web-search/ProviderIcon.tsx`、
  `web/src/features/web-search/UniversalSearch.tsx`、
  `web/src/features/web-search/UniversalSearch.module.css`、
  `web/src/features/web-search/providers.ts`、`web/src/styles/tokens.css`、
  `web/package.json`、`web/package-lock.json`、相关单元/E2E/视觉测试及 15 张视觉基线。
- 文档：`docs/DESIGN.md`、`docs/UI_SPEC.md`、`docs/ACCEPTANCE.md`、
  `docs/IMPLEMENTATION.md`、`docs/CHANGELOG.md`。
- 验收：`AC-P0-122` 及既有响应式、键盘、可访问性、性能和视觉回归门禁。
- 验证：
  - `npm --prefix web run lint`：通过，0 error/warning。
  - `npm --prefix web run typecheck`：通过，严格类型与 `exactOptionalPropertyTypes` 门禁开启。
  - `npm --prefix web run test`：14 个文件、44 项通过；statements 95.11%、branches 77.14%、
    functions 92.13%、lines 96.00%。
  - `npm --prefix web run build`：通过；生产 CSS gzip 8.14 KiB，JS gzip 143.26 KiB。
  - `npm --prefix web run storybook:test`：通过；UniversalSearch story 与全部组件 story 可构建。
    Storybook 10.5.5 在 Node 26 下仍输出其上游 `DEP0205 module.register()` 警告，项目源码未
    调用该 API。
  - `npm --prefix web run test:e2e`：Chromium、Firefox、WebKit 共 18 项通过；新增断言 48px
    固定图标槽、9 个当前/选项图标实例，以及百度切换 Bing 后输入与提交按钮 X 坐标不变。
  - `npm --prefix web run test:visual`：15 项通过；更新默认深浅、7 个彩色主题、移动搜索、
    主题菜单、异常和空状态基线，并等待 degraded 提示 transform/opacity 稳定以消除截图抖动。
  - `npm --prefix web audit --omit=dev`：0 vulnerability。
  - Codex in-app Browser：在 1440x900、390x844、默认、绀樱夜和茶雾青检查真实渲染；
    48px 图标槽、输入起点、搜索按钮几何稳定，移动端 `scrollWidth === clientWidth === 390`，
    搜索区高 313px、第一卡片 y=427，console 0 error/warning；ChatGPT 切换后图标正确且输入
    X 坐标保持 290px。开发服务已重启并继续监听 `http://127.0.0.1:10090/`。

### CHG-20260801-015 建立全页背景纹样系统

- 日期：2026-08-01
- 状态：implemented
- 类型：configuration / frontend / UI / UX / visual design / accessibility
- 原行为：几何网格只存在于外部搜索工作台，目录区使用单独的实色背景；主题菜单后没有独立
  的背景样式入口，`config.yaml` 也无法定义默认几何纹样。
- 新行为：
  - 将该能力准确定义为“背景纹样”，主题负责色彩，背景纹样负责几何秩序；顶栏在主题之后
    增加独立选择入口，本地偏好与主题一样覆盖配置并跨刷新保留。
  - 主配置新增严格枚举 `background_pattern`，默认 `meridian-grid`；合法值为 `none`、
    `meridian-grid`、`orbital-rings`、`pisces`、`sagittarius`、`roman-meander`、
    `rose-window`、`eight-point-star`。
  - 中文名称固定为素幕、经纬阵、天游环、双鱼宫、天弓宫、回廊纹、玫瑰窗、八芒阵。
  - 移除搜索区与目录区互相割裂的背景色带，使用一个固定、不可交互、无布局影响的全页
    SVG 纹样层；线色消费当前主题 token，卡片、输入和菜单保持清晰表面。
  - 经纬阵重构为主次网格、透视线与中央轴，并新增天文环、双鱼、弓箭、古典回纹、放射
    玫瑰窗和八芒星 6 套确定性几何路径；不使用随机数、图片纹理或持续动画。
- 原因：项目负责人认可现有直线几何创意，希望线条贯穿下半部分，并可在多种古典、天文与
  星座几何之间切换，以衬托现有主题而不是替代主题。
- 影响：更新配置/API 契约、背景层、TopBar、纹样状态与菜单、fixture、Storybook、单元测试、
  E2E、视觉基线及设计文档；导航内容、搜索 URL、主题标识和 83 条固定 mock 链接不变。
- 代码：`config.yaml`、`web/src/shared/api/backgroundPattern.ts`、
  `web/src/features/background-pattern/`、`web/src/app/App.tsx`、
  `web/src/app/TopBar.tsx`、`web/src/styles/tokens.css`、
  `web/src/features/web-search/UniversalSearch.module.css`、fixture、Storybook、单元/E2E/视觉测试
  及其 23 张视觉基线。
- 文档：`docs/DESIGN.md`、`docs/UI_SPEC.md`、`docs/ACCEPTANCE.md`、
  `docs/IMPLEMENTATION.md`、`docs/CHANGELOG.md`、中英文 README。
- 验收：`AC-P0-123` 及既有响应式、键盘、可访问性、性能和视觉回归门禁。
- 验证：
  - `npm --prefix web run lint`：通过，0 error/warning。
  - `npm --prefix web run typecheck`：通过，严格类型与 `exactOptionalPropertyTypes` 门禁开启。
  - `npm --prefix web run test`：18 个文件、56 项通过；statements 96.34%、branches 78.26%、
    functions 94.21%、lines 97.00%。
  - `npm --prefix web run build`：通过；生产 CSS gzip 8.77 KiB，JS gzip 145.55 KiB，仍低于
    300 KiB 门禁。
  - `npm --prefix web run storybook:test`：通过；新增 BackgroundPattern 与
    BackgroundPatternButton stories。Storybook 10.5.5 在 Node 26 下仍输出其上游
    `DEP0205 module.register()` 警告，项目源码未调用该 API。
  - `npm --prefix web run test:e2e`：Chromium、Firefox、WebKit 共 24 项通过；覆盖入口顺序、
    8 项菜单、配置/本地优先级、刷新持久化、`none`、固定图层、指针穿透、主题切换几何稳定、
    390x844/320x568 无横向溢出和 serious/critical axe。
  - `npm --prefix web run test:visual`：23 项通过；更新既有 15 张基线并新增纹样菜单与 7 套
    代表性主题组合基线。
  - Codex in-app Browser：在 1440x900 和 390x844 人工复核经纬阵、天游环、双鱼宫、
    天弓宫、回廊纹、玫瑰窗、八芒阵与素幕；纹样贯穿搜索/目录，菜单 8 项均有预览，
    `scrollWidth === clientWidth`，console 0 error/warning。开发服务继续监听
    `http://127.0.0.1:10090/`。

### CHG-20260801-016 收束外部搜索为互动椭圆

- 日期：2026-08-01
- 状态：implemented
- 类型：configuration / frontend / UI / UX / motion / accessibility
- 原行为：外部搜索使用 960px 方形连续表面，网页和模型入口常驻为两行 `radiogroup`；默认
  provider 固定为百度，配置不可指定。
- 新行为：
  - 主搜索器改为 999px 圆角椭圆，desktop 静止约 640px，hover、focus 或菜单打开时通过
    Motion FLIP/layout animation 舒展到约 820px；72px 高度和圆角不变。phone 始终满宽、高 60px。
  - 移除常驻 provider 行；当前 provider 的圆形图标按钮打开单个分组菜单，包含 8 个
    `menuitemradio`，支持完整键盘导航、Escape/Tab、外部点击和焦点恢复。
  - 主配置新增严格枚举 `web_search`，默认 `baidu`；API 使用 `site.webSearch`。手动选择只
    覆盖当前会话，刷新回到配置默认值；异步配置到达不会覆盖已经发生的手动选择。
  - 百度入口使用去除微字的定制几何爪印，在 21/24px 下保持清晰，并避免品牌微字在视觉回归中
    产生非确定性的单像素抗锯齿差异。
  - reduced motion 下关闭搜索器位移；移动端确保输入、菜单与首屏预览不被遮挡。
- 原因：项目负责人希望保留现有搜索高度，但让主体更短、更轻盈，并把入口收进当前图标。
- 影响：更新配置/API 契约、UniversalSearch、provider 菜单、fixture、Storybook、单元/E2E/
  视觉测试和设计文档；搜索 URL、模型剪贴板降级、主题、背景纹样与 83 条 mock 链接不变。
- 代码：`config.yaml`、`web/src/shared/api/webSearch.ts`、
  `web/src/shared/api/catalog.ts`、`web/src/features/web-search/`、`web/src/app/App.tsx`、
  fixture 与相关测试。
- 文档：`docs/DESIGN.md`、`docs/UI_SPEC.md`、`docs/ACCEPTANCE.md`、
  `docs/IMPLEMENTATION.md`、`docs/CHANGELOG.md`、中英文 README。
- 验收：`AC-P0-122` 及既有响应式、键盘、reduced motion、性能和视觉回归门禁。
- 验证：
  - `npm --prefix web run lint`、`npm --prefix web run typecheck`、
    `npm --prefix web run build`、`npm --prefix web run storybook:test` 全部通过；生产包 CSS gzip
    9.38 KiB、JS gzip 146.72 KiB。Storybook 仅保留上游 `module.register()` deprecation warning。
  - `npm --prefix web run test`：18 个文件、61 项通过；statements 96.49%、branches 77.22%、
    functions 94.24%、lines 97.46%。
  - `npm --prefix web run test:e2e`：Chromium、Firefox、WebKit 共 30/30 通过；覆盖配置默认值与
    会话选择、640→820px 舒展、72/60px 固定高度、999px 圆角、8 项菜单、
    reduced motion、390x844/320x568、无横向溢出和 serious/critical axe。
  - `npm --prefix web run test:visual`：24 项连续两轮无更新通过；百度定制爪印消除既有随机 1px
    差异，桌面、主题、纹样、provider 菜单和移动端基线稳定。
  - `npm --prefix web audit --omit=dev`：0 vulnerabilities。
  - Codex in-app Browser：在 1280px desktop 与 390x844 人工复核默认态、菜单态和输入态；
    desktop 为 640→820px、72px 高、999px 圆角，phone 为 x=16、358px 宽、60px 高；菜单
    8 项、最小 48px 高且位于 x=16..358，`scrollWidth === clientWidth`，
    console 0 error/warning。开发服务继续监听 `http://127.0.0.1:10090/`。

### CHG-20260802-018 将即时 hover 改为八秒指针展开窗口

- 日期：2026-08-02
- 状态：implemented
- 类型：frontend / UI / UX / motion / testing
- 原行为：desktop 搜索器直接绑定 hover；鼠标快速划过会立刻从 640px 展开到 820px，又在
  pointer-leave 后立即收回。第一版调整为 620ms linear 后虽然消除了弹簧回弹，但反馈明显拖沓，
  恒速位移也缺少自然落位感。
- 新行为：
  - mouse pointer-enter 启动 8000ms 展开窗口，pointer-leave 不触发收回；再次进入清理旧 timer
    并重新计时。计时结束且不存在 focus/menu-open 时自动收回。
  - 展开使用 Motion FLIP、220ms `cubic-bezier(0,0,0.38,0.9)`；收回使用 180ms
    `cubic-bezier(0.2,0,0.38,0.9)`。移除 spring、回弹和 620ms 恒速 linear。
  - 搜索表面和菜单统一使用无回弹 productive easing；reduced motion 继续立即完成。
  - phone 保持 100% 固定宽度，不启动无意义的指针 timer；卸载时清理所有 timer。
- 设计依据：对照 IBM Carbon Motion 的 productive duration/easing 与 Microsoft WinUI Motion
  duration/easing guidance；小范围控件反馈应落在约 150-250ms，严格 linear 容易显得机械，
  用户输入触发的变化应快速响应、平稳减速且不回弹。
- 影响：更新 UniversalSearch 状态与 timer 生命周期、搜索动效、单元/E2E/视觉测试及设计文档；
  provider、搜索 URL、配置、主题、背景纹样和导航数据不变。
- 代码：`web/src/features/web-search/UniversalSearch.tsx`、
  `web/src/features/web-search/UniversalSearch.module.css` 及相关测试。
- 文档：`docs/DESIGN.md`、`docs/UI_SPEC.md`、`docs/IMPLEMENTATION.md`、
  `docs/ACCEPTANCE.md`、`docs/CHANGELOG.md`、中英文 README。
- 验收：`AC-P0-109`、`AC-P0-122` 及 timer 清理、reduced motion、三浏览器和视觉回归门禁。
- 验证：
  - `npm --prefix web run typecheck`、`npm --prefix web run lint`：通过。
  - `npm --prefix web run test`：20 个文件、69 项通过；statements 94.22%、branches 77.47%、
    functions 94.07%、lines 96.29%。
  - `npm --prefix web run build`：通过；生产 CSS gzip 11.88 KiB，JS gzip 149.90 KiB。
  - `npm --prefix web run test:e2e`：Chromium、Firefox、WebKit 共 36/36 通过；覆盖八秒保持、
    快速指针经过、640px 到 820px FLIP、provider/输入/菜单独立展开状态和 compact 几何。
  - `npm --prefix web run test:visual`：24/24 通过，无视觉基线更新。

### CHG-20260802-022 修正 provider 品牌色作用域并稳定入口徽章

- 日期：2026-08-02
- 状态：implemented
- 类型：frontend / UI / UX / rendering / CSS / testing
- 触发路径：项目负责人用截图明确指出，闪烁对象是搜索椭圆左侧的当前 provider 圆形徽章，
  不是右侧搜索提交按钮；此前两轮诊断针对了错误对象。
- 根因：`ProviderIcon` 把 `--provider-brand` 定义在子 SVG 上，而 `.providerTrigger` 与
  `.menuOptionIcon` 却尝试在祖先元素读取该变量。CSS 自定义属性只向后代继承，不会从子节点
  反向传播给祖先，因此祖先声明无效；SVG 又使用 `color: currentColor`，最终继承主题文字色。
  实测百度爪印在藤萝青为 `rgb(51,42,65)`、绀樱夜为 `rgb(221,217,222)`，并被父按钮的
  140ms `color` transition 插值，切换时短暂淡化，形成项目负责人看到的闪烁。
- 决策：provider SVG 在自身直接消费 `--provider-brand`；当前 provider 徽章改为固定纸白
  `#f8fafc` 表面、固定 `#cbd5e1` 边界、固定品牌色和固定中性小箭头，主题切换时只保留
  transform 交互，不执行 background、border、box-shadow 或 color 过渡。菜单图标使用相同
  品牌色作用域规则。
- 清理：开发期直接删除针对右侧提交按钮的遮罩层、主题观察器、动画 hook、重复图标和对应
  测试，不保留兼容分支；右侧提交按钮恢复为普通单层主题按钮，回归门禁改为验证当前
  provider 徽章。
- 回归保护：藤萝青 -> 绀樱夜和绀樱夜 -> 藤萝青逐帧检查徽章背景、边界、SVG/path 品牌色、
  opacity、visibility、filter、唯一图标数量和 DOM 节点身份；同时验证 computed color 与
  SVG 自身 `--provider-brand` 一致，且主题切换没有徽章颜色动画。
- 影响：只修正当前 provider 与 provider 菜单图标的颜色作用域，清理针对右侧按钮的错误修复；
  provider 选择、搜索 URL、配置、搜索器伸缩、背景纹样和导航数据不变。
- 代码：`web/src/features/web-search/ProviderIcon.tsx`、
  `web/src/features/web-search/UniversalSearch.module.css`、
  `web/src/features/web-search/UniversalSearch.test.tsx`、`web/tests/e2e/navi.spec.ts`。
- 文档：`docs/DESIGN.md`、`docs/UI_SPEC.md`、`docs/IMPLEMENTATION.md`、
  `docs/ACCEPTANCE.md`、`docs/CHANGELOG.md`。
- 验收：`AC-P0-107`、`AC-P0-109` 及 Chrome/Arc、三浏览器和视觉回归门禁。
- 验证：
  - `npm run typecheck`、`npm run lint`：通过。
  - `npm run test`：20 个测试文件、70/70 通过；statements 94.22%、branches 77.36%、
    functions 94.07%、lines 96.29%。
  - `npm run build`：通过；生产构建 CSS gzip 11.91 KiB、JS gzip 149.90 KiB。
  - `npm run test:e2e`：Chromium、Firefox、WebKit 共 36/36 通过；其中红框 provider 徽章
    双向逐帧门禁在三引擎均确认背景恒为 `rgb(248,250,252)`、边界恒为
    `rgb(203,213,225)`、百度 SVG/path 恒为 `rgb(41,50,225)`，小箭头配色、DOM 身份、
    opacity、visibility 与 filter 全程稳定，且徽章子树不存在主题颜色动画。
  - `npm run test:visual`：24/24 通过；23 份因 provider 固定徽章和提交按钮恢复主题配色产生的
    基线变化已逐项核对并更新，移动搜索 overlay 无变化。
  - 系统 Google Chrome 150.0.7871.188 CDP screencast：藤萝青 -> 绀樱夜捕获 53 个真实合成帧，
    绀樱夜 -> 藤萝青捕获 58 帧；包含百度爪印和主要纸白核心的中央 32x32 区域在两个方向均
    只有 1 个唯一像素结果，证明图标与核心从第一帧到最后一帧完全一致。圆形外缘因背后页面
    主题变化产生的正常抗锯齿混合不进入核心稳定性判定。
  - Codex in-app Browser 双向交互复测：两个主题下 provider 徽章的背景、边界、品牌 token、
    SVG color、path fill、小箭头背景/边界/颜色七项数值完全一致，图标数量为 1，console
    0 error/warning。

### CHG-20260802-023 开发期生产级死代码与错误方案清理

- 日期：2026-08-02
- 状态：implemented
- 类型：frontend / cleanup / architecture / documentation / testing
- 目标：系统尚未上线，不为失败方案保留任何兼容实现。以 `docs` 最终契约和 `src/main.tsx`
  生产入口为准，全量扫描并删除不可达模块、孤立 CSS Module、未引用选择器、无消费者测试钩子、
  废弃主题变量、无用依赖及两轮错误闪烁修复留下的代码和文档。
- 明确清理：删除右侧提交按钮无人使用的测试钩子、仅为旧遮罩层服务的图标层级样式和特殊
  主题切换规则；恢复 UniversalSearch 普通 background、border、color、box-shadow、transform
  短动效。变更记录只保留最终有效实现，不维护 superseded 实验链。
- 扫描规则：TypeScript `noUnusedLocals/noUnusedParameters`、ESLint、从 `src/main.tsx` 出发的生产
  import graph、测试/Storybook 独立 import graph、CSS Module 文件与类名消费者、`data-testid`
  消费者、package 依赖引用和构建产物均必须检查。只删除能够证明无消费者的内容。
- 验收：生产代码不存在不可达模块、孤立 CSS Module、未引用 CSS class、无消费者测试钩子或
  失败主题方案标识；类型、lint、单元测试、三浏览器 E2E、视觉回归、生产构建和 `10090`
  运行页面全部通过。
- 影响：仅收敛实现和文档，不改变已验收的 provider 徽章、搜索行为、配置、主题结果、
  搜索器几何、背景纹样和导航数据。
- 实现：生产入口扫描确认全部业务模块与 CSS Module 可达；CSS Module 类名均有消费者；删除
  7 个无消费者的 CSS motion/search token、9 处无消费者的主题强调 token 定义、5 个不必要的
  模块导出，以及提交按钮旧方案残留的测试钩子和层级样式。依赖清单逐项核对生产、构建、测试
  与 Storybook 消费者后无需删包。
- 验证：
  - `npm run typecheck`、`npm run lint`、`npm run build` 全部通过；生产构建 CSS gzip
    11.80 KiB、JS gzip 149.87 KiB。
  - `npm run test`：20 个测试文件、70/70 通过；statements 94.22%、branches 77.36%、
    functions 94.07%、lines 96.29%。
  - `npm run test:e2e`：Chromium、Firefox、WebKit 共 36/36 通过；包含搜索器几何、配置默认值、
    主题双向切换、provider 徽章逐帧稳定、移动端、无横向溢出和 axe 门禁。
  - `npm run test:visual`：首次全量运行只有失败页标题出现 9 个抗锯齿像素抖动，未更新基线；
    该用例单独重跑通过，随后全量 24/24 通过，确认不是本次清理引入的稳定视觉变化。
  - `npm run storybook:test`：构建通过；仅输出 Storybook/Node 上游 `module.register()` 弃用提示
    与测试预览包 chunk 体积提示，不进入生产 bundle。
  - `npm audit --omit=dev`：0 vulnerabilities；`npm ls --depth=0` 无 missing/extraneous 依赖。
  - Codex in-app Browser：在 1280x720、`http://127.0.0.1:10090/` 实机复核完整首屏、主题
    藤萝青 -> 绀樱夜 -> 藤萝青切换与 provider 徽章；两主题下徽章背景、边界、百度品牌色、
    path fill、小箭头和单图标数量完全一致，页面无横向溢出，console 0 error/warning。

### CHG-20260802-024 移除搜索猫角色与随机装饰动画

- 日期：2026-08-02
- 状态：implemented
- 类型：frontend / UI / UX / cleanup / motion / testing
- 原行为：UniversalSearch 右缘绘制一只分层 SVG 橘猫，并通过随机队列调度 7 种空闲动作；
  输入、菜单和提交还维护额外的角色姿态状态与计时器。该视觉主体与搜索任务无直接关系，
  动作复杂度和注意力占用高于它提供的交互价值。
- 新行为：完整删除角色 SVG、随机动作调度、专用 CSS 动画、提交姿态状态、测试钩子和相关
  单元/E2E 测试，不提供隐藏开关、静态占位、兼容层或替代挂件。搜索椭圆、八秒指针展开、
  provider 菜单、主题、防闪烁徽章和全页背景纹样保持原契约。
- 视觉原则：搜索椭圆是工作台唯一视觉焦点；几何背景只承担低对比氛围层，不在搜索器周围
  增加角色、随机环境动画或与任务无关的持续装饰动画。
- 文档清理：从规范、README 和历史变更中删除已废弃的角色造型、动作状态机、响应式尺寸和
  动作验收描述；系统尚未上线，不保留 superseded 实验链。
- 代码：删除角色组件、随机动作调度模块及其 CSS/测试；收敛 `UniversalSearch.tsx`、
  `UniversalSearch.test.tsx` 和 `web/tests/e2e/navi.spec.ts`。
- 验收：代码与文档不存在已删除角色实现或动作标识；生产图、CSS、导出、测试钩子和依赖扫描
  无新增死代码；类型、lint、单元、构建、三浏览器 E2E、视觉、Storybook、依赖审计、浏览器
  实机和 `10090` 服务检查全部通过。
- 验证：
  - `npm run typecheck`、`npm run lint`：通过，0 error/warning。
  - `npm run test`：18 个测试文件、63/63 通过；statements 96.95%、branches 77.19%、
    functions 94.92%、lines 97.48%。
  - `npm run build`：通过；生产 CSS gzip 8.87 KiB、JS gzip 145.94 KiB，分别由清理前的
    11.80 KiB、149.87 KiB 降低，且继续低于 300 KiB 门禁。
  - `npm run test:e2e`：Chromium、Firefox、WebKit 共 36/36 通过；搜索、主题、背景纹样、
    provider 菜单、防闪烁徽章、响应式、无横向溢出和 axe 门禁保持通过。
  - `npm run test:visual -- --update-snapshots`：24/24 通过；人工逐项核对后更新 23 张因角色
    移除产生确定性变化的基线，移动搜索 overlay 无变化；随后 `npm run test:visual` 再次
    24/24 通过，确认新基线稳定。
  - `npm run storybook:test`：通过；仅输出 Storybook/Node 上游 `module.register()` 弃用提示
    与测试预览包 chunk 体积提示，不进入生产 bundle。
  - `npm audit --omit=dev`：0 vulnerabilities；`npm ls --depth=0` 无 missing/extraneous 依赖。
  - 静态审计：从 `src/main.tsx` 出发的 33/33 个生产模块可达；17 个 CSS Module 均有消费者；
    0 个孤立类名、无用生产导出、无消费者测试钩子、无用 CSS 变量或已删除角色/动作标识。
  - Codex in-app Browser：在 1280x720 与 390x844 实机复核首屏和 provider 菜单；角色相关
    DOM 数量为 0，页面无错误覆盖层、无横向溢出，console 0 error/warning。藤萝青与绀樱夜
    双向切换时 provider 徽章表面、边界、品牌色及 SVG 状态一致，检查后恢复配置默认主题。
  - 开发服务继续监听 `http://127.0.0.1:10090/`，HTTP 200。

### CHG-20260802-025 将七套背景纹样升级为语义环境动效

- 日期：2026-08-02
- 状态：implemented
- 类型：frontend / UI / UX / motion / accessibility / performance
- 原行为：七套实际线条纹样只显示静态 SVG 几何，切换时仅进行 opacity crossfade；规范明确
  禁止持续循环动画。
- 新行为：七套纹样默认持续运动，不增加 `background_motion` 配置、静止选项或菜单开关；
  `none` 仍表示完全不渲染线条。经纬阵、天游环、双鱼宫、天弓宫、回廊纹、玫瑰窗和八芒阵
  分别使用经纬校准、星体公转、双鱼对游、弓箭掠过、回纹流动、内外反转和晶格迁移，不使用
  一个通用旋转动作替代纹样语义。
- 动效契约：新增 18s/36s/72s/108s ambient token；只动画 SVG 分组的 transform、局部 opacity
  或 stroke-dashoffset，轨迹和相位完全确定，不使用随机数、Canvas、粒子、JS timer、
  requestAnimationFrame/React state 循环或新增运行时依赖。
- 可访问性：不提供普通模式的静止偏好；系统 `prefers-reduced-motion: reduce` 下环境动效全部
  停止，并立即完成纹样切换。
- 影响：更新背景纹样 SVG 分组、CSS motion、Storybook、单元/E2E/视觉测试及设计文档；主题、
  搜索、provider 徽章、导航数据和 `config.yaml` 字段不变。
- 验收：`AC-P0-109`、`AC-P0-111`、`AC-P0-123` 及三浏览器、reduced motion、165Hz、视觉和
  长时间运行性能门禁。
- 验证：
  - `npm run typecheck`、`npm run lint`：通过，0 error/warning。
  - `npm run test`：18 个测试文件、64/64 通过；statements 96.95%、branches 77.19%、
    functions 94.92%、lines 97.48%。背景纹样模块 statements/functions/lines 均为 100%。
  - `npm run build`：通过；生产 CSS gzip 9.83 KiB、JS gzip 146.87 KiB，分别较动态纹样实施前
    增加 0.96 KiB 与 0.93 KiB，继续低于 300 KiB 门禁。
  - `npm run test:e2e`：Chromium、Firefox、WebKit 共 39/39 通过；新增门禁逐套验证七种不同
    animation signature、全部周期不少于 18s、普通模式运行中、reduced motion 下全部
    `animation-name: none`，并保持主题、搜索、徽章、移动端、overflow 和 axe 门禁通过。
  - `npm run test:visual -- --update-snapshots`：24/24 通过；人工核对首次差异仅来自经纬阵新增
    环形测量点的 2-36 个确定性像素，更新对应 12 张基线；随后 `npm run test:visual` 全量
    24/24 稳定复跑通过，其余六套纹样原有视觉基线无需更新。
  - `npm run storybook:test`：通过；仅输出 Storybook/Node 上游 `module.register()` 弃用提示
    与测试预览包 chunk 体积提示，不进入生产 bundle。
  - `npm audit --omit=dev`：0 vulnerabilities；`npm ls --depth=0` 无 missing/extraneous 依赖。
  - 静态审计：22 个 `data-pattern-motion` 语义层均有自动化消费者；背景纹样 CSS Module
    27 个类零孤立；实现中不存在 `Math.random`、Canvas/WebGL、timer、requestAnimationFrame、
    Rive、GSAP 或新增逐帧运行时。
  - Codex in-app Browser：在 1280x720 逐项复核经纬阵、天游环、双鱼宫、天弓宫、回廊纹、
    玫瑰窗和八芒阵，确认各自动作语义、周期与线条层级；在 390x844 确认经纬阵持续运动，
    搜索器仍为 x=16、358x60px，页面无横向溢出。全新页面 console 0 error/warning、无错误
    overlay，检查后恢复藤萝青与经纬阵默认组合。
  - 开发服务继续监听 `http://127.0.0.1:10090/`，HTTP 200。

### CHG-20260802-026 统一浮层表面并阻断背景内容穿透

- 日期：2026-08-02
- 状态：accepted
- 类型：frontend / UI / UX / CSS / rendering / accessibility / testing
- 触发：项目负责人截图指出，同一顶栏中的主题菜单使用纯色表面，而背景纹样菜单为透明
  材质，导致后方导航文字、卡片和动态纹样穿透到选项内容中；要求定位根因、排查同类问题并
  建立设计、实施与验收标准。
- 根因：两个同级 `role=menu` 没有共享 floating surface 契约。主题菜单直接使用不透明
  `var(--surface)`；背景纹样菜单却在组件内先声明 96% alpha fallback，并在支持 blur 时再次
  降为 86% alpha、附加 24px `backdrop-filter`。实机检查确认两者祖先 opacity、transform、
  filter 与 stacking context 等价，因此穿透来自组件 CSS 的主动透明分支，不是 z-index 或
  Chrome/Arc 偶发合成问题。
- 同类审计：provider 菜单背景已经不透明，但因与搜索椭圆共用 feature query 仍附加了没有
  视觉作用的 18px `backdrop-filter`；搜索椭圆、顶栏和全屏搜索 overlay 属于不同表面类别，
  保留各自受控材质/遮蔽职责，不采用菜单局部补丁式一刀切。
- 决策：新增共享 `floating-surface` 与 `floating-surface-border` 语义 token；主题、背景纹样和
  provider 菜单统一使用 alpha 1 的背景、共享边界与菜单阴影，移除菜单上的透明 color-mix 与
  backdrop-filter。菜单缩略图可以在不透明父面板内保留自身透明层级。
- 实现：`web/src/styles/tokens.css` 新增 `--floating-surface: var(--surface)` 与
  `--floating-surface-border: var(--border)`；主题、背景纹样和 provider 三个菜单统一消费
  两个 token 与既有 `--shadow-menu`。删除纹样菜单 96%/86% alpha 和 24px blur 分支；provider
  菜单从搜索椭圆的 blur feature query 中移出，并让菜单箭头同步使用共享表面和边界。搜索椭圆
  继续保持 82% 材质与 18px blur，顶栏和全屏搜索 overlay 行为不变。
- 同类测试清理：新增三浏览器 floating surface 计算样式门禁，桌面覆盖 8 个主题，手机覆盖
  默认、绀樱夜和藤萝青，逐一检查三个菜单的背景 alpha、blur、边界、阴影与共享 token。全量
  并发验证同时发现背景动效测试曾用全局 `[data-pattern-motion]`，会在菜单退出动画期间误把
  8 个缩略图节点计入全页背景断言；现已限定到 `[data-background-pattern-layer]` 下当前 artwork
  并条件轮询目标样式。配置恢复测试也删除 `route.fetch()` 二次本地网络回环，直接使用唯一的
  确定性 `mockCatalog` fixture，消除 reload 并发下的 `ECONNRESET`。
- 文档：`docs/DESIGN.md`、`docs/IMPLEMENTATION.md`、`docs/UI_SPEC.md`、
  `docs/ACCEPTANCE.md`、`docs/CHANGELOG.md`；验收编号 `AC-P0-124`。
- 验证：
  - `npm run typecheck`、`npm run lint`：通过，0 error/warning。
  - `npm run test`：18 个测试文件、64/64 通过；statements 96.95%、branches 77.19%、
    functions 94.92%、lines 97.48%。
  - `npm run build`：通过；生产 CSS gzip 9.80 KiB、JS gzip 146.87 KiB，CSS 较修改前减少
    0.03 KiB，继续低于 300 KiB 门禁。
  - `npm run test:e2e`：Chromium、Firefox、WebKit 共 42/42 通过；新增门禁覆盖共享 token、
    alpha 1、无菜单 blur、主题/纹样/provider 三表面一致、全部桌面主题、代表移动主题与安全
    边距；背景动效与 provider 配置恢复用例在并发环境下稳定通过。
  - `npm run test:visual`：24/24 通过；主题、背景纹样和 provider 三个菜单基线均通过，无需
    更新截图或放宽 diff threshold。
  - `npm run storybook:test`：通过；只有 Storybook/Node 上游 `module.register()` 弃用提示与
    测试预览 chunk 体积提示，不进入生产 bundle。
  - `npm audit --omit=dev`：0 vulnerabilities；`npm ls --depth=0` 无 missing/extraneous 依赖。
  - 静态审计：三个菜单背景和边界只有共享 floating surface token 消费路径；菜单容器不存在
    透明 color-mix 或 backdrop-filter，唯一保留的 blur 位于主搜索椭圆。
  - Codex in-app Browser：在 1280x720 绀樱夜下，主题、纹样和 provider 菜单均解析为
    `rgb(17,27,43)` 背景、`rgb(39,54,75)` 边界、同一菜单阴影、background alpha 1、
    `backdrop-filter: none`；搜索椭圆仍为 82% alpha 与 18px blur。在 390x844 下纹样菜单为
    x=34、width=344、right=378、scrollWidth=clientWidth=390，后方文字、卡片与动态纹样不可
    辨识，console 0 error/warning。检查后恢复藤萝青、经纬阵、1280px 默认视口且菜单全部关闭。
  - 开发服务继续监听 `http://127.0.0.1:10090/`，HTTP 200。

### CHG-20260802-027 新增左下半屏动态星轨幕

- 日期：2026-08-02
- 状态：accepted
- 类型：frontend / UI / UX / SVG / motion / responsive / testing
- 触发：项目负责人要求在背景纹样中新增可持续运动的星轨效果，视觉覆盖集中于整个屏幕左下
  半部分，并继续以优美、自然、高刷新率友好的 UI/UX 为最高目标。
- 决策：新增稳定标识 `star-trails` 与显示名“星轨幕”，作为第 9 个纹样选项。使用左下视口
  外侧圆心、多层确定性同心弧、固定长曝光分段、描边相位和极轻微绕心旋转；不引入 Canvas、
  随机粒子、JS timer、requestAnimationFrame 循环或新增运行时依赖。
- 响应式：星轨 SVG 使用 `xMinYMax slice`，在 desktop、tablet 与 phone 均保留左下视觉原点；
  主要线条限制在左侧约 60% 与下方约 60%，右上区域保持克制留白，图层继续不捕获指针、
  不参与布局且不产生横向溢出。
- 动效与可访问性：运动只消费既有 36s/72s/108s ambient token，并由 CSS/SVG transform 与
  `stroke-dashoffset` 驱动，跟随浏览器原生刷新率；`prefers-reduced-motion: reduce` 下全部静止，
  forced colors 下继续隐藏装饰背景。
- 影响：更新背景纹样协议、菜单选项、SVG/CSS、Storybook、单元/E2E/视觉测试、示例配置、
  中英文 README 和四份规范文档；主题、导航数据、搜索、favicon 与 YAML 唯一事实源原则不变。
- 验收：`AC-P0-109`、`AC-P0-111`、`AC-P0-123`、三浏览器、desktop/mobile、reduced motion、
  overflow、视觉分布、console 与高刷新率实现门禁。
- 验证：
  - `npm run typecheck`、`npm run lint`：通过，0 error/warning。
  - `npm run test`：18 个测试文件、65/65 通过；statements 96.99%、branches 77.39%、
    functions 95.00%、lines 97.51%，背景纹样模块 statements/functions/lines 均为 100%。
  - `npm run build`：通过；生产 CSS gzip 10.02 KiB、JS gzip 147.32 KiB，继续低于 300 KiB
    门禁。
  - `npm run test:e2e`：Chromium、Firefox、WebKit 共 45/45 通过；新增验证第 9 项菜单、
    `star-trails` 持久化、5 个独立 motion layer、描边相位实时变化、全部周期不低于 18s、
    reduced motion 静止、1440x900/390x844 左下原点、右侧最大几何边界、移动端 overflow 与 axe。
  - `npm run test:visual -- --update-snapshots`：25/25 通过；人工确认差异只来自纹样菜单新增
    “星轨幕”和新星轨画面，更新 2 张基线；随后 `npm run test:visual` 25/25 稳定复跑通过。
  - `npm run storybook:test`：通过；新增 BackgroundPattern 与 BackgroundPatternButton 的
    StarTrails stories。仅输出 Storybook/Node 上游 `module.register()` 弃用提示和测试预览包
    chunk 体积提示，不进入生产 bundle。
  - `npm audit --omit=dev`：0 vulnerabilities；`npm ls --depth=0` 无 missing/extraneous 依赖。
  - 静态审计：实现只包含确定性 SVG/CSS；无 `Math.random`、Canvas/WebGL、JS timer、
    requestAnimationFrame 或 React 动画状态循环，动画由既有 ambient token 驱动。
  - Codex in-app Browser：在 1280px desktop 与 390x844 phone 通过真实菜单选择“星轨幕”；
    300ms 两次采样确认 `stroke-dashoffset` 从 `-1.7987px` 变化到 `-4.69893px`，无 JS 锁帧；
    两个视口均 `scrollWidth === clientWidth`，SVG 为 `xMinYMax slice`，console 0 error/warning。
    截图确认视觉密度集中在左下，右上保持留白，搜索器、分组标题和卡片无错位。
  - 开发服务继续监听 `http://127.0.0.1:10090/`，HTTP 200；实机验收后保留星轨幕作为当前本地
    纹样选择，未修改 `config.yaml` 的默认 `meridian-grid`。

### CHG-20260802-028 提升星轨幕的明度层级与线条质感

- 日期：2026-08-02
- 状态：accepted
- 类型：frontend / UI / visual hierarchy / CSS / testing
- 触发：项目负责人实机确认星轨构图与运动方向无问题，但认为当前颜色偏淡，希望评估加深和
  加粗是否符合成熟产品的 UI 美学，并参考优秀设计规范后调整。
- 外部设计评估：Apple HIG、Material 3、Carbon、Fluent、Vercel Geist 与 Linear 的共同原则
  是通过稳定 token、分层对比和克制结构建立层级；装饰背景应当“可感知但不争夺任务焦点”。
  当前星轨符合左下集中、低噪声、内容优先的方向，但浅色主题中的可见度低于这一目标。
- 决策：不改几何、颜色来源、运动周期和覆盖范围；采用分层增强而不是统一加粗。图层 opacity
  从 0.76 调整为 0.86，引导圆从 1px 调整为 1.1px，slow/medium/fast 三档轨迹分别使用
  1.55/1.3/1.45px。继续消费主题 token，正文、交互控件与卡片边界保持更高优先级。
- 影响：仅修改星轨幕局部 SVG class、CSS、相关规范与视觉基线；其余八个菜单选项、七套线条
  纹样、配置协议、YAML 唯一事实源和动效性能契约不变。
- 验收：`AC-P0-109`、`AC-P0-111`、`AC-P0-123`、浅色/深色、desktop/mobile、DPR、对比层级、
  reduced motion、overflow、console 与视觉回归门禁。
- 验证：
  - `npm run typecheck`、`npm run lint`：通过，0 error/warning；新增 E2E 读取逻辑使用显式 DOM
    缺失检查，不使用非空断言。
  - `npm run test`：18 个测试文件、65/65 通过；statements 96.99%、branches 77.39%、
    functions 95.00%、lines 97.51%，背景纹样模块 statements/functions/lines 均为 100%。
  - `npm run build`：通过；生产 CSS gzip 10.04 KiB、JS gzip 147.35 KiB，较调整前分别增加
    0.02 KiB 与 0.03 KiB，继续低于 300 KiB 门禁。
  - `npm run test:e2e`：Chromium、Firefox、WebKit 共 45/45 通过；新增精确断言确认星轨幕
    computed opacity 为 0.86，引导圆与 slow/medium/fast 轨迹分别为
    1.1/1.55/1.3/1.45px，并继续通过动画、reduced motion、响应式、overflow 与 axe 门禁。
  - 视觉基线初跑 25/25 通过，说明增强幅度仍在既有允许差异内；人工审查浅色、深色和手机
    实机截图后，定向更新星轨幕及菜单缩略图 2 张基线，随后 `npm run test:visual` 25/25 稳定
    复跑通过。
  - `npm run storybook:test`：通过；只有 Storybook/Node 上游 `module.register()` 弃用提示和
    测试预览包 chunk 体积提示，不进入生产 bundle。
  - Codex in-app Browser：在 1280px 藤萝青浅色、1280px 绀樱夜深色和 390x844 绀樱夜手机
    实机复核；三档线宽和 opacity 均与规范一致，两个 viewport 均
    `scrollWidth === clientWidth`，console 0 error/warning。截图确认轨迹更清晰且保留主次层级，
    搜索器、正文、卡片边界和焦点仍明显高于背景。300ms 两次采样中 fast 轨迹
    `stroke-dashoffset` 从 `-217.365px` 变化到 `-220.322px`，原生刷新率运动未受影响。
  - 验收后恢复藤萝青、星轨幕和 1280px 默认浏览器视口；开发服务继续监听
    `http://127.0.0.1:10090/`，HTTP 200。

### CHG-20260802-029 修正 Google/Gemini 品牌色并移除入口角标

- 日期：2026-08-02
- 状态：accepted
- 类型：frontend / UI / UX / SVG / accessibility / testing
- 触发：项目负责人截图指出 Google 被错误渲染为单色蓝 G、Gemini 被错误渲染为单色紫星，
  当前 provider 徽章右下角叠加的小三角也破坏了图标完整性与视觉纯净度，要求修正并移除。
- 根因：`ProviderIcon` 对全部 Simple Icons path 统一使用 `fill="currentColor"`，只能表达单色
  品牌；`UniversalSearch` 又在品牌 SVG 上额外叠放 `ChevronDown` 与圆形表面，形成截图中的角标。
- 决策：Google 改为明确的蓝/绿/黄/红四色 G path；Gemini 保留稳定星形几何，以实例唯一的
  clipPath 和三层 radialGradient 在蓝色底上形成红/黄/绿/蓝四向色场，避免单条对角渐变在
  18/24px 下只显出中间两色；其余六个 provider 延续现有单色品牌 token。当前 provider 按钮
  只保留一个居中品牌 SVG，删除小三角组件、样式、reduced-motion 分支和依赖其存在的 E2E 断言。
- 影响：更新 ProviderIcon、UniversalSearch、组件 CSS、单元/E2E/视觉测试及五份规范文档；
  provider 数据、搜索 URL、配置协议、搜索器伸缩、菜单语义、YAML 唯一事实源和背景纹样不变。
- 验收：`AC-P0-122`、`AC-P0-125`。
- 验证：
  - `npm run typecheck`、`npm run lint`：通过，0 error/warning；生产代码与测试均无
    `ChevronDown`、`providerChevron` 或无 `data-provider-icon` 的 provider 第二 SVG 残留。
  - `npm run test`：18 个测试文件、66/66 通过；statements 97.06%、branches 77.65%、
    functions 95.07%、lines 97.56%。新增精确断言覆盖 Google 四条 path fill、Gemini 两实例的
    8 个唯一 SVG 定义、四向色场和当前按钮单 SVG 结构。
  - `npm run build`：通过；生产 CSS gzip 9.97 KiB、JS gzip 147.78 KiB，继续低于 300 KiB
    门禁。Gemini 渐变不使用 SVG blur filter 或新增运行时依赖。
  - `npm run test:e2e`：Chromium、Firefox、WebKit 共 48/48 通过；新增三浏览器用例同时检查
    Google 当前/菜单实例的四色 path、Gemini 当前/菜单实例的唯一 clipPath/radialGradient、
    当前按钮恰好一个 SVG，以及切到绀樱夜后品牌结构和颜色不变。
  - 视觉基线初跑确认 24 个差异均只来自小三角移除，provider 菜单额外包含 Google/Gemini 的
    预期品牌色修正；人工抽查 desktop、390x844 phone 和菜单 actual/diff 后更新 24 张基线。
    `npm run test:visual` 最终 25/25 通过；错误页一次无关的 “Navi” 字体抗锯齿波动经定向
    `--repeat-each=2` 两轮通过后，全量再次稳定通过。
  - `npm run storybook:test`：通过；只有 Storybook/Node 上游 `module.register()` 弃用提示和
    测试预览 chunk 体积提示，不进入生产 bundle。`npm audit --omit=dev`：0 vulnerabilities。
  - Codex in-app Browser：在 1280px 藤萝青 desktop 与 390x844 绀樱夜 phone 实机选择
    Google/Gemini 并打开菜单；Google fills 为 `#4285F4/#34A853/#FBBC05/#EA4335`，Gemini
    当前/菜单两实例共 8 个定义且 id 全部唯一，当前按钮 SVG 数为 1，图标水平/垂直居中，
    `scrollWidth === clientWidth`，console 0 error/warning，无 framework overlay。验收后恢复
    藤萝青、星轨幕和默认 desktop 视口，并保留 provider 菜单作为可直接查看的交付页。

### CHG-20260803-030 发布 0.1 前端完成里程碑

- 日期：2026-08-03
- 状态：accepted
- 类型：release / frontend / documentation / testing
- 决策：将当前 React 前端定义为 `0.1` 前端完成里程碑。UI/UX、响应式、主题与背景纹样、
  外部搜索、目录筛选、状态展示、可访问性、Storybook、三浏览器行为测试和视觉回归均进入
  已完成范围；Vite fixture 继续只作为前端开发协议模拟，不代表 Go 后端已经实现。
- 发布边界：`0.1` 不包含真实 `config.yaml`/`urls.yaml` 加载、Favicon 下载缓存、目录热更新、
  private/public 探测与跳转、Go HTTP API、静态资源嵌入或单二进制生命周期。这些工作从标签之后
  按 `docs/IMPLEMENTATION.md` 的 Task 1-9、14 和 16 继续实施。
- 文档：修正中英文 README 中“应用代码尚未实现”的过时状态，增加当前可用的前端开发、构建
  和测试命令，并明确生产环境不需要 Node。
- 版本控制：前端交付提交使用注释标签 `0.1`；标签创建后不再重写，后端开发使用后续提交。
- 发布验证：`npm run typecheck`、`npm run lint`、66 项单元测试、生产构建、48 项
  Chromium/Firefox/WebKit E2E、25 项视觉回归、Storybook 测试构建和生产依赖审计均已通过；
  1280px desktop 与 390x844 phone 实机检查无横向溢出或 console error/warning。

## 4. 待决定事项

当前没有阻塞第一版实施的待决定事项。以下内容默认延期，除非产生新的 accepted 变更：

- 是否为 group 增加独立描述和图标元数据。
- 是否提供客户端网络视角的辅助探测方案。
- 是否增加纯静态导出模式。
