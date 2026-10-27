# 全仓规范复核

复核基线：目录规范 1.2.0；通用、Go、Web、React 代码规范 1.0.0。范围包括 `cmd/`、`internal/`、`web/src/`、就近测试、共享契约样例、浏览器测试、工具配置与 CI。保留任务开始时已有改动及本地配置；本轮未改写规范来迁就代码。

下表按规范条款组织检查证据；同一行中列出的子项分别检查，具体执行结果统一记在 [ACCEPTANCE.md](ACCEPTANCE.md)，不以历史验收替代当前结果。

| 条款 | 检查项及处理 | 证据 / 适用说明 |
| --- | --- | --- |
| 目录 §1–2 | 单 Go 服务配套 Web；唯一源码来源；原有改动保护；无新增空目录、兼容副本或框架迁移 | `cmd/navi`、`internal`、`web`；隔离副本使用当前文件清单，排除个人配置 |
| 目录 §3–4 | 根文件职责、固定目录名、源码/测试/报告边界、生成资源来源 | 根规范与工具配置；Go testdata、Web 就近测试；品牌生成脚本与来源注释 |
| 目录 §5 | 应用状态、基础 API、布局、领域、公共 UI、纯技术模块归属；无 utils/common 收纳目录 | 全局外观位于 `app/appearance`；格式化位于 `lib/format`；状态组件测试移回 status 域 |
| 目录 §5.1 | 跨域公开入口、基础模块不反向导入业务、生产代码无测试依赖 | appearance 公开 `index.ts`；auth/navigation 通过入口依赖；依赖导入扫描 |
| 目录 §5.2、§10 | 文件路由框架和多应用布局 | 不适用：当前为单 Go 服务 + React SPA |
| 目录 §6 | 入口职责、领域依赖方向、嵌入唯一产物及构建顺序 | `web/embed.go` 嵌入 `all:dist`；先构建 Web 再执行 Go 检查 |
| 目录 §7 | 配置优先级、路径、未知字段、运行数据、密钥和忽略规则 | `internal/config`、configs 示例、README 配置约定；本地配置未进入隔离副本 |
| 目录 §8–8.1 | 原生命令、版本来源、CLI、发布平台、可重建构建 | README、CI、GoReleaser；四平台 vet/build 与版本集成测试 |
| 目录 §9、§11 | 文档归属、技术决定、工具固定目录、例外登记 | docs 下验收/计划/决定；README 两项既有配置路径例外 |
| 目录 §12–14 | 规则读取、引用更新、迁移残留、干净构建、规范维护边界 | 旧 client/外观上下文/clock time 路径已移除；规范文件本轮未修改；未传播到其他仓库 |
| 通用 §1–2 | 只采用 Go/Web/React 规范；整体整改授权；沿用已有文件命名 | 未引入其他技术栈规范；未改大小写命名体系 |
| 通用 §3.1–3.2 | 英文标识符、开发者错误和注释；中文 UI；公开接口注释 | Go 导出注释由 staticcheck 检查；lib 与 appearance 公开入口补文档注释；Go 无 JS 回退文案沿用 README 已登记例外 |
| 通用 §3.3 | 参数数量、同型布尔参数、职责、长函数、循环嵌套、常量 | AST 检查生产与测试函数；会话、cookie、校验、缓存、测试助手及 Canvas 参数均归并为对象；长解析/生命周期代码按职责复核 |
| 通用 §3.4 | 错误传播、未知错误、可忽略清理错误的原因 | 无参 fmt.Errorf 改 errors.New；写入/关闭错误保留链；只读关闭与派生缓存跳过明确注释；API 失败统一 ApiError |
| 通用 §3.5 | 结构化事件、字段、request_id、秘密与路径日志 | `cmd/navi/log.go`、HTTP 访问日志；凭证 String/GoString 屏蔽；README 说明运维路径用途 |
| 通用 §3.6 | 输入长度、范围、枚举、路径与认证重定向 | 登录字段 400 details；URL 禁止 userinfo；缓存防符号链接逃逸；JSON 与 SSE 均拒绝重定向 |
| 通用 §3.7 | 超时、取消、有界内存与并发、后台退出 | 文件 I/O 传播 ctx；图标/元数据/列表/缓存/订阅/探测/事件帧有界；测试 goroutine 也使用 WaitGroup.Go |
| 通用 §3.8 | UTC 存储、毫秒协议、时钟注入 | `internal/timefmt`；认证/缓存/图标刷新/探测时钟；浏览器按本地时区，测试固定 Asia/Shanghai |
| 通用 §4 | 依赖必要性、许可证、锁定、漏洞与职责重复 | React Router 决策；bcrypt 决策；移除 simple-icons 应用依赖，保留可重建 CC0 品牌路径；npm/go 审计 |
| 通用 §5.1 | 接口文档、兼容性、服务端与客户端契约 | `docs/API.md`；`tests/fixtures/api/login-invalid-length.json` 同时用于 Go HTTP 与 Web 字段错误测试 |
| 通用 §5.2 | 方法、snake_case、时间、字段保留、忽略新增响应字段 | HTTP handlers、Web schema 与解析测试；线上的 authenticated/auth_required 不因布尔命名规则改名 |
| 通用 §5.3 | 错误信封、request ID、字段错误、超时/取消/重试 | 唯一 Go writeError、Web api/errorText；schema 失败保留 request ID；GET/SSE 有限退避及 Retry-After |
| 通用 §5.4 | 服务端鉴权、Cookie、401、CSRF、秘密存储 | bcrypt、摘要会话、HttpOnly/SameSite、CrossOriginProtection；集成测试检查退出与撤销 |
| 通用 §6 | 行为测试、失败边界、稳定时间、生产配置隔离 | 新增缓存逃逸/大小、取消、探测时钟、SSE、URL、路由、字段错误和格式化测试；生产 E2E 仅用临时合成数据 |
| 通用 §7–8 | 格式、lint、类型、测试、构建、未运行项目披露 | 见当前验收命令与结果；未以关闭整个检查文件通过 lint |
| 通用 §9–10 | 决策、例外、规范变更边界 | README 既有例外；新增技术决定在 docs/decisions；未改规范版本或规则 |
| Go §1 | Go 补丁版本、现代写法、全部检查、固定工具版本、依赖选择 | `go.mod` 1.27.3；modern-go 规则；CI 固定 goimports/staticcheck/govulncheck；忽略 web/node_modules |
| Go §2 | import 分组、格式、文件/包/接收者/handler 命名、权限、注释、接口与参数 | gofmt/goimports/staticcheck；接收者缩短；handler 使用 w/r；参数 AST 检查 |
| Go §3 | errors.New、%w、errors.Is/AsType、领域错误、HTTP 映射、panic | app/http_errors；TLS 错误改 AsType；输入失败不 panic；随机令牌 rand.Text |
| Go §4 | 注入 slog、stdout/stderr、结构化字段、HTTP ErrorLog | cmd/log、app/server、CLI 测试与日志测试 |
| Go §5 | ctx 首参、无 ctx 字段、构造与启动分离、停止顺序、锁说明 | app/catalog/favicon 生命周期；文件读写上下文；Start/Shutdown；TestProbe 使用独立 transport，不替换全局客户端 |
| Go §5 与 §7 的明确签名 | 配置入口 `Load(Source)` 未增加 ctx | §7 明确规定完整签名；普通运行期文件 I/O 已补 ctx；配置读取限定为启动期有界普通文件 |
| Go §6 | ServeMux、404/405 JSON、中间件、状态常量、输入上限、服务器/客户端超时、路径安全 | handlers/auth/server；OpenRoot 约束缓存目录及子文件；凭证请求不重定向；缓存开根/读写/清理均在允许目录内 |
| Go §7 | JSON/YAML 标签、固定精度时间、未知/多文档拒绝、配置优先级与环境映射 | config、timefmt、JSON 解析与 fuzz；CLI 帮助修正为 NAVI_SERVER__PORT |
| Go §8 | SQLite 条款、密码和令牌存储 | 没有数据库，DSN/事务/migrations 不适用；认证相关要求仍适用并已检查 |
| Go §9 | 标准 testing、t.Context/Cleanup、并行、注入时钟、synctest、替身、fuzz/benchmark、HTTP 契约 | 无固定 sleep 等待真实异步；有界自建测试客户端；5 个 fuzz 入口；共享 JSON 样例 |
| Go §10.1–10.7 | 服务入口文件、帮助、接受/拒绝参数、配置选择、退出码、版本和关闭 | cmd/navi 单测与带 integration 标签的版本构建测试 |
| Go §10.8 | 一次性命令行工具扩展 | 不适用：Navi 是服务，无子命令 |
| Go 附录 B/C 与 §2 参数条款 | 逐字版本模板保留 | `version_build_test.go` 两个 4/5 参数闭包来自强制模板；按更具体的“逐字使用”执行，不私改模板以满足通用阈值 |
| Web §1 | npm/锁文件/Node、固定脚本、Vite 目标、CI 顺序、无外部 CDN | package.json/lock、Vite、CI；资源随构建；完整 npm audit 包含开发依赖 |
| Web §2 | 严格编译、unknown、无 any/非空断言、type/相对导入、无嵌套三元 | 每个 tsconfig；strictTypeChecked；max-params 与 no-nested-ternary 规则；已校验的 API 边界断言保留 |
| Web §3 | Prettier、ESLint flat、样式检查、定点抑制 | 工具配置也纳入 lint；d.ts 仅采用规范规定的类型声明例外；剪贴板 DOM 类型不符合运行时可用性的定点说明 |
| Web §4 | 现有文件命名、布尔前缀、服务端字段原名 | TypeScript 符号级重命名；协议字段保持原名 |
| Web §5 | 单一请求包装、响应校验、ApiError、取消、统一 401、错误映射、跳转 | app/api 包含 JSON 与 SSE；业务域不直接 fetch；路由重试 URL 限制为本站 /go/ |
| Web §6 | 加载/空/失败区分、保留旧数据、alert/重试、字段错误、全局提示、Promise | StatePanel、LoginPage、NotificationProvider；登录 400 字段提示；显式处理失效查询的 Promise |
| Web §7 | 中文、时区、统一日期数字格式 | lang zh-CN；clock/time 移到 lib/format；数量与序号统一；无文件大小展示场景 |
| Web §8 | 设计变量、color-scheme、CSS Modules、断点、减弱动效、内联几何 | colors/spacing/radii/shadows/type/motion 在 styles；品牌与色板去内联颜色；强度/滚动透明度通过 root 变量；剩余内联仅布局/动画几何 |
| Web §9 | 语义控件、标签、焦点/关闭、触控、axe | 三浏览器 E2E 的控件尺寸与键盘检查；关键页面 serious/critical axe 断言 |
| Web §10 | Vitest/RTL/user-event、setup 清理、按语义查询、浏览器隔离、固定时钟、视觉来源 | 非用户事件才用 fireEvent；DOM 根状态直接断言，CSS locator 仅几何；Linux 同 CI 环境比较截图 |
| React §1–2 | Hooks 插件、StrictMode、函数/具名组件、Props、key、富文本与记忆化 | 没有 Compiler/FC/dangerouslySetInnerHTML；去除无证据 memo；保留 effect 依赖需要的稳定引用并说明 |
| React §3 | 派生状态、effect 外部同步与释放、Context、表单 | 全局 Provider 归 app；标题/主题恢复；订阅、timer、observer、请求清理；登录 FormData |
| React §4 | QueryClient、领域 hook/key、signal、mutation 与失效 | auth/catalog/status hook；统一 retry 规则；无组件手写 fetch 状态机 |
| React §5 | 路由表、懒加载、History 回退、URL 可分享状态 | Router、urlState；保留原有 SPA 回退，并补回归测试 |
| React §6–7 | CSS Modules、单次全局样式、条件类名、独立测试 QueryClient | 组件就近样式；main 入口全局样式；测试禁重试 |

## 验收边界

源码规范检查与自动化结果见当前验收记录。真实触控设备、人工浏览器缩放、远程 GitHub CI 运行以及视觉基线的人类提交评审，不能用本机模拟结果冒充。本任务未提交或发布代码。Go 逐字模板和 README 已登记例外均在上表明确列出，没有把它们隐去后宣称所有规则零例外。
