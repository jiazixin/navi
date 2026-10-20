<div align="center">

# Navi

**自托管、只读的个人导航起始页 —— 一个 YAML 文件，一个二进制。**

[![CI](https://github.com/jiazixin/navi/actions/workflows/ci.yml/badge.svg)](https://github.com/jiazixin/navi/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jiazixin/navi?include_prereleases&sort=semver)](https://github.com/jiazixin/navi/releases)
[![Go](https://img.shields.io/github/go-mod/go-version/jiazixin/navi)](go.mod)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

简体中文 · [English](README.en.md)

![Navi 首页（等高线纹样、墨夜色调）](web/e2e/visual.spec.ts-snapshots/home-desktop-visual-darwin.png)

</div>

## 简介

Navi 把一份 YAML 导航目录变成一个以地图为灵感的浏览器起始页。Go 后端负责读取目录、可选登录、热加载、内外网地址选择和 favicon 缓存；React 前端在构建时嵌入同一个 Go 二进制，生产运行不需要 Node、数据库或任何外部服务。

项目类型：单个 Go 服务（`cmd/`、`internal/`）配套一个嵌入式 Web 应用（`web/`）。

## 功能

- **单文件目录**：多页、分组、标签，全部写在一个 YAML 中；修改后通过 SSE 实时推送到页面，非法修改保留最近有效目录并提示降级。
- **内外网自动选择**：同时配置 `private_url` 与 `public_url` 时，由服务器探测内网地址，可达走内网，否则直接跳转公网。
- **搜索合一**：首页搜索框同时筛选站内链接和调用外部搜索引擎；`⌘K` / `Ctrl+K` 打开快速搜索，全程可键盘操作。
- **起始页体验**：实时时钟、分区目录索引、四种色调（墨夜、宣纸、青瓷、暮色）与五种动态 Canvas 纹样（等高线、流线、扭索纹、星空、山脊），响应式布局。
- **Favicon 缓存**：后台发现并缓存站点图标，缺失时显示字标，不阻塞首屏。
- **可选登录**：用户名密码登录、HttpOnly Cookie、24 小时内存会话、按 IP 限流。
- **单一二进制**：前端随 Go 编译，支持 linux / darwin 的 amd64 / arm64，提供 distroless 容器镜像。

Navi 刻意保持只读：不提供 Web 编辑器、拖拽排序、数据库或目录写入 API，目录只由 YAML 文件维护。

## 快速开始

### 下载预编译二进制

从 [Releases](https://github.com/jiazixin/navi/releases) 下载对应平台的 `navi_<版本>_<系统>_<架构>.tar.gz`，用 `checksums.txt` 校验后解压。压缩包内含二进制、README、LICENSE 与两份示例配置：

```sh
mkdir navi && tar -xzf navi_<版本>_<系统>_<架构>.tar.gz -C navi && cd navi
cp -n configs/config.example.yaml configs/config.local.yaml
cp -n configs/urls.example.yaml configs/urls.yaml
./navi --config ./configs/config.local.yaml
```

打开 `http://127.0.0.1:8080`，健康检查位于 `/health`。

### 从源码构建

需要的运行时版本：

| 工具 | 版本来源 | 当前要求 |
| --- | --- | --- |
| Go | [go.mod](go.mod) | Go 1.27.2 或以上 |
| Node | [web/package.json](web/package.json) `engines` | 22.x（≥ 22.22.2）、24.x（≥ 24.15.0）或 26+，使用随附的 npm |

以下命令从仓库根执行，初始化命令不会覆盖已有配置：

```sh
git clone https://github.com/jiazixin/navi.git
cd navi
cp -n configs/config.example.yaml configs/config.local.yaml
cp -n configs/urls.example.yaml configs/urls.yaml
go mod download
npm --prefix web ci
npm --prefix web run build
CGO_ENABLED=0 go build -trimpath -o bin/navi ./cmd/navi
./bin/navi --config ./configs/config.local.yaml
```

`web/embed.go` 直接嵌入 `web/dist`，因此任何 Go 构建、测试或检查前都必须先执行 `npm --prefix web run build`。带版本信息的构建见[发布构建](#发布构建)。

### Docker

```sh
docker build -t navi:local .
docker run --rm -p 127.0.0.1:8080:8080 \
  -v "$(pwd)/configs:/app/configs:ro" \
  -v navi-cache:/app/.cache \
  -e CONFIG_FILE=/app/configs/config.local.yaml \
  -e NAVI_SERVER_LISTEN=0.0.0.0 \
  -e NAVI_STORAGE=/app/.cache \
  navi:local
```

注入版本信息、权限与挂载要求见[容器部署](#容器部署)。

## 配置

Navi 使用两份 YAML：主配置（服务、认证、外观等）和导航目录。完整字段、默认值和约束以 [config.example.yaml](configs/config.example.yaml) 为准；导航格式见 [urls.example.yaml](configs/urls.example.yaml) 与[数据契约](docs/DESIGN.md#导航数据)。

### 导航目录

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

- `private_url` 和 `public_url` 至少填写一个，只接受绝对 HTTP(S) 地址。
- 页顺序来自 `pages`；分组按首次出现排序，组内保持 YAML 中的相对顺序。每页必须显式写 `urls`，允许空数组。
- 文件上限 2 MiB、20 页、1000 个链接。

只有一个地址的链接直接跳转，不做探测。同时有两个地址时，由 **Navi 服务器** 探测 private URL，可达则跳 private，否则直接跳 public（不探测 public）。服务器无法验证的 TLS 证书（自签或内部 CA）仍视为可达，由浏览器自行判断信任；服务器可达不代表浏览器所在网络也可达。探测受超时、缓存和并发上限约束。

### 主配置与环境变量

- **选择配置文件**：`-f PATH` / `--config PATH` 显式选择主配置并覆盖 `CONFIG_FILE`；未传标志时可用 `CONFIG_FILE`。相对路径以进程工作目录为基准。两者都未设置时只查找 `./configs/config.local.yaml`，缺失则使用内置默认值；显式空值、文件不存在、不可读或 YAML 非法均启动失败。导航 YAML 必须存在且合法。
- **优先级**：环境变量 > 所选文件 > 内置默认值。字段映射为 `NAVI_<字段>` 或 `NAVI_<节>_<字段>`，例如 `NAVI_STORAGE=/var/cache/navi`、`NAVI_SERVER_PORT=8081`、`NAVI_CATALOG_WATCH=false`。
- **取值语义**：字符串保留原值，路径解析时去掉首尾空白，凭证精确匹配。空字符串会覆盖文件值：可用于清空可选认证，但不能清空必填路径。数字、布尔和时长必须是单个非空标量，非法值报错。时长写作 `250ms`、`3s`、`168h`，不支持 `7d`。
- **相对路径**：`storage` 和 `catalog.path`（包括环境覆盖）相对所选配置所在目录解析；没有隐式主配置时仍以预期的 `configs/` 为基准，因此默认目录为 `configs/urls.yaml`，缓存为 `.cache/`。部署时优先使用绝对路径。
- **生效方式**：主配置修改后重启生效；只有 `catalog.path` 指向的导航文件支持热加载。非法更新的具体错误见服务日志 `catalog reload failed`，修复后自动恢复。
- **外观默认值**：`theme` 可选 `default`（跟随系统：深色墨夜 / 浅色宣纸）、`ink`、`paper`、`celadon`、`dusk`；`background_pattern` 可选 `none`、`contour`、`flow`、`guilloche`、`stars`、`ridge`；`web_search` 为默认外部搜索引擎。页面右上角「外观」面板的选择保存在当前浏览器，优先于配置。

## 登录与安全

- `auth.username` 与 `auth.password` 均为空或省略 `auth` 时关闭认证；两项都填写时启用登录；只填一项或纯空白凭证会启动失败。凭证中的 YAML 特殊字符需要加引号。
- 会话保存在内存中，24 小时过期，退出或重启后失效。Cookie 使用 HttpOnly、SameSite=Strict，不在 localStorage 保存密码或令牌。
- 启用认证后，未登录页面跳转到 `/login`；目录、状态、SSE、图标与跳转接口均由后端校验会话。登录页、打包静态资源和 `/health` 公开，健康端点只报告粗粒度状态。
- 登录按直接连接 IP 限制每分钟 5 次。服务不信任转发头，反向代理后的用户共享代理 IP 的限额。
- 导航 API 会返回配置的内外网地址，不要在 URL 中放凭证；只允许可信用户编辑 YAML，因为服务器会请求其中的站点、图标和重定向目标。

### 反向代理

远程部署请放在 HTTPS 反向代理之后，并设置 `NAVI_AUTH_SECURE_COOKIE=true`。代理需要：

- 关闭 `/api/events` 的响应缓冲；
- 允许超过 15 秒心跳间隔的长连接；
- 转发原始 `Host`。

## 容器部署

Dockerfile 从锁文件安装前端依赖并构建 `web/dist`，再编译静态 Go 二进制；运行镜像基于 distroless，不含 Node、shell 或 curl。带版本信息构建并运行：

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

- 容器工作目录为 `/app`，以 UID/GID 65532 运行。示例把端口绑定到宿主机本地，供宿主机反向代理访问；需要远程直连时自行选择绑定地址。HTTPS 部署额外传入 `-e NAVI_AUTH_SECURE_COOKIE=true`。
- 环境变量覆盖监听地址与缓存路径，无需修改本地配置；`catalog.path: ./urls.yaml` 解析为 `/app/configs/urls.yaml`。
- 请只读挂载整个配置目录，避免编辑器原子替换文件后单文件挂载仍引用旧文件。配置目录须允许 UID 65532 遍历，两份 YAML 须可读；仅宿主机所有者可读的 `0600` 权限在容器内无法读取。
- 命名缓存 volume 继承镜像中的所有权；已有 volume 或 bind mount 需确保 UID/GID 65532 可写。
- 健康探测从容器外请求 `/health`。HTTP 200 也可能是 `degraded`，必要时再读取认证后的 `/api/status`。

## 数据与备份

- 需要备份的只有 `configs/config.local.yaml` 和 `configs/urls.yaml`。含凭证的配置只应允许管理员与运行用户读取。自定义配置实例也放在 `configs/`，仓库只提交 `*.example.yaml`；容器构建上下文排除整个 `configs/`，本地配置不会打入镜像。
- 没有持久业务数据库或上传文件。`.cache/favicons/` 是可重建缓存，无需备份，清理应在停机后进行。
- 日志输出到标准输出；会话在重启后失效。

## 开发

```sh
npm --prefix web run dev
```

开发服务器地址为 `http://127.0.0.1:10090`。Vite 提供固定的只读目录和已登录 fixture，不读取本地导航 YAML；验证真实登录、配置和后端协议时请使用生产二进制或 `test:production`。`npm --prefix web run preview` 只预览静态构建，不提供后端 API。

### 测试与检查

默认检查顺序（Go 检查前必须先构建前端）：

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

Go 包需要显式列出，避免 `./...` 扫入 `web/node_modules` 中的第三方 Go 代码。

浏览器测试与组件文档构建：

```sh
(cd web && npx playwright install)
npm --prefix web run storybook:test
npm --prefix web run test:e2e
npm --prefix web run test:visual
npm --prefix web run test:production
```

`storybook:test` 是 Storybook 测试模式构建，不执行浏览器交互断言。常规 E2E 使用 Vite fixture；生产集成使用真实 Go 二进制、临时目录与合成配置，在三种浏览器中覆盖登录、跳转、热加载与故障恢复。视觉基线目前为 macOS 截图，跨操作系统首次建立基线需人工确认。完整命令、工具安装、性能检查与手工检查范围见 [IMPLEMENTATION.md](docs/IMPLEMENTATION.md)。

### 持续集成

CI 使用 GitHub Actions，配置位于 [.github/workflows/](.github/workflows/)，直接调用上述原生 Go / npm 命令并先构建 Web 再编译 Go。推送 `main` 与 Pull Request 会运行：Web lint / 类型 / 单元测试 / 构建与 Storybook 构建，Go 格式 / vet / race 测试，Chromium 下的 fixture E2E 与生产集成 E2E，以及 [GoReleaser](.goreleaser.yaml) 快照构建。Firefox / WebKit 与视觉测试仍在本地执行；当前通过与未执行项以 [ACCEPTANCE.md](docs/ACCEPTANCE.md) 为准。

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

生成的 `bin/navi` 包含前端资源以及版本、提交和构建时间。显式 `VERSION` 优先；否则当前提交有精确 Git tag 时使用该 tag，没有时使用短提交 ID。未显式注入时，程序会读取 Go 内嵌的 VCS revision（或伪版本中的提交号）回退为短 ID；两者都不存在时才显示 `dev`。这些信息在构建时固化，二进制运行不依赖 `.git`；工作区未提交的修改不会体现在 commit 字段中。

推送 `vMAJOR.MINOR.PATCH`（或带 `-` 预发布后缀）tag 会触发 [release.yml](.github/workflows/release.yml)：先核对二进制报告的版本与 tag 一致，再由 GoReleaser 以相同方式注入 tag、短提交和提交时间，生成 linux / darwin 的 amd64 / arm64 压缩包与 `checksums.txt`，并发布 GitHub Release。本地可用 `goreleaser release --snapshot --clean` 预览，产物位于被忽略的 `bin/release/`。

## 项目结构

通用目录归属只在 [目录规范.md](目录规范.md) 中维护；本项目实际结构如下：

```text
cmd/navi/             程序入口
internal/             config、catalog、navigation、favicon、app 与就近 Go 测试
web/                  前端清单、工具配置、HTML 入口和 embed.go
  src/app/            应用装配、API 与全局状态
  src/layouts/        页面外壳
  src/features/       业务功能与就近测试、故事
  src/components/     跨域 UI
  src/lib/            共享键盘、存储与 URL 能力
  src/styles/         色调、字体与共享关键帧
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

文档：[设计与协议](docs/DESIGN.md) · [界面规范](docs/UI_SPEC.md) · [开发与验证](docs/IMPLEMENTATION.md) · [本轮验收](docs/ACCEPTANCE.md)。已完成的计划与过期验收保留在 Git 历史中，不作为当前依据。

### 目录例外

| 规则 / 标准路径 | 实际路径或行为 | 原因与依据 | 适用范围 | 重新评估条件 |
| --- | --- | --- | --- | --- |
| 第 7.1 节：无配置文件时路径默认以工作目录为基准 | 缺失隐式主配置时，以预期 `configs/config.local.yaml` 所在目录解析内置路径 | `internal/config/config.go` 的既有 Load/finishConfig 协议；保持有无隐式文件时路径一致 | 根 Go 服务的默认启动 | 明确调整配置协议时 |
| 第 7.1 节：通过 `CONFIG_FILE` 显式选择配置 | 同时支持 `-f PATH` / `--config PATH`，且命令行优先 | 本项目是可执行服务；用户明确要求标准 CLI 配置标志，环境变量继续用于容器部署 | `cmd/navi` 配置选择 | 明确调整 CLI 或配置协议时 |

## 参与贡献

欢迎提交 Issue 和 Pull Request。提交前请：

1. 阅读 [目录规范.md](目录规范.md) 与 [AGENTS.md](AGENTS.md)，按既有目录归属放置文件；
2. 在本地通过[测试与检查](#测试与检查)中的默认检查；
3. 涉及界面变更时同步更新视觉基线，并在 PR 中说明。

## 许可证

Navi 基于 [Apache License 2.0](LICENSE) 开源。
