# 未上线项目全仓规范复核验收（2026-10-27）

验证对象为 `31ea97b` 加本轮工作区改动。开始时 Git 工作区干净；按根目录的目录、通用、Go、Web、React 五份规范检查前后端、测试、工具配置、CI 与文档。当前源码清单为 274 个文件，含 28 个 Go 生产文件、32 个 Go 测试文件和 66 个前端生产模块。逐条适用范围与证据见 [STANDARDS_AUDIT.md](STANDARDS_AUDIT.md)。

此前代码并非全部符合规范；检查发现的问题已直接整改。用户追加要求后，又消除了配置路径、Go 导航文案和剪贴板 lint 抑制三项可统一的做法。用户更新 Go 规范至 1.0.1 后，再授权修复剩余问题并提交；当前已完成 1.0.2 修订，测试模板的操作超时、上下文签名和路径说明均已统一，见 [STANDARDS_AUDIT.md](STANDARDS_AUDIT.md#go-102-补充修正)。未降低检查门槛或更新视觉基线，也不以检查通过证明不存在任何缺陷。

## 最终修复与提交前验证（Go 规范 1.0.2）

在用户 1.0.1 更新的基础上，1.0.2 明确测试辅助函数可从 t.Context() 取得上下文，但需要超时的操作仍须派生操作 deadline；补全 WorkDir 在相对配置路径、内置默认路径和文件省略字段中的作用。附录 C 与项目版本测试均增加 2 分钟命令超时、10 秒二进制超时及 5 秒 WaitDelay，超时错误保留上下文原因。CLI 的三个纯函数测试及表驱动子测试也已补齐并行和 got/want 格式。

实际验证：

- 全部 Go 示例通过 gofmt，附录 B/C 与项目三份版本源文件逐字一致。
- 隔离提取的新版模板执行 `go test -race -tags integration -count=1 -timeout=3m ./...`，通过。
- 先完成 Web build，再执行全仓 `go test -race -tags integration -count=1 -timeout=5m ./...`：7 个有测试包通过，web 嵌入包编译通过；CLI 测试格式与并行补齐后，再验证受影响的 cmd/navi 包。
- Go mod verify、tidy -diff、含未提交新文件的 gofmt/goimports@v0.50.0、默认及 integration/scale vet、integration staticcheck@v0.8.2、四平台 integration vet、实际二进制构建通过。
- 故障注入先用 1.0.1 模板复现卡住命令只能触发测试总超时，再用 1.0.2 验证副本将单次操作时限缩短为 100 毫秒，分别运行阻塞的 Git 替身和阻塞的版本二进制：两者均在操作时限结束后报告 context deadline exceeded，没有触发测试总超时。正式模板的 2 分钟/10 秒时限未缩短。

本轮仅追加 Go 测试与规范修订，Web 单测、浏览器、视觉、容器和发布打包的最近实际验证见下方分轮记录，未冒充本轮重跑。最终日志位于被忽略的 `.cache/standards-final-20261027/`。本地配置与运行数据保留，交付包含本次累计整改的本地 Git 提交，不含远端推送或部署。

另在同一代码工作目录检出六个仓库持有 Go 规范 1.0.1 副本，版本与文件摘要已列入本机 `.cache/standards-final-20261027/other-standard-copies.json`；本次提交只覆盖 Navi，其他仓库的规范和实现同步需在相应仓库进行。

## Go 规范 1.0.1 复核与项目同步（修复剩余问题前）

本次只修改 CLI 局部变量命名、两份版本测试及复核记录：parseArgs/run 使用 opts；版本单测和构建集成测试逐字同步用户更新后的附录 C。配置加载保留唯一的 Load(Source)，新版规范已明确其启动期本地读取的适用边界。规范文件的 SHA-256 在本次操作前后相同。

实际通过的检查：

- 将附录 B/C 的三份完整源文件提取至隔离模块，执行 `go test -race -tags integration -count=1 -timeout=2m ./...`。
- 按构建顺序重新执行 `npm --prefix web run build`，随后执行项目 `go test -race -tags integration -count=1 -timeout=2m ./cmd/navi`。
- 四份受影响 Go 文件的 gofmt、goimports@v0.50.0；cmd/navi 的 integration 标签 vet（linux/darwin × amd64/arm64）、staticcheck@v0.8.2；实际 Go 二进制构建。
- 三份项目版本源文件与新版附录逐字一致；用户更新的规范原文未被本次同步覆盖。

该轮输出保存在被忽略的 `.cache/standards-update-20261027/`。当时没有重跑其余业务包测试、Web 单测、浏览器、视觉、容器或发布打包；下节各轮结果均有各自范围。当时发现模板虽能运行，仍缺少操作 deadline 及辅助函数签名边界；这些问题现已由 1.0.2 修复。

## 首轮全仓整改

- **目录与构建**：包级文档统一归 `doc.go`，Docker 同步包含嵌入包文档；品牌生成脚本按脚本位置定位仓库，可从其他工作目录运行。当前依赖图未发现基础模块反向依赖业务、跨域私有导入、循环依赖或生产代码导入测试代码。
- **直接统一协议**：SSE 事件名和 JSON type 改为 snake_case；缓存时间仅接受 UTC 三位毫秒；登录成功响应、目录 tags 和状态字段严格校验。旧页面路径不再作为首页别名，统一 HTTP 404 与懒加载的不存在页面。没有双事件名、旧路由或旧缓存格式适配器。
- **重试与界面状态**：SSE 收到响应头不再清零重试次数；服务端通知只刷新数据，显式刷新或网络恢复才重启订阅预算。自动重试最多两次，状态请求失败显示提示并保留已有目录。
- **错误契约**：状态不可用返回 503 错误信封；JSON 编码失败在发送状态前转换为 500；图标保留底层错误用于日志，412/416 条件与范围错误也使用 JSON 信封。所有 API（包括 SSE、图标及其错误）保持 no-store。读取响应和事件流失败保留 request ID。
- **字段与未知代码**：登录字段提示按 reason 映射，未知原因安全降级；错误/状态/导航代码表不读取对象原型属性。未知枚举的正常容错继续保留，不把它当成旧版本支持。
- **配置与日志**：主配置拒绝非普通文件；配置校验保留底层错误链；会话与 Cookie 参数格式化脱敏；日志构造及关闭符合 CLI 模板；README 与开发检查命令使用固定工具版本。旧验收结论和历史计划已标明适用范围。

明文密码配置仍被明确拒绝，以防错误配置静默关闭认证。这是输入校验，不是旧配置支持。首轮未读取或改写用户凭证、迁移真实配置、清理既有运行数据，当时未提交、推送或部署。

## 追加例外清理验证（1.0.1 同步前）

- **路径来源**：内置 `.cache`、`configs/urls.yaml` 始终按工作目录解析，包括实际配置文件省略的字段；文件显式路径按配置目录，无文件的相对环境覆盖按工作目录。不搜索旧位置。
- **导航错误页面**：删除 Go 中文提示和备用 HTML；只向真实构建入口注入错误码、重试路径和外观配置，React 负责文案。入口缺失或不含有效根节点时返回 503 `frontend_not_built`。
- **剪贴板**：删除唯一的单行 lint 抑制；访问和写入均在现有 try/catch 内，API 缺失或权限拒绝显示失败提示，不保留旧浏览器 API 适配。
- **说明同步**：中英文 README、示例配置、设计和接口文档同步实际行为。CLI 配置选择、声明文件和共享样例遵循规范，移出项目例外表；版本测试逐字核对原模板。详细原因见 [例外逐项处理](STANDARDS_AUDIT.md#例外逐项处理)。

先以回归测试复现三个路径来源错误、Go 生成文案和入口缺失仍返回备用 HTML，再完成修复。主机环境与首轮一致，当前改动的验证如下：

| 检查 | 实际范围与结果 |
| --- | --- |
| Web 静态与构建 | format:check、零 warning lint、typecheck、Vite build 全部通过 |
| Web 单元与契约 | 28 个文件、141 项通过；语句 96%、分支 85.99%、函数 95.34%、行 97.36% |
| 真实服务 E2E | Chromium、Firefox、WebKit 共 24 项通过，使用独立合成配置与目录 |
| Go 模块、格式与静态 | mod verify、tidy -diff、gofmt、goimports@v0.50.0、vet、integration/scale 标签 vet、staticcheck@v0.8.2 全部通过 |
| Go 竞态 | go test -race -count=1 ./...；7 个有测试包通过，web 嵌入包编译通过 |
| Go 版本与模板 | integration 版本构建测试通过；两份版本测试文件与当时的 Go 规范 1.0.0 附录 C 一致 |
| Go 平台 | linux/darwin × amd64/arm64 的 vet 全部通过 |
| 配置 Fuzz | FuzzDecodeConfig，5 秒、parallel=2，通过 |
| Go 依赖安全 | govulncheck@v1.9.0：0 个可达/导入包漏洞；另有 1 个未导入模块包公告 |
| 干净副本 | 复制当前 274 个非忽略文件，排除 Git、真实配置、既有依赖和产物；重新 npm ci、Web build、Go test/build，通过 |
| 干净启动 | 缺省主配置、只含部分字段的嵌套主配置、仅环境覆盖三种场景均读取正确路径；health、目录、嵌入导航失败页及 SIGTERM exit 0 均通过 |
| 差异与文档 | git diff --check；旧例外与兼容描述复核；规范基线未改动 |

该轮输出保存在被忽略的 `.cache/exception-cleanup-20261027/`。平台 vet 的一次并发执行碰上 Web 构建清空 dist，随后按先 Web 构建、后 Go 检查的要求重跑四个平台，均通过。没有修改真实配置或运行数据，当时未提交、推送或部署。

下节保留追加清理前的全仓验证记录。追加修改未重复执行前端 fixture E2E、Linux 视觉、Storybook、容器和四平台发布打包，不能把这些首轮结果当成追加修改后的重新验证。

## 首轮全仓验证（追加清理前）

主机：macOS ARM64、Go 1.27.3、Node 26.12.1、npm 11.20.0。Linux 视觉环境为 ARM64、Node 24.22.1、Playwright 1.62.1，使用 CI 固定镜像摘要 `sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`；Node 压缩包核验官方 SHASUMS256。

| 检查 | 实际范围 | 结果 |
| --- | --- | --- |
| Web 格式、静态、类型 | format:check、lint（零 warning）、typecheck | 通过 |
| Web 单元与契约 | Vitest 全套 | 28 个文件、141 项通过；语句 96.01%、分支 86.02%、函数 95.34%、行 97.36% |
| Web 构建 | Vite build | 通过；ES2022，无发布 sourcemap |
| Storybook | storybook:test | 测试模式构建通过；并非浏览器交互测试 |
| 三浏览器 E2E | Chromium、Firefox、WebKit | 前端 45 项、真实 Go 服务 24 项通过 |
| Linux 视觉 | test:visual -- --workers=2 | 16 项通过，18 张原有基线匹配，未更新基线 |
| Go 模块 | go mod verify、go mod tidy -diff | 通过，无 tidy 差异 |
| Go 格式与静态 | gofmt、goimports@v0.50.0、vet、带 integration/scale 标签的 vet、staticcheck@v0.8.2 | 通过；检查含新增未提交文件 |
| 平台检查 | linux/darwin × amd64/arm64 的 vet；GoReleaser 四平台 build | 通过 |
| Go 竞态 | go test -race -count=1 ./... | 7 个有测试包通过，web 嵌入包编译通过 |
| 版本协议 | go test -tags integration ./cmd/navi -count=1 | 通过 |
| Fuzz | DecodeCatalog、DecodeConfig、DecodeLogin、ValidateIcon、DiscoverCandidates，各 5 秒、parallel=2 | 五个目标通过 |
| 依赖安全 | govulncheck@v1.9.0；完整 npm audit | Go 0 个可达/导入包漏洞，另有 1 个未导入模块包公告；npm 0 个漏洞 |
| 干净副本 | 仅复制当前非忽略文件，排除 Git、真实配置、依赖和构建产物；重新 npm ci、格式/lint/类型/单测、Web build、Go test/build | 通过；合成配置下 health、资源、登录、目录、状态、404、退出登录和 SIGTERM exit 0 |
| GoReleaser | 2.18.3 check；snapshot 四平台构建、压缩包内容与 SHA-256 | 通过；本地生成，未发布；最终快照复用已单独验证的 Web 构建，跳过 before 钩子 |
| 容器 | 从干净副本 Docker build；运行 UID 65532、配置只读、缓存 volume 可写 | 通过；合成配置的接口和退出流程正常，SIGTERM exit 0 |
| 结构与差异 | TypeScript 导入图、Go AST 参数/包注释、生成资源、git diff --check | 通过；仅两个强制版本模板闭包有 4/5 参数，已按具体模板条款登记 |

首轮先用回归测试复现时间格式、非普通配置文件、错误链、SSE 重试、503 信封、图标缓存头/412/416、字段原因映射等问题，再修复。测试环境缺少 IntersectionObserver 的情况由 jsdom 测试替身处理，生产代码不保留旧浏览器分支。

首轮输出保存在本机被忽略的 `.cache/standards-recheck-20261027/`。Go 漏洞结果不等于整个依赖模块没有任何公告；Storybook 的非发布测试构建有 vendor chunk 大小提示，不是 lint warning，未调高阈值掩盖它。

## 验证边界

未运行远端 GitHub Actions、真实手机触控、人工 200%/400% 缩放及实际反向代理环境。当前本地三浏览器、Linux 视觉和容器验证不能替代这些检查。项目尚未上线，不保留旧协议适配；用户最终授权将本轮累计整改作本地提交，未授权远端推送或部署。
