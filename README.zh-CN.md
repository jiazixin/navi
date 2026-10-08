# Navi

Navi 是一个自托管、只读的个人导航系统。Go 后端读取 YAML 目录，提供可选登录、目录热加载、内外网链接选择和 favicon 缓存；React 前端嵌入单个 Go 二进制，支持搜索、分页、主题、响应式布局与键盘操作。生产运行不需要 Node。

[English README](README.md) · [设计与协议](docs/DESIGN.md) · [开发与验证](docs/IMPLEMENTATION.md) · [本轮验收](docs/ACCEPTANCE.md)

## 环境与首次运行

- Go 版本以 [go.mod](go.mod) 为准，当前要求 Go 1.27.1 或以上。
- Node 版本以 [web/package.json](web/package.json) 为准。可使用 Node 22.22.2+ 的 22.x、24.15.0+ 的 24.x 或 26+；npm 使用该 Node 版本附带的版本。
- 使用已提交的 `web/package-lock.json`，通过 `npm ci` 安装。浏览器检查还需 Playwright 浏览器与操作系统依赖。

以下命令从仓库根执行。初始化命令保留已有配置：

```sh
cp -n configs/config.example.yaml configs/config.local.yaml
cp -n configs/urls.example.yaml configs/urls.yaml
go mod download
npm --prefix web ci
npm --prefix web run build
VERSION=$(git describe --tags --exact-match HEAD 2>/dev/null || git rev-parse --short HEAD)
COMMIT=$(git rev-parse --short HEAD)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
CGO_ENABLED=0 go build -trimpath -buildvcs=false \
  -ldflags "-X main.version=${VERSION} -X main.commit=${COMMIT} -X main.buildTime=${BUILD_TIME}" \
  -o bin/navi ./cmd/navi
./bin/navi --config ./configs/config.local.yaml
```

默认地址为 `http://127.0.0.1:8080`，健康检查为 `/health`。先编辑两份本地 YAML；账号密码默认均为空，服务允许直接访问。需要登录时同时设置 `auth.username` 和 `auth.password`。

## 配置

完整字段、默认值和约束以 [config.example.yaml](configs/config.example.yaml) 为准。导航格式见 [urls.example.yaml](configs/urls.example.yaml) 和 [数据契约](docs/DESIGN.md#导航数据)。

- `-f PATH` / `--config PATH` 显式选择主配置，并覆盖 `CONFIG_FILE`；未传标志时仍可用 `CONFIG_FILE`。相对路径以进程工作目录为基准。两者都未设置时只查找 `./configs/config.local.yaml`，缺失时使用内置默认值；显式空值、文件不存在、不可读或 YAML 非法均启动失败。导航 YAML 必须存在且合法。
- 优先级为环境变量 > 所选文件 > 内置默认值。字段映射为 `NAVI_<字段>` 或 `NAVI_<节>_<字段>`，例如 `NAVI_STORAGE=/var/cache/navi`、`NAVI_SERVER_PORT=8081`、`NAVI_CATALOG_WATCH=false`。
- 字符串环境变量保留原值，路径解析时去掉首尾空白；凭证精确匹配。空字符串会覆盖文件值：允许清空可选认证，但不能清空必填路径。数字、布尔和时长必须是单个非空标量，非法值报错。时长使用 `250ms`、`3s`、`168h`，不支持 `7d`。
- `storage` 和 `catalog.path`（包括环境覆盖）相对所选配置所在目录解析。没有隐式主配置时仍以预期的 `configs/` 为基准，因此默认目录为 `configs/urls.yaml`，缓存为 `.cache/`。部署优先使用绝对路径。
- 主配置修改后重启生效；仅 `catalog.path` 指向的导航文件支持热加载。合法更新通过 SSE 通知页面，非法更新保留最近有效目录并提示降级，修复后恢复。

导航示例：

```yaml
version: 1
pages:
  - id: work
    title: 工作导航
    urls:
      - name: Grafana
        group: 基础设施
        description: 指标与仪表盘
        private_url: http://grafana.lan:3000
        public_url: https://grafana.example.com
        tags: [monitoring, metrics]
```

`private_url` 和 `public_url` 至少一个，只接受绝对 HTTP(S) 地址。页顺序来自 `pages`；分组按首次出现排序，组内保持 YAML 相对顺序。每页必须显式写 `urls`，允许空数组。文件最多 2 MiB、20 页、1000 链接。Navi 不回写目录，不提供 Web 编辑器、拖拽排序、数据库或目录写入 API。

点击链接时从 **Navi 服务器** 探测 private URL，失败后尝试 public URL；服务器可达不保证浏览器网络也可达。探测受超时、缓存和并发上限约束。图标后台发现并保存在 `storage/favicons`，没有图标时使用字标，不阻塞首屏。

## 登录与部署

两项凭证均为空或省略 `auth` 时关闭认证；两项均填写时启用登录，单项配置或纯空白凭证启动失败。凭证中的 YAML 特殊字符需要引号。会话保存于内存，24 小时过期，退出或重启后失效；Cookie 使用 HttpOnly、SameSite=Strict，不在 localStorage 保存密码或令牌。

启用认证后，未登录页面跳转到 `/login`，目录、状态、SSE、图标与跳转由后端校验会话。登录页、打包静态资源和健康检查公开；健康端点只报告粗粒度状态。登录按直接连接 IP 限制一分钟五次，反向代理后的用户共享代理 IP 限额，服务不信任转发头。

远程部署使用 HTTPS 反向代理并设置 `NAVI_AUTH_SECURE_COOKIE=true`。代理应关闭 `/api/events` 缓冲，允许超过 15 秒心跳间隔的长连接，并转发原始 Host。导航 API 包含配置的内外网地址，URL 中不要放凭证；只允许可信用户编辑 YAML，因为服务器会请求其中的站点、图标和重定向目标。

## 开发与验证

```sh
npm --prefix web run dev
```

开发地址为 `http://127.0.0.1:10090`。Vite 提供固定的只读目录和预登录 fixture，不读取本地导航 YAML。验证真实登录、配置和后端协议时使用生产二进制或 `test:production`。`npm --prefix web run preview` 只预览静态构建，不提供后端 API。

默认检查顺序：

```sh
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run test
npm --prefix web run build
test -z "$(gofmt -l cmd internal web/embed.go)"
go mod verify
go test ./internal/... ./cmd/... ./web
go test -race ./internal/... ./cmd/... ./web
go vet ./internal/... ./cmd/... ./web
```

Go 的 `web/embed.go` 直接嵌入 `web/dist`，所有 Go 检查和构建前必须先生成前端。显式列出 Go 包，避免 `./...` 扫入 `node_modules` 的第三方 Go 代码。

浏览器与组件文档构建单独执行：

```sh
(cd web && npx playwright install)
npm --prefix web run storybook:test
npm --prefix web run test:e2e
npm --prefix web run test:visual
npm --prefix web run test:production
```

`storybook:test` 是 Storybook 测试模式构建，不执行浏览器交互断言。常规 E2E 使用 Vite fixture；生产集成使用真实 Go 二进制、临时目录和合成配置，三浏览器覆盖登录、跳转、热加载与故障恢复。视觉基线目前为 macOS 截图；跨操作系统首次建立基线需人工确认。完整命令、工具安装、性能检查及手工范围见 [IMPLEMENTATION.md](docs/IMPLEMENTATION.md)。

仓库未提供 CI 配置，也没有可验证的外部 CI 配置；上面的命令是本地检查入口。接入实际 CI 时直接编排原生 Go/npm 命令，先构建 Web 再编译 Go。当前通过与未执行项以 [ACCEPTANCE.md](docs/ACCEPTANCE.md) 为准。

## 发布构建

```sh
npm --prefix web run build
VERSION=${VERSION:-$(git describe --tags --exact-match HEAD 2>/dev/null || git rev-parse --short HEAD)}
COMMIT=${COMMIT:-$(git rev-parse --short HEAD)}
BUILD_TIME=${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
CGO_ENABLED=0 go build -trimpath -buildvcs=false \
  -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT} -X main.buildTime=${BUILD_TIME}" \
  -o bin/navi ./cmd/navi
./bin/navi --version
```

生成 `bin/navi`，包含前端以及版本、提交、构建时间。显式 `VERSION` 优先；否则当前提交有精确 Git tag 时使用该 tag，没有 tag 时使用当前提交的短 ID。没有显式注入时，程序也会读取 Go 内嵌的 VCS revision（或 Go 伪版本中的提交号）并回退到短 ID；只有两种构建信息都不存在时才使用 `dev`。tag 和提交信息均在构建时固化，成品二进制不依赖 `.git`。工作区未提交的修改不会由 commit 字段标识，发布前应核对实际源码范围。

## 容器

Dockerfile 从锁文件安装前端依赖、构建 `web/dist`，再编译静态 Go 二进制；运行镜像不含 Node。准备本地配置后执行：

```sh
VERSION=$(git describe --tags --exact-match HEAD 2>/dev/null || git rev-parse --short HEAD)
COMMIT=$(git rev-parse --short HEAD)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker build \
  --build-arg VERSION="$VERSION" \
  --build-arg COMMIT="$COMMIT" \
  --build-arg BUILD_TIME="$BUILD_TIME" \
  -t navi:local .
docker run --rm -p 127.0.0.1:8080:8080 \
  -v "$(pwd)/configs:/app/configs:ro" \
  -v navi-cache:/app/.cache \
  -e CONFIG_FILE=/app/configs/config.local.yaml \
  -e NAVI_SERVER_LISTEN=0.0.0.0 \
  -e NAVI_STORAGE=/app/.cache \
  navi:local
```

容器工作目录为 `/app`，以 UID/GID 65532 运行。示例把宿主机端口绑定到本机，供宿主机反向代理访问；需要远程直连时自行选择绑定地址。HTTPS 部署额外传入 `-e NAVI_AUTH_SECURE_COOKIE=true`。容器环境覆盖监听与缓存路径，无需改变本地配置；`catalog.path: ./urls.yaml` 解析为 `/app/configs/urls.yaml`。

只读挂载整个配置目录，避免编辑器原子替换时单文件挂载继续引用旧文件。配置目录须允许 UID 65532 遍历，两份 YAML 须可读；不能仅用宿主机所有者的 `0600` 文件权限而不处理容器用户访问。命名缓存 volume 使用镜像提供的所有权；已有 volume 或 bind mount 须显式保证 UID/GID 65532 可写。镜像不含 shell/curl，健康探测从容器外请求 `/health`；HTTP 200 可能是 `degraded`，必要时再读取认证后的 `/api/status`。

## 运行状态与备份

需要备份 `configs/config.local.yaml` 和 `configs/urls.yaml`，凭证文件只允许管理员与运行用户读取。自定义配置实例也放在 `configs/`，仅 `*.example.yaml` 提交。容器上下文排除整个 `configs/`，不会把本地实例打入镜像。

没有持久业务数据库或上传文件。`.cache/favicons/` 是可重建缓存，无需备份；清理缓存应停机后执行。日志输出标准输出；会话重启失效。依赖目录、构建、缓存、覆盖率和测试输出均忽略，清理时保留配置。

## 目录与文档

通用归属仅在 [目录规范.md](目录规范.md) 维护；本项目实际边界如下：

```text
cmd/navi/             程序入口
internal/             config、catalog、navigation、favicon、app 与就近 Go 测试
web/                  前端清单、工具配置、HTML 入口和 embed.go
  src/app/            应用装配、API 与全局状态
  src/layouts/        页面外壳
  src/features/       业务功能与就近测试、故事
  src/components/     跨域 UI
  src/lib/keyboard/   共享键盘逻辑
  src/styles/         主题与动效
  src/test/           单元测试初始化
  tests/fixtures/     开发与集成固定输入
  e2e/                浏览器测试、真实服务 fixture、已评审快照
  dist/               生成的静态资源
configs/              示例与本地配置
docs/                 DESIGN、UI_SPEC、IMPLEMENTATION、ACCEPTANCE
bin/                  生成的二进制
.cache/               可重建图标缓存
coverage/             Go 覆盖率报告（按需生成）
```

已完成计划和过期验收保留在 Git 历史中，不作为当前命令或结果依据。[UI_SPEC.md](docs/UI_SPEC.md) 保留界面与无障碍契约；本轮验收另行记录。

### 目录例外

| 规则 / 标准路径 | 实际路径或行为 | 原因与依据 | 适用范围 | 重新评估条件 |
| --- | --- | --- | --- | --- |
| 第 7.1 节：无配置文件时路径默认以工作目录为基准 | 缺失隐式主配置时，以预期 `configs/config.local.yaml` 所在目录解析内置路径 | `internal/config/config.go` 的既有 Load/finishConfig 协议；保持有无隐式文件时路径一致 | 根 Go 服务的默认启动 | 明确调整配置协议时 |
| 第 7.1 节：通过 `CONFIG_FILE` 显式选择配置 | 同时支持 `-f PATH` / `--config PATH`，且命令行优先 | 本项目是可执行服务；用户明确要求标准 CLI 配置标志，环境变量继续用于容器部署 | `cmd/navi` 配置选择 | 明确调整 CLI 或配置协议时 |
