<div align="center">

# Navi

**自托管、只读的个人导航起始页 —— 一个 YAML 文件，一个二进制。**

[![CI](https://github.com/jiazixin/navi/actions/workflows/ci.yml/badge.svg)](https://github.com/jiazixin/navi/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jiazixin/navi?include_prereleases&sort=semver)](https://github.com/jiazixin/navi/releases)
[![Go](https://img.shields.io/github/go-mod/go-version/jiazixin/navi)](go.mod)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

简体中文 · [English](README.en.md)

![Navi 首页（等高线纹样、墨夜色调）](web/e2e/visual.spec.ts-snapshots/home-desktop-visual-linux.png)

</div>

## 简介

Navi 把一份 YAML 导航目录变成一个以地图为灵感的浏览器起始页。Go 后端负责读取目录、可选登录、热加载、内外网地址选择和 favicon 缓存；React 前端在构建时嵌入同一个 Go 二进制，生产运行不需要 Node、数据库或任何外部服务。

项目类型：单个 Go 服务（`cmd/`、`internal/`）配套一个嵌入式 Web 应用（`web/`）。当前尚未上线，接口与目录调整直接同步前后端，不维护旧入口、旧协议或旧缓存格式的适配。

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

打开 `http://127.0.0.1:8080`，健康检查位于 `/healthz`（返回 `{"status":"ok"}`），版本与能力位于 `/api/info`。

### 从源码构建

需要的运行时版本：

| 工具 | 版本来源 | 当前要求 |
| --- | --- | --- |
| Go | [go.mod](go.mod) | Go 1.27.3 或以上 |
| Node | [web/package.json](web/package.json) `engines` | 22.x（≥ 22.23.4）、24.x（≥ 24.22.1）或 26.x（≥ 26.12.1），使用随附的 npm |

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
  -e NAVI_SERVER__LISTEN=0.0.0.0 \
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

```sh
./navi -c ./configs/config.local.yaml
./navi --config ./configs/config.local.yaml
./navi -h          # 或 --help：显示帮助
./navi --version   # 显示版本与提交，如 navi v1.2.0 (revision=0123456789ab)
```

`-c` / `--config` 也支持 `=PATH` 写法；多次给出时必须是同一路径，否则为参数错误 `different files given for -c/--config: "a" and "b"`。帮助（英文）与版本信息输出到 stdout，不读取环境变量与配置，也不启动服务。退出码：0 成功（含收到 SIGINT / SIGTERM 后正常关闭），2 参数错误，1 配置、启动或运行失败。参数错误写入 stderr：`navi: <错误>`，下一行 `Run 'navi --help' for usage.`；日志器就绪前的配置失败（选择、读取、解析、校验）以一行英文 `navi: config: <错误>` 写入 stderr，例如 `navi: config: CONFIG_FILE is set but empty`、`navi: config: /abs/config.yaml: server.port: must be between 1 and 65535`；日志器就绪后的失败只记录为 `service_failed` 日志事件，不再写 stderr。服务日志依次记录 `service_starting`、`service_listening`（含 `listen`）、`service_stopping`、`service_stopped`；第一次信号开始正常关闭，第二次信号立即终止进程。

- **选择配置文件**：`-c PATH` / `--config PATH` 显式选择主配置并覆盖 `CONFIG_FILE`；未传标志时可用 `CONFIG_FILE`。相对路径以进程工作目录为基准。两者都未设置时只查找 `./configs/config.local.yaml`，缺失则使用内置默认值；`CONFIG_FILE` 已设置但为空或全空白（`CONFIG_FILE is set but empty`）、显式选择的文件不存在、不可读或 YAML 非法均启动失败。配置错误为英文并带字段路径，如 `server.port: must be between 1 and 65535`。导航 YAML 必须存在且合法。
- **优先级**：环境变量 > 所选文件 > 内置默认值。字段映射为 `NAVI_<字段>` 或 `NAVI_<节>__<字段>`（层级之间用 `__`，键名内部保留 `_`），例如 `NAVI_STORAGE=/var/cache/navi`、`NAVI_SERVER__PORT=8081`、`NAVI_CATALOG__WATCH=false`、`NAVI_FAVICON__FETCH_TIMEOUT=5s`。
- **取值语义**：字符串保留原值，路径解析时去掉首尾空白，凭证精确匹配。空字符串会覆盖文件值：可用于清空可选认证，但不能清空必填路径。数字、布尔和时长必须是单个非空标量，非法值报错。时长写作 `250ms`、`3s`、`168h`，不支持 `7d`。
- **相对路径**：内置默认值始终以进程工作目录为基准：导航目录为 `configs/urls.yaml`，缓存为 `.cache/`，即使加载了主配置但省略对应字段也如此。文件中显式填写的相对路径以该配置文件所在目录为基准。环境覆盖有实际配置文件时沿用配置目录；隐式主配置缺失时按工作目录解析，不查找旧位置。部署时优先使用绝对路径。
- **生效方式**：主配置修改后重启生效；只有 `catalog.path` 指向的导航文件支持热加载。非法更新的具体错误见服务日志 `catalog_reload_failed`，修复后自动恢复。
- **外观默认值**：`theme` 可选 `default`（跟随系统：深色墨夜 / 浅色宣纸）、`ink`、`paper`、`celadon`、`dusk`；`background_pattern` 可选 `none`、`contour`、`flow`、`guilloche`、`stars`、`ridge`；`web_search` 为默认外部搜索引擎。页面右上角「外观」面板的选择保存在当前浏览器，优先于配置。

## 登录与安全

- `auth.username` 与 `auth.password_hash` 均为空或省略 `auth` 时关闭认证；两项都填写时启用登录；只填一项、空白用户名或无效哈希会启动失败。哈希必须为 bcrypt，cost 为 10–14（推荐 12）；明文密码不保存到服务端配置。
- 会话仅保存令牌 SHA-256 摘要，位于内存中，24 小时过期，退出或重启后失效。Cookie 使用 HttpOnly、SameSite=Strict，不在 localStorage 保存密码或令牌。
- 启用认证后，未登录页面跳转到 `/login`；目录、状态、SSE、图标与跳转接口均由后端校验会话。登录页、打包静态资源和 `/healthz` 公开，健康端点只报告粗粒度状态。
- 登录按直接连接 IP 限制每分钟 5 次。服务不信任转发头，反向代理后的用户共享代理 IP 的限额。
- 导航 API 会返回配置的内外网地址，不要在 URL 中放凭证；只允许可信用户编辑 YAML，因为服务器会请求其中的站点、图标和重定向目标。

### 设置登录密码

服务端仅接受 `auth.password_hash` / `NAVI_AUTH__PASSWORD_HASH`。明文配置会被拒绝，避免错误配置静默关闭认证；这不是旧配置支持。登录 API 提交 `username/password`。安装 Apache `htpasswd` 后执行 `htpasswd -nB -C 12 navi`，交互输入密码，将输出冒号后的完整哈希写入配置（建议单引号包裹）。不要使用把密码放进进程参数的 `-b`。bcrypt 密码最多 72 UTF-8 字节。

主配置上限 1 MiB；浏览器 JSON 响应上限 8 MiB，拒绝重定向。配置实例仅应允许管理员与服务进程读取。

### 反向代理

远程部署请放在 HTTPS 反向代理之后，并设置 `NAVI_AUTH__SECURE_COOKIE=true`。代理需要：

- 关闭 `/api/events` 的响应缓冲；
- 允许超过 15 秒心跳间隔的长连接；
- 转发原始 `Host`。

## 容器部署

Dockerfile 从锁文件安装前端依赖并构建 `web/dist`，再编译静态 Go 二进制；运行镜像基于 distroless，不含 Node、shell 或 curl。带版本信息构建并运行：

```sh
npm --prefix web run build
CGO_ENABLED=0 go build -trimpath -o bin/navi ./cmd/navi
VERSION=$(./bin/navi --version | cut -d ' ' -f 2)
docker build \
  --build-arg VERSION="$VERSION" \
  -t navi:local .
docker run --rm -p 127.0.0.1:8080:8080 \
  -v "$(pwd)/configs:/app/configs:ro" \
  -v navi-cache:/app/.cache \
  -e CONFIG_FILE=/app/configs/config.local.yaml \
  -e NAVI_SERVER__LISTEN=0.0.0.0 \
  -e NAVI_STORAGE=/app/.cache \
  navi:local
```

- 构建上下文不含 `.git`，版本只来自 `VERSION` 构建参数（注入 `main.version`，未传时为 `dev`），镜像内不带提交和构建时间。
- 容器工作目录为 `/app`，以 UID/GID 65532 运行。示例把端口绑定到宿主机本地，供宿主机反向代理访问；需要远程直连时自行选择绑定地址。HTTPS 部署额外传入 `-e NAVI_AUTH__SECURE_COOKIE=true`。
- 环境变量覆盖监听地址与缓存路径，无需修改本地配置；`catalog.path: ./urls.yaml` 解析为 `/app/configs/urls.yaml`。
- 请只读挂载整个配置目录，避免编辑器原子替换文件后单文件挂载仍引用旧文件。配置目录须允许 UID 65532 遍历，两份 YAML 须可读；仅宿主机所有者可读的 `0600` 权限在容器内无法读取。
- 命名缓存 volume 继承镜像中的所有权；已有 volume 或 bind mount 需确保 UID/GID 65532 可写。
- 健康探测从容器外请求 `/healthz`。降级时它仍返回 200，原因只在认证后的 `/api/status` 中。

## 数据与备份

- 需要备份的只有 `configs/config.local.yaml` 和 `configs/urls.yaml`。含凭证的配置只应允许管理员与运行用户读取。自定义配置实例也放在 `configs/`，仓库只提交 `*.example.yaml`；容器构建上下文排除整个 `configs/`，本地配置不会打入镜像。
- 没有持久业务数据库或上传文件。`.cache/favicons/` 是可重建缓存，无需备份，清理应在停机后进行。
- 日志输出到标准输出；会话在重启后失效。
- 缓存时间戳只接受 UTC、三位毫秒（如 `2026-10-27T08:15:30.000Z`）；格式不符的派生缓存跳过并重新下载，不执行旧格式迁移。
- 启动日志中的 `config_source`、`storage` 和重载失败日志中的 `path` 仅用于定位配置与存储问题；不记录配置内容或凭证。

## 开发

```sh
npm --prefix web run dev
```

开发服务器地址为 `http://127.0.0.1:10090`。Vite 提供固定的只读目录和已登录 fixture，不读取本地导航 YAML；验证真实登录、配置和后端协议时请使用生产二进制或 `test:production`。`npm --prefix web run preview` 只预览静态构建，不提供后端 API。

### 测试与检查

默认检查顺序（Go 检查前必须先构建前端）：

```sh
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
```

`go.mod` 使用 `ignore ./web/node_modules`，Go 检查可直接使用 `./...` 覆盖全部应用包。

浏览器测试与组件文档构建：

```sh
(cd web && npx playwright install)
npm --prefix web run storybook:test
npm --prefix web run test:e2e
npm --prefix web run test:visual
npm --prefix web run test:production
```

`storybook:test` 是 Storybook 测试模式构建，不执行浏览器交互断言。常规 E2E 使用 Vite fixture；生产集成使用真实 Go 二进制、临时目录与合成配置，在三种浏览器中覆盖登录、跳转、热加载与故障恢复。视觉基线统一在与 CI 相同的 Linux ARM64 Playwright 容器中生成和验证，更新时需审阅截图。完整命令、工具安装、性能检查与手工检查范围见 [IMPLEMENTATION.md](docs/IMPLEMENTATION.md)。

### 持续集成

CI 使用 GitHub Actions，配置位于 [.github/workflows/](.github/workflows/)，直接调用上述原生 Go / npm 命令并先构建 Web 再编译 Go。推送 `main` 与 Pull Request 会运行：Web lint / 类型 / 单元测试 / 构建与 Storybook 构建，Go 格式 / vet / race 测试，Chromium 下的 fixture E2E 与生产集成 E2E，以及 [GoReleaser](.goreleaser.yaml) 快照构建。Firefox / WebKit 在本地验证，视觉回归在独立 Linux 容器 CI job 中执行；当前通过与未执行项以 [ACCEPTANCE.md](docs/ACCEPTANCE.md) 为准。

## 发布构建

```sh
npm --prefix web run build
CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o bin/navi ./cmd/navi
./bin/navi --version
```

生成的 `bin/navi` 包含前端资源，以及 Go 从 git 嵌入的版本、提交和提交时间，二进制运行不依赖 `.git`。版本依次取：非空且不为 `dev` 的 `-ldflags "-X main.version=..."`、Go 内嵌的模块版本（当前提交的 tag 或伪版本）、12 位提交号、`dev`。`--version` 输出形如 `navi v1.2.0 (revision=0123456789ab)`；伪版本已含提交号，不再附 revision；工作区有未提交修改时附加 `modified`。启动日志 `service_starting` 的 `version`（与 `--version` 相同格式）、`commit`、`build_time` 字段取自同一信息（`build_time` 为提交时间）。

推送 `vMAJOR.MINOR.PATCH`（或带 `-` 预发布后缀）tag 会触发 [release.yml](.github/workflows/release.yml)：先核对 `--version` 输出恰为 `navi $TAG (revision=<12 位提交号>)`，再由 GoReleaser 以相同方式构建（不注入任何值，由 Go 从 git 嵌入 tag、提交和提交时间），生成 linux / darwin 的 amd64 / arm64 压缩包与 `checksums.txt`，并发布 GitHub Release。本地可用 `goreleaser release --snapshot --clean` 预览，产物位于被忽略的 `bin/release/`。

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

文档：[设计与协议](docs/DESIGN.md) · [接口错误与状态代码](docs/API.md) · [界面规范](docs/UI_SPEC.md) · [开发与验证](docs/IMPLEMENTATION.md) · [本轮验收](docs/ACCEPTANCE.md)。历史计划已明确标记，过期验收可从 Git 历史追溯，均不作为当前依据。

### 目录例外

无。CLI 的 `-c` / `--config` 与 `CONFIG_FILE` 优先级直接遵循 Go 规范第 10.6 节。已消除的项目例外与规范自身的特殊要求见[逐项复核](docs/STANDARDS_AUDIT.md#例外逐项处理)。

## 参与贡献

欢迎提交 Issue 和 Pull Request。提交前请：

1. 阅读 [目录规范.md](目录规范.md) 与 [AGENTS.md](AGENTS.md)，按既有目录归属放置文件；
2. 在本地通过[测试与检查](#测试与检查)中的默认检查；
3. 涉及界面变更时同步更新视觉基线，并在 PR 中说明。

## 许可证

Navi 基于 [Apache License 2.0](LICENSE) 开源。

规范复核与本轮改动范围见 [STANDARDS_AUDIT.md](docs/STANDARDS_AUDIT.md)。
