# 全仓规范复核

复核基线：目录规范 1.2.0、Go 代码规范 1.0.2；通用、Web、React 代码规范 1.0.0。验证对象为 `31ea97b` 加本轮累计改动（2026-10-27）；首次全仓检查开始时 Git 工作区干净。范围包括 `cmd/`、`internal/`、`web/src/`、就近测试、共享契约样例、浏览器测试、工具配置与 CI。用户先将 Go 规范更新至 1.0.1，随后授权修复全部剩余问题并提交；本次在其更新基础上完成 1.0.2 修订与项目同步。本地配置与运行数据保留。

下表按规范条款组织检查证据；同一行中列出的子项分别检查，具体执行结果统一记在 [ACCEPTANCE.md](ACCEPTANCE.md)，不以历史验收替代当前结果。

本次重新检查发现此前记录遗漏了重试上限、错误信封、字段原因映射、响应校验、包文档归属等问题，均直接整改。项目尚未上线：删除旧页面别名和旧缓存时间格式支持，SSE 同步采用 snake_case，不保留双协议或迁移适配器。拒绝明文凭证、未知响应枚举的安全分支、网络与图标失败容错属于输入校验和产品行为，继续保留。

## 例外逐项处理

按用户追加要求重新核对后，已确认的项目差异和规范冲突均已整改，没有决定长期保留的项目自定义目录或代码例外。此前笼统使用“明确例外”混淆了项目偏离与规范自身要求，以下逐项更正。原五类问题及后续发现的模板上下文、超时和路径注释问题均已解决；逐字匹配模板与实际执行验证分别检查。

| 项目 | 原因与规范依据 | 本次处理 |
| --- | --- | --- |
| 缺省路径跟随配置目录 | 原因只是维持既有解析行为，不是技术限制；目录 §7.1 要求默认值按工作目录 | 已改。默认 `.cache`、`configs/urls.yaml` 始终按工作目录；文件显式值按配置目录；无文件时相对环境覆盖按工作目录。新增三个回归测试，不保留旧路径搜索 |
| Go 生成无 JavaScript 导航提示 | 原为无脚本访问保留中文提示与备用 HTML，偏离 Go §3 的客户端文案映射要求 | 已删除。Go 仅向真实前端入口注入代码和重试路径，React 生成文案；入口缺失返回标准 503 错误，不生成备用页面 |
| 剪贴板的单行 lint 抑制 | DOM 类型把 clipboard 声明为必有，非安全上下文实际可能没有；此前关闭一次 no-unnecessary-condition | 已删除。访问和写入都在已有 try/catch 中，缺失与权限拒绝均给出明确失败提示；没有类型断言或旧 API 适配 |
| CLI 同时支持 -c/--config 与 CONFIG_FILE | Go §10.4、§10.6 明确要求这些参数和优先级，目录规范并未禁止 CLI | 保留并移出项目例外表；删除反而违反 Go 规范 |
| Load(Source) 没有 ctx 参数 | Go 1.0.1 §5/§7 已明确豁免启动期一次性本地配置读取 | 原冲突已解决，保留唯一入口；项目仅在启动阶段读取有大小限制的普通文件 |
| 版本测试两个闭包有 4/5 个参数 | 原模板违反 Go §2；1.0.1 已将 command 收敛为三个参数、check 改为 buildCase 参数结构体 | 两份项目版本测试已逐字同步新版模板，原参数数量冲突已解决 |
| CLI 长作用域局部变量 o | 原附录 A 不符合短名约束，1.0.1 改为 opts | 项目 parseArgs/run 同步 opts；短接收者 o 按接收者规则保留 |
| 纯函数版本测试缺少 t.Parallel | 原附录 C 未遵守可并行测试的要求 | 同步新版顶层及表驱动子测试的 t.Parallel；使用 t.Setenv 的构建集成测试保持串行 |
| 版本测试失败信息缺少 want 或使用分号 | 原附录 C 与 got/want 约定不一致 | 同步完整结构体比较与 got ..., want ... 输出，不放宽断言 |
| d.ts 的 consistent-type-definitions 关闭 | Web §2/§3 明确允许声明合并使用 interface，并要求该配置 | 保留规范指定配置，不是业务代码豁免；其他 TypeScript 文件继续强制 type |
| 共享契约样例放 tests/fixtures/api | 目录 §4 明确规定它是普通 Go testdata 位置的特殊分支 | 保留单一共享输入，不复制到两端；属于规范规定的位置 |

未知枚举兜底、明文凭证拒绝、图标失败容错和测试替身均不支持旧协议，不是兼容性例外。未执行的远端 CI、真机及反向代理验证属于验证边界，也不是代码规范豁免。

## Go 1.0.2 补充修正

1. **外部命令的超时**：附录 C 与项目测试均从 t.Context() 派生操作上下文，构建和 Git 命令限时 2 分钟，被测版本二进制限时 10 秒；WaitDelay 为 5 秒，防止子进程保留输出管道导致等待不结束。错误同时报告命令错误和上下文原因。操作 deadline 独立于 go test 的总超时。
2. **测试辅助函数的 ctx 首参**：Go §5 已明确测试辅助函数可接收 *testing.T 并从 t.Context() 取得上下文，无须重复接收 ctx；需要超时的操作仍必须派生明确的操作时限。测试签名与固定模板不再冲突，也未放宽实际取消或超时要求。
3. **WorkDir 语义**：§7 的字段注释和正文现同时说明相对 Path、内置默认路径以及已存在文件中省略路径字段的解析基准；与目录规范 §7.1 和项目实现一致。Go 示例同时通过 gofmt 检查。

同类检查还修正了 CLI 纯函数测试：顶层及表驱动子测试启用并行，成功结果断言统一为包含 nil 错误期望的 got/want 格式。使用真实环境变量的启动、构建测试继续串行。

故障注入分别验证卡住的 Git 命令和卡住的被测二进制：原模板触发测试总超时，修复后的验证副本以缩短的操作时限报告 context deadline exceeded。正式模板保留上述生产检查时限，没有为了测试通过而缩短正式配置或跳过断言。具体范围见验收记录。

## 条款复核

| 条款 | 检查项及处理 | 证据 / 适用说明 |
| --- | --- | --- |
| 目录 §1–2 | 单 Go 服务配套 Web；唯一源码来源；原有改动保护；无新增空目录、兼容副本或框架迁移 | `cmd/navi`、`internal`、`web`；隔离副本使用当前文件清单，排除个人配置 |
| 目录 §3–4 | 根文件职责、固定目录名、源码/测试/报告边界、生成资源来源 | 根规范与工具配置；Go testdata、Web 就近测试；品牌生成脚本与来源注释 |
| 目录 §5 | 应用状态、基础 API、布局、领域、公共 UI、纯技术模块归属；无 utils/common 收纳目录 | 全局外观位于 `app/appearance`；格式化位于 `lib/format`；状态组件测试移回 status 域 |
| 目录 §5.1 | 跨域公开入口、基础模块不反向导入业务、生产代码无测试依赖 | appearance 公开 `index.ts`；auth/navigation 通过入口依赖；依赖导入扫描 |
| 目录 §5.2、§10 | 文件路由框架和多应用布局 | 不适用：当前为单 Go 服务 + React SPA |
| 目录 §6 | 入口职责、领域依赖方向、嵌入唯一产物及构建顺序 | `web/embed.go` 嵌入 `all:dist`；先构建 Web 再执行 Go 检查；新增包 `doc.go` 同步进入 Docker 构建 |
| 目录 §7 | 配置优先级、路径、未知字段、运行数据、密钥和忽略规则 | `internal/config`、configs 示例、README 配置约定；本地配置未进入隔离副本 |
| 目录 §8–8.1 | 原生命令、版本来源、CLI、发布平台、可重建构建 | README、CI、GoReleaser；四平台 vet/build 与版本集成测试 |
| 目录 §9、§11 | 文档归属、技术决定、工具固定目录、例外登记 | docs 下验收/计划/决定；README 目录例外为“无”，不存在项目代码例外表 |
| 目录 §12–14 | 规则读取、引用更新、迁移残留、干净构建、规范维护边界 | 旧 client/外观上下文/clock time 路径已移除；按追加授权将 Go 规范修订至 1.0.2；另检出六份其他仓库的 1.0.1 副本，已列明待同步，未自动修改其他仓库 |
| 通用 §1–2 | 只采用 Go/Web/React 规范；整体整改授权；沿用已有文件命名 | 未引入其他技术栈规范；未改大小写命名体系 |
| 通用 §3.1–3.2 | 英文标识符、开发者错误和注释；中文 UI；公开接口注释 | Go 导出注释由 staticcheck 检查；lib 与 appearance 公开入口有文档注释；导航提示只由 React 按代码生成 |
| 通用 §3.3 | 参数数量、同型布尔参数、职责、长函数、循环嵌套、常量 | AST 检查生产与测试函数；会话、cookie、校验、缓存、测试助手及 Canvas 参数均归并为对象；长解析/生命周期代码按职责复核 |
| 通用 §3.4 | 错误传播、未知错误、可忽略清理错误的原因 | 配置校验保留底层文件错误链；JSON 先编码再发状态；图标错误日志保留原因；已发响应的写入失败有说明或日志 |
| 通用 §3.5 | 结构化事件、字段、request_id、秘密与路径日志 | `cmd/navi/log.go`、HTTP 访问日志；凭证 String/GoString 屏蔽；README 说明运维路径用途 |
| 通用 §3.6 | 输入长度、范围、枚举、路径与认证重定向 | 登录字段 400 details；URL 禁止 userinfo；缓存防符号链接逃逸；JSON 与 SSE 均拒绝重定向 |
| 通用 §3.7 | 超时、取消、有界内存与并发、后台退出 | 运行期文件 I/O 传播 ctx；图标/元数据/列表/缓存/订阅/探测/事件帧有界；测试 goroutine 也使用 WaitGroup.Go；版本模板补齐操作超时和有界管道等待 |
| 通用 §3.8 | UTC 存储、毫秒协议、时钟注入 | `internal/timefmt` 读写均严格 UTC 三位毫秒；拒绝旧纳秒、偏移时区及非规范分隔符；认证/缓存/图标刷新/探测时钟可注入 |
| 通用 §4 | 依赖必要性、许可证、锁定、漏洞与职责重复 | React Router 决策；bcrypt 决策；移除 simple-icons 应用依赖，保留可重建 CC0 品牌路径；npm/go 审计 |
| 通用 §5.1 | 接口文档、兼容性、服务端与客户端契约 | `docs/API.md`；`tests/fixtures/api/login-invalid-length.json` 同时用于 Go HTTP 与 Web 字段错误测试 |
| 通用 §5.2 | 方法、snake_case、时间、字段保留、忽略新增响应字段 | JSON 与 SSE type 使用 snake_case；authenticated/auth_required 符合接口规则；登录成功响应与必填 tags 校验，不接受旧缺字段格式 |
| 通用 §5.3 | 错误信封、request ID、字段错误、超时/取消/重试 | 503 状态错误及图标 412/416 均返回信封；读取响应/事件流失败保留 request ID；字段按 reason 映射；未知代码不读取原型属性；SSE 自动重试最多两次 |
| 通用 §5.4 | 服务端鉴权、Cookie、401、CSRF、秘密存储 | bcrypt、摘要会话、HttpOnly/SameSite、CrossOriginProtection；集成测试检查退出与撤销 |
| 通用 §6 | 行为测试、失败边界、稳定时间、生产配置隔离 | 新增缓存逃逸/大小、取消、探测时钟、SSE、URL、路由、字段错误和格式化测试；生产 E2E 仅用临时合成数据 |
| 通用 §7–8 | 格式、lint、类型、测试、构建、未运行项目披露 | 见当前验收命令与结果；未以关闭整个检查文件通过 lint |
| 通用 §9–10 | 决策、例外、规范变更边界 | 项目差异与规范内特殊要求逐项说明；基于用户的 1.0.1 更新与后续修复授权完成 1.0.2；已确认的模板问题全部修正 |
| Go §1 | Go 补丁版本、现代写法、全部检查、固定工具版本、依赖选择 | `go.mod` 1.27.3；modern-go 规则；CI 固定 goimports/staticcheck/govulncheck；忽略 web/node_modules |
| Go §2 | import 分组、格式、文件/包/接收者/handler 命名、权限、注释、接口与参数 | gofmt/goimports/staticcheck；各包注释集中至 doc.go；handler 使用 w/r；参数 AST 检查 |
| Go §3 | errors.New、%w、errors.Is/AsType、领域错误、HTTP 映射、panic | app/http_errors；TLS 错误改 AsType；输入失败不 panic；随机令牌 rand.Text |
| Go §4 | 注入 slog、stdout/stderr、结构化字段、HTTP ErrorLog | cmd/log 返回 logger、close、error；配置日志路径用途已说明；会话请求与 Cookie 参数格式化脱敏；错误响应测试检查 request_id 与日志 |
| Go §5 | ctx 首参、无 ctx 字段、构造与启动分离、停止顺序、锁说明 | app/catalog/favicon 生命周期；文件读写上下文；Start/Shutdown；TestProbe 使用独立 transport，不替换全局客户端 |
| Go §5 与 §7 的明确签名 | 配置入口 `Load(Source)` 未增加 ctx | 启动期本地配置读取的边界已明确；1.0.2 也明确测试辅助函数可从 t.Context() 获取上下文并派生超时 |
| Go §6 | ServeMux、404/405 JSON、中间件、状态常量、输入上限、服务器/客户端超时、路径安全 | 所有 API 含 SSE/图标为 no-store；二进制条件/范围错误保持 JSON；Allow 包含 HEAD；OpenRoot 约束缓存；凭证请求不重定向 |
| Go §7 | JSON/YAML 标签、固定精度时间、未知/多文档拒绝、配置优先级与环境映射 | config、timefmt、JSON 解析与 fuzz；CLI 帮助修正为 NAVI_SERVER__PORT |
| Go §8 | SQLite 条款、密码和令牌存储 | 没有数据库，DSN/事务/migrations 不适用；认证相关要求仍适用并已检查 |
| Go §9 | 标准 testing、t.Context/Cleanup、并行、注入时钟、synctest、替身、fuzz/benchmark、HTTP 契约 | 无固定 sleep 等待真实异步；有界自建测试客户端；5 个 fuzz 入口；共享 JSON 样例 |
| Go §10.1–10.7 | 服务入口文件、帮助、接受/拒绝参数、配置选择、退出码、版本和关闭 | cmd/navi 单测与带 integration 标签的版本构建测试 |
| Go §10.8 | 一次性命令行工具扩展 | 不适用：Navi 是服务，无子命令 |
| Go 附录 B/C 与 §2 参数条款 | 逐字同步 1.0.2 版本模板 | command 三参数、check 单参数结构体；并行、断言、操作超时与上下文条款一致；隔离模板、实际项目和超时故障注入分别验证 |
| Web §1 | npm/锁文件/Node、固定脚本、Vite 目标、CI 顺序、无外部 CDN | package.json/lock、Vite、CI；资源随构建；完整 npm audit 包含开发依赖 |
| Web §2 | 严格编译、unknown、无 any/非空断言、type/相对导入、无嵌套三元 | 每个 tsconfig；strictTypeChecked；max-params 与 no-nested-ternary 规则；已校验的 API 边界断言保留 |
| Web §3 | Prettier、ESLint flat、样式检查、定点抑制 | 工具配置也纳入 lint；d.ts 采用规范明确规定的配置；剪贴板单行抑制已删除 |
| Web §4 | 现有文件命名、布尔前缀、服务端字段原名 | TypeScript 符号级重命名；协议字段保持原名 |
| Web §5 | 单一请求包装、响应校验、ApiError、取消、统一 401、错误映射、跳转 | app/api 包含 JSON 与 SSE；登录校验成功资源；必填字段不能用默认值掩盖；unknown enum 安全处理；请求 ID 保留 |
| Web §6 | 加载/空/失败区分、保留旧数据、alert/重试、字段错误、全局提示、Promise | 状态查询失败显示错误并保留目录；登录按 reason 映射；服务端事件刷新不重置 SSE 重试预算；显式刷新可重连 |
| Web §7 | 中文、时区、统一日期数字格式 | lang zh-CN；clock/time 移到 lib/format；数量与序号统一；无文件大小展示场景 |
| Web §8 | 设计变量、color-scheme、CSS Modules、断点、减弱动效、内联几何 | colors/spacing/radii/shadows/type/motion 在 styles；品牌与色板去内联颜色；强度/滚动透明度通过 root 变量；剩余内联仅布局/动画几何 |
| Web §9 | 语义控件、标签、焦点/关闭、触控、axe | 三浏览器 E2E 的控件尺寸与键盘检查；关键页面 serious/critical axe 断言 |
| Web §10 | Vitest/RTL/user-event、setup 清理、按语义查询、浏览器隔离、固定时钟、视觉来源 | 非用户事件才用 fireEvent；DOM 根状态直接断言，CSS locator 仅几何；Linux 同 CI 环境比较截图 |
| React §1–2 | Hooks 插件、StrictMode、函数/具名组件、Props、key、富文本与记忆化 | 没有 Compiler/FC/dangerouslySetInnerHTML；去除无证据 memo；保留 effect 依赖需要的稳定引用并说明 |
| React §3 | 派生状态、effect 外部同步与释放、Context、表单 | 全局 Provider 归 app；标题/主题恢复；订阅、timer、observer、请求清理；登录 FormData |
| React §4 | QueryClient、领域 hook/key、signal、mutation 与失效 | auth/catalog/status hook；统一 retry 规则；无组件手写 fetch 状态机 |
| React §5 | 路由表、懒加载、History 页面响应、URL 可分享状态 | Router、urlState；仅 /、/login、/go 为页面入口，未知路径返回 HTTP 404 并加载懒加载的不存在页面；无旧首页别名 |
| React §6–7 | CSS Modules、单次全局样式、条件类名、独立测试 QueryClient | 组件就近样式；main 入口全局样式；测试禁重试 |

## 验收边界

源码规范检查与自动化结果见当前验收记录。真实触控设备、人工浏览器缩放、远程 GitHub CI 运行以及视觉基线的人类提交评审，不能用本机模拟结果冒充。用户已授权本地提交全部整改，交付不包含推送或部署。已确认的问题均已修复，但自动化通过不证明代码绝无其他缺陷；其他仓库规范副本的同步范围另行明确。
