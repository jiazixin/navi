# 前后端全仓规范整改验收（2026-10-27）

本轮按目录、通用、Go、Web、React 五份规范复核前后端及测试、构建配置，不限于 `setSessionCookie` 和 `createSession`。逐条证据、适用范围和规范本身的特殊约束见 [STANDARDS_AUDIT.md](STANDARDS_AUDIT.md)。验证对象为基于 `01a09dc` 的当前工作区，保留此前已有修改和本地配置；没有重置、提交、推送或重启用户服务。

本轮发现的遗漏已修复，下列本地验证均通过。Go 规范要求逐字保留的版本测试模板、固定的 `config.Load(Source)` 签名，以及 README 已登记的项目例外，均在复核表中单独说明；不把这些情况隐藏后宣称“零例外”。

## 主要整改

- 参数检查覆盖生产代码、测试助手和 Canvas 渲染器。会话、Cookie、校验、缓存读写等超过三个参数的函数改为参数对象；布尔命名、组件 Props、导出注释、错误构造及资源释放说明一并整理。
- 缓存增加文件/元数据/目录扫描/索引数量边界，使用 `os.Root` 防止缓存目录和子文件通过符号链接逃逸。新增测试先复现越界读取及超大写入，再验证拒绝。运行期文件 I/O 传递调用方 context，探测与刷新逻辑注入时钟，测试 goroutine 也有 WaitGroup 所有者。
- 目录 URL 禁止 userinfo，图标发现/下载与探测再次校验；探测并发、缓存和事件订阅数量有界。登录长度校验返回 400 字段详情，前后端共享 JSON 契约样例。
- 全局状态归 `app/`，跨域通过公开入口，时间/数字格式化归 `lib/format/`。接入集中懒加载路由表并保留旧 SPA 书签回退；目录页、搜索文本和提供方写入 URL。
- JSON 与 SSE 共用应用请求模块。SSE 拒绝重定向、统一处理 401、限制未完成事件大小并设置空闲超时，最多自动重试两次，支持手动/网络恢复重连。错误与表单字段提示统一处理。
- 颜色、间距、圆角、字号、阴影、时长集中到样式变量；去除固定内联样式和不必要的 memo。只保留一个应用图标库，三个 CC0 品牌路径以固定版本、可重建方式随源码保存。
- 补齐 ESLint、格式化、CI 检查顺序、断点登记、技术决定与审计记录。没有调低测试门槛或更新视觉基线来掩盖回归。

此前的 bcrypt `password_hash`、SHA-256 会话摘要、HttpOnly Cookie、请求大小限制等整改继续保留。其他部署使用旧 `auth.password` 时仍须按 README 迁移；本轮没有再次改写用户本地凭证。

## 实际验证结果

主机：macOS ARM64、Go 1.27.3、Node 26.12.1、npm 11.20.0。Linux 视觉验证：ARM64、Node 24.22.1、Playwright 1.62.1，使用 CI 固定镜像摘要 `sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`；Node 官方压缩包核验 SHASUMS256。

| 检查 | 实际命令 / 范围 | 结果 |
| --- | --- | --- |
| Web 格式 | `npm --prefix web run format:check` | 通过 |
| Web 静态/类型 | `npm --prefix web run lint`、`npm --prefix web run typecheck` | 通过，无 lint warning |
| Web 单元/契约 | `npm --prefix web run test` | 28 个文件、125 项通过；语句 95.40%、分支 85.38%、函数 94.73%、行 96.90% |
| Web 构建 | `npm --prefix web run build` | 通过；ES2022，无发布 sourcemap |
| Storybook | `npm --prefix web run storybook:test` | 测试模式构建通过；不冒充浏览器交互测试 |
| 前端 E2E | `npm --prefix web run test:e2e` | Chromium / Firefox / WebKit 共 45 项通过，含千链接、键盘、布局、axe、URL 分享 |
| 生产 E2E | `npm --prefix web run test:production` | 三浏览器共 24 项通过；真实 Go 服务、临时目录与合成配置 |
| Linux 视觉 | `npm --prefix web run test:visual -- --workers=2` | 16 项通过、18 张既有 Linux 基线全部匹配；本轮没有接受新基线 |
| Go 模块 | `go mod verify`、`go mod tidy -diff` | 通过，无 tidy 差异 |
| Go 格式 | gofmt；`goimports@v0.50.0 -local navi` | 通过，覆盖当前 cmd/internal/embed 源码及测试 |
| Go vet / build | linux/darwin × amd64/arm64；`CGO_ENABLED=0 ... go build -trimpath` | 四个平台分别通过 |
| 扩展 vet | `go vet -tags integration,scale ./...` | 通过 |
| Go 静态 | `staticcheck@v0.8.2 ./...` | 通过 |
| Go 竞态 | `go test -race -count=1 ./...` | 7 个有测试包通过，web 嵌入包编译通过 |
| 版本集成 | `go test -tags integration -count=1 ./cmd/navi` | 通过 |
| Fuzz | DecodeCatalog、DecodeConfig、DecodeLogin、ValidateIcon、DiscoverCandidates，各 `-fuzztime=5s -parallel=2` | 5 个目标通过 |
| Go 漏洞 | `govulncheck@v1.9.0 ./...` | 0 个可达漏洞，0 个导入包漏洞；另有 1 个未导入模块包的公告，未抑制 |
| npm 漏洞 | 完整 `npm audit --audit-level=high` 及 `--omit=dev` | 均为 0 个漏洞 |
| 干净构建 | 当前 266 个源码/配置/文档文件复制到隔离目录，排除真实配置、依赖与产物；重新 `npm ci`、Web build、Go build | 通过；合成配置下 health、静态 UI、认证、目录、状态、退出登录和 SIGTERM exit 0 |
| GoReleaser | 官方 2.18.3 二进制校验 SHA-256；`check`；`release --snapshot --clean --parallelism 2` | 通过；四平台压缩包、配置示例和 SHA-256 校验通过；仅临时修改输出目录到 `.cache/verification/release-output`，未发布 |
| 容器 | 从隔离当前源码 Docker build；UID/GID 65532、配置目录只读、缓存 volume 可写 | 通过；health、静态资源、认证、退出登录和 SIGTERM exit 0 |
| 差异检查 | `git diff --check`；参数/布尔/跨域导入扫描 | 通过；扫描命中的强制版本模板、原协议字段和明确公开入口已逐项核实 |

完整 npm 审计覆盖开发依赖。Go 模块公告为 x/crypto/openpgp 的 GO-2026-5932，本项目不导入该包；不能把“可达漏洞为 0”改写为整个依赖模块不存在任何公告。

最终命令输出保存在本机被忽略的 `.cache/verification/results/`，仅作为本轮证据，不提交测试报告。隔离目录和发布快照也位于 `.cache/verification/`，不包含用户配置。

## 验证中发现并消除的回归

- 初次高并发 E2E 的千链接渲染等待失败，在限定两个 worker 后通过，未延长断言时限。
- 新路由表曾遗漏 `/navigation` 等书签的 SPA 回退，生产集成发现后恢复原行为，并增加路由回归测试。
- 样式整理曾把秒数进度应用到错误元素，Linux 像素比较发现后修正几何变量的类型写法；保留原 18 张基线重跑通过。
- 更新语义定位断言时误改了一处搜索 option 的 ARIA 属性，已恢复正确的 `aria-selected` 检查；45 项 E2E 重新全部通过。

## 尚未执行的外部检查

远端 GitHub Actions、真实手机触控、人工 200%/400% 缩放和线上反向代理环境没有执行。本机三浏览器和容器测试不能替代这些检查。现有视觉基线本轮未更新；任何后续基线变更仍须按项目规则在人类评审后提交。本任务未提交、推送或部署。
