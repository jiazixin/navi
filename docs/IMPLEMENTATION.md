# 开发与验证

使用入口见 [README.md](../README.md)，协议见 [DESIGN.md](DESIGN.md)，界面约定见 [UI_SPEC.md](UI_SPEC.md)，本轮结果见 [ACCEPTANCE.md](ACCEPTANCE.md)。已完成计划与过期验证记录由 Git 历史保留，不把历史通过结果当作当前验收。

## 开发约定

- Go 模块保持显式依赖；前端按业务功能组织，API 边界用 Zod 校验。YAML 使用 snake_case，JSON 使用 snake_case，内部标识符服从语言惯例。
- goroutine、订阅、timer、文件及响应体有明确释放路径；外部 I/O 设置超时和并发上限。取消请求不作为目标不可达的缓存证据。
- 不回写 YAML；图标目录只保存可重建缓存。日志不输出查询参数、凭证和原始远端响应。
- TypeScript 使用严格类型，避免以 any、非空断言或 lint suppression 绕过错误。为真实行为失败补充对应回归测试；覆盖率不能替代浏览器和后端集成。
- 变量与函数名表达实际含义；Go 的接收者、循环索引及 `err`、`ctx`，几何坐标 `x/y` 可沿用惯例。有关联的多返回值优先使用具名结构。
- 函数按实际职责划分；组件负责装配与展示，复杂状态、副作用放所属应用或业务域的 hook。认证、限流与会话有明确边界和锁范围。
- 复杂分支使用早返回或 `switch`，不使用多层三元表达式。相同逻辑已有真实调用方时再提取共享实现。重构检查数据所有权、认证、焦点与订阅清理。
- 依赖升级有明确原因，核对上游兼容信息与漏洞结果；清单和锁文件同步，不用强制审计修复代替分析。

## 默认检查与构建

版本以 `go.mod` 和 `web/package.json` 为准。以下命令从仓库根执行；安装依赖并先生成前端，再执行 Go 检查。

```sh
go mod download
npm --prefix web ci
npm --prefix web run format:check
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run test
npm --prefix web run build
go mod verify
go mod tidy -diff
test -z "$(gofmt -l $(git ls-files '*.go'))"
test -z "$(go run golang.org/x/tools/cmd/goimports@v0.50.0 -local navi -l $(git ls-files '*.go'))"
go vet ./...
go vet -tags integration,scale ./...
go run honnef.co/go/tools/cmd/staticcheck@v0.8.2 ./...
CGO_ENABLED=1 go test -race -count=1 ./...
go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 ./...
CGO_ENABLED=0 go build -trimpath -o bin/navi ./cmd/navi
./bin/navi --version
```

版本、提交与提交时间由 Go 从 git 嵌入，不再用 `-ldflags` 注入；无 `.git` 时可用 `-X main.version=...` 指定版本，详见 README。`go.mod` 已忽略 `web/node_modules`，Go 检查使用 `./...`。Go 检查需要可写构建缓存；race 需要受支持的平台与本机 C 工具链。

前端测试执行所有被发现的单元与契约测试，V8 覆盖率统计 `src/**/*.{ts,tsx}` 生产源码，包括未触达的入口和组件；排除声明、测试 setup、测试文件与 Storybook 故事。不能为达到门槛而排除 App、main 或其他未测生产文件，覆盖率也不能替代真实浏览器验证。

## 浏览器与组件检查

```sh
(cd web && npx playwright install)
npm --prefix web run storybook:test
npm --prefix web run test:e2e
npm --prefix web run test:visual
npm --prefix web run test:production
```

Linux 可在 `web/` 执行 `npx playwright install --with-deps` 安装浏览器所需系统库；这一步可能需要系统包管理权限。浏览器版本由项目 Playwright 版本决定。视觉基线命名包含 `linux`，必须使用 CI 固定的 Playwright 容器、Node 版本及 Linux ARM64 架构。不能在 macOS 生成替代基线，也不为消除失败直接接受新图。

- `storybook:test` 只构建 Storybook 测试模式产物，检查故事能够打包；它不运行组件浏览器交互断言。
- `test:e2e` 和 `test:visual` 启动 4173 端口的 Vite fixture 服务，验证前端布局与交互，不读取真实配置。已有同端口服务会在非 CI 下复用，执行前确保它确实属于当前代码。
- `test:production` 先构建前端，在临时目录构建和运行真实 Go 二进制。三浏览器使用合成配置和本机目标服务，覆盖认证、登录页布局与无障碍、CSP、private/public 跳转、失败重试、YAML 原子热加载/非法更新恢复、关闭目录监听时缓存故障与图标恢复。API 不 mock，fixture 清理进程和目录并检查退出码。

测试需允许本机监听端口与浏览器启动。不要让不同测试套件同时使用 4173 端口或写同一测试输出目录。单元测试限制为 4 个 worker；全量验收时依次运行各套件，避免多个浏览器、覆盖率和构建任务同时争用 CPU，造成交互超时。

## 静态检查与依赖安全

使用 CI 固定的 Go 工具版本执行：

```sh
go run honnef.co/go/tools/cmd/staticcheck@v0.8.2 ./...
go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 ./...
go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 -mode=binary bin/navi
npm --prefix web audit
```

工具版本应与 Go 工具链兼容，并记入本轮验收。漏洞检查需要联网访问数据库；未安装、连接失败或数据库不可用均记录为“未执行/失败”，不能表述为零漏洞。完整 `npm audit` 包括构建与测试依赖；`--omit=dev` 只覆盖生产依赖，不能代表完整扫描。

## 干净构建与性能

上线验收使用包含当前工作区修改的隔离副本，排除真实配置、缓存、依赖、产物和测试报告；不能仅检出旧 HEAD。副本中从锁文件安装，构建前端、运行默认检查、构建二进制，并用临时合成配置验证 health、首页、目录、认证和 SIGTERM 关闭。不要清理用户工作区来制造干净环境。

生产构建默认不生成 sourcemap。诊断时可执行 `npm --prefix web run build -- --sourcemap`；随后重新执行普通构建再发布，避免嵌入诊断文件。性能复核记录实际环境和条件，检查发布包体积、500/1000 链接筛选、背景动画 CPU、链接跳转分配与并发探测，避免未经测量的优化或绝对帧率承诺。

## 部署与手工范围

- 用隔离配置检查健康、认证开关、错误/正确密码、退出后的 API 401、catalog、实际跳转和正常关闭。
- 验证 YAML 普通保存与原子替换、非法更新保留快照及修复恢复；分别验证 private 成功、private 失败 public 成功、全部失败。区分服务器与浏览器网络视角。
- 验证空缓存、图标下载失败后恢复、重启复用缓存、关闭 catalog.watch 后的图标通知，以及图标文件丢失后的重新获取。
- 人工检查真实触控、200%/400% 浏览器缩放、字体放大、高 DPI、reduced motion 和高刷新率；视口模拟不等于真机验收。
- 容器按 README 用配置目录只读挂载、可写缓存 volume 和环境变量覆盖。验证 UID/GID 65532 的配置读取与缓存写入、外部 health、HTTPS Cookie、反向代理 Host、SSE 长连接与关闭。守护进程不可用时明确记录容器构建/运行未执行。

CI 为 GitHub Actions（[ci.yml](../.github/workflows/ci.yml)、[release.yml](../.github/workflows/release.yml)），直接编排上述原生命令并声明先 Web 后 Go 的依赖；浏览器只在 Linux Chromium 上运行 fixture 与生产集成 E2E，视觉回归、静态检查与漏洞扫描也在 CI 执行；Firefox/WebKit 与手工范围按本文在本地执行。

## Linux 视觉基线与模糊测试

视觉 job 使用 `mcr.microsoft.com/playwright:v1.62.1-noble`（摘要固定在 CI）和 Node 24.22.1，架构为 Linux ARM64。先在隔离副本中 `npm --prefix web ci --ignore-scripts`，再执行 `npm --prefix web run test:visual -- --workers=2`。更新时加 `--update-snapshots`，逐张审阅后移入默认快照目录，并在不带更新参数时重跑。macOS 不能直接更新这些基线。容器原装 Node 版本较低，需按 CI 的 setup-node 版本安装；本轮使用 nodejs.org 官方 linux-arm64 压缩包并核验 SHASUMS256。

默认 Go 测试执行 `internal/<包>/testdata/fuzz/<目标>/` 中的固定语料；持续模糊测试单独执行：

```sh
go test ./internal/catalog -run '^$' -fuzz '^FuzzDecodeCatalog$' -fuzztime=5s -parallel=2
go test ./internal/config -run '^$' -fuzz '^FuzzDecodeConfig$' -fuzztime=5s -parallel=2
go test ./internal/app -run '^$' -fuzz '^FuzzDecodeLogin$' -fuzztime=5s -parallel=2
go test ./internal/favicon -run '^$' -fuzz '^FuzzValidateIcon$' -fuzztime=5s -parallel=2
```

四个发布组合均运行 vet：`GOOS=linux/darwin` × `GOARCH=amd64/arm64`；版本构建集成测试使用 `go test -tags integration ./cmd/navi`。静态检查版本以 CI 固定值为准，前端完整审计包含开发依赖。

## 本轮补充边界

逐条复核见 [STANDARDS_AUDIT.md](STANDARDS_AUDIT.md)。浏览器构建目标为 ES2022，不下发 sourcemap；支持具备 AbortSignal.any/timeout、ReadableStream、原生 dialog 与现代 CSS 的当前 Chromium、Firefox、Safari/WebKit，具体实测版本由 Playwright 1.62.1 锁定。旧浏览器不在本项目支持范围，生产代码直接使用 IntersectionObserver；jsdom 缺失的布局 API 仅在 `src/test/` 替换。

图标缓存同时限制单文件 4 MiB、单份元数据 32 KiB、4096 条索引和 16384 个启动扫描文件；导航探测并发为 1–256、探测缓存/进行中目标最多 4096；事件订阅最多 4096。缓存目录和文件通过 os.Root 限制在 storage 内，外部符号链接拒绝读取。元数据只属可重建缓存，非法项跳过并由后台重新获取。

额外 HTML 发现解析器 fuzz：`go test ./internal/favicon -run '^$' -fuzz '^FuzzDiscoverCandidates$' -fuzztime=5s -parallel=2`。品牌路径可执行 `node scripts/update-brand-icons.mjs` 重建（需要网络与 npm/tar），生成后检查差异。
