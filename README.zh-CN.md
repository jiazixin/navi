# Navi

Navi 是一个文档优先的个人导航系统。它只有一个核心目标：用优秀、克制、自然的 UI/UX，
把人类易读的 YAML 导航目录渲染成适合每天使用的高品质界面。

Go 后端读取 `urls.yaml`，提供只读目录、合法配置热加载和内外网链接选择；React 前端
嵌入 Go 二进制，重点实现快速搜索、响应式布局、可访问性和有高级质感的黑白界面。

> Go 后端加载真实 YAML、监听目录热更新、缓存 favicon 并提供链接跳转；生产前端嵌入二进制。
> 当前验证方式和已知限制见 [开发与验证](docs/IMPLEMENTATION.md)。

[English README](README.md)


## 项目目录与首次运行

通用约定见 [项目目录规范](目录规范.md)。本项目使用以下布局：

```text
cmd/navi/       Go 程序入口
internal/       后端业务与配置加载代码（测试就近放置）
web/            前端源码、工具配置、测试和 Go 嵌入入口
  src/app/      API、应用装配与全局状态
  src/layouts/  应用外壳
  src/features/ 业务组件与逻辑
  src/components/ 跨域复用 UI
  src/styles/   全局样式与动效变量
  src/test/     单元测试初始化
  tests/        共享 fixture 与契约测试
  e2e/          浏览器测试、真实服务 fixture 与快照
  dist/         生成的静态资源，不提交
configs/        运行配置及导航 YAML；只提交 example 文件
bin/            生成的可执行文件，不提交
.cache/         本地图标缓存，不提交
docs/          设计、开发说明和计划
```

从仓库根目录执行一次配置初始化；已有文件不会覆盖：

```sh
cp -n configs/config.example.yaml configs/config.local.yaml
cp -n configs/urls.example.yaml configs/urls.yaml
```

所有根命令从仓库根执行。`CONFIG_FILE` 显式选择配置，相对路径以进程工作目录为基准，部署使用绝对路径。未设置时仅查找 `configs/config.local.yaml`，文件不存在时使用内置默认值；显式空路径或不存在的文件报错。导航 YAML 仍需准备。配置内相对路径以配置所在目录为基准，默认 `storage: ../.cache` 将图标缓存放在应用根目录。

## 产品契约

- `urls.yaml` 是导航内容、分组和顺序的唯一事实来源。
- 提供可选账号密码登录；导航内容仍只读，不提供数据库、拖拽排序、Web 编辑器或目录写入 API。
- 页面严格按 YAML 顺序渲染；分组顺序由该分组第一次出现的位置决定。
- 优先访问 private URL；内网地址不可达时自动回退 public URL。
- 合法 YAML 修改会热加载，并自动通知已打开的页面刷新内容。
- 自动发现站点 favicon，并缓存到主配置指定的 `storage`。
- 首屏提供开放式搜索工作台，可进入百度、Google、Yandex、Bing 国际版、GitHub、ChatGPT、
  Claude 和 Gemini；入口收纳在可伸缩椭圆与图标菜单中。桌面指针经过后椭圆保持展开 8 秒再
  自动收回，避免快速划过产生闪动，同时保留第一导航分组预览；搜索区不使用角色挂件或随机
  装饰动画。
- 默认 UI 使用克制的黑、白和中性灰；可选撞色主题仍保留安静画布，只把颜色用于分组刻度、
  图标、焦点、选中和 hover 等低面积反馈。
- 首次进入、卡片反馈、搜索重排、favicon 到达、热更新和主题切换使用统一自然动效。
- 动效跟随浏览器和显示器的原生刷新率，包括 165Hz，不设置 60fps 或其他人为最高帧率。
- 八套实际背景纹样默认运行各自的确定性环境动效：经纬校准、星体公转、双鱼对游、弓箭掠过、
  回纹流动、玫瑰窗反转、八芒晶格迁移与左下星轨长曝光流动；不提供静止配置，系统 reduced
  motion 下自动停止。
- 生产代码遵循明确的命名、package 所有权、严格类型、生命周期和零弃用 API 规范。
- 响应式覆盖手机、平板、桌面、超宽屏、横竖屏、缩放、高 DPI、触控和键鼠场景。
- 共享组件具备固定几何契约、Storybook 状态覆盖、跨浏览器视觉测试和自动错位断言。

## 主配置

配置优先级为环境变量 > 所选配置文件 > 内置默认值。`CONFIG_FILE=/绝对路径/config.local.yaml` 选择文件；字段使用 `NAVI_<字段>` 或 `NAVI_<节>_<字段>` 覆盖，如 `NAVI_SERVER_PORT=8081`、`NAVI_CATALOG_WATCH=false`、`NAVI_FAVICON_FETCH_TIMEOUT=3s`。字符串保留原值，数字、布尔值和时长经过校验。配置内的相对路径以所选文件目录为基准，默认基准为 `configs/`。

```yaml
auth:
  username: ""
  password: ""
  secure_cookie: false

storage: ../.cache

# 可选主题：default（默认）、navy-blossom（绀樱夜）、mint-tide（薄荷汐）、
# moss-court（苔庭青）、tea-mist（茶雾青）、amber-tide（琥珀潮）、
# sunny-coast（晴海橙）、violet-lime（藤萝青）。
theme: default

# 可选背景纹样：none（素幕）、meridian-grid（经纬阵）、orbital-rings（天游环）、
# pisces（双鱼宫）、sagittarius（天弓宫）、roman-meander（回廊纹）、
# rose-window（玫瑰窗）、eight-point-star（八芒阵）、star-trails（星轨幕）。
background_pattern: meridian-grid

# 可选默认搜索入口：baidu、google、yandex、bing、github、chatgpt、claude、gemini。
web_search: baidu

server:
  # Use 0.0.0.0 in a container or when a reverse proxy connects remotely.
  listen: 127.0.0.1
  port: 8080
  read_header_timeout: 5s
  read_timeout: 20s
  write_timeout: 30s
  idle_timeout: 90s
  shutdown_timeout: 10s

health:
  uri: /health

logging:
  # Supported levels: debug, info, warn, error.
  level: info
  # Supported formats: json, logfmt.
  format: json
  access_log: true
  log_health_checks: false

catalog:
  path: ./urls.yaml
  watch: true
  reload_debounce: 250ms

navigation:
  private_probe_timeout: 800ms
  public_probe_timeout: 1200ms
  probe_cache_ttl: 30s
  max_concurrent_probes: 32

favicon:
  fetch_timeout: 3s
  refresh_interval: 168h
  max_file_bytes: 1048576
  workers: 4
```

## 导航配置

```yaml
version: 1

pages:
  - id: page1
    title: 我的导航
    subtitle: 工作、服务与常用资源
    urls:
      - name: Grafana
        group: 基础设施
        description: Metrics and dashboards
        private_url: http://grafana.lan:3000
        public_url: https://grafana.example.com
        tags: [monitoring, metrics]

  - id: page2
    title: 阅读与灵感
    urls:
      - name: Are.na
        group: 灵感
        public_url: https://www.are.na
        tags: [research]
```

`private_url` 和 `public_url` 至少填写一个，只接受 HTTP 和 HTTPS 地址。
`pages` 数组顺序就是分页顺序，每页的 `urls` 数组保持链接顺序；程序不会重新排序或回写。
页面底部使用图标分页控件切换页面。

Navi 会先解析目标页面的 `link rel="icon"` 声明，找不到时尝试站点根目录的
`/favicon.ico`。校验通过的图标保存到 `.cache/favicons` 并由 Navi 本地提供。
该目录只是可删除、可重建的派生缓存，不保存第二份导航数据。

## 文档

- [设计与协议](docs/DESIGN.md)：配置、数据模型、API、生命周期和部署边界。
- [UI 规范](docs/UI_SPEC.md)：视觉与交互约定。
- [开发与验证](docs/IMPLEMENTATION.md)：检查命令、发布核对和已知限制。

行为变更只更新受影响的契约和回归测试。已完成的计划及旧验证记录保留在 Git 历史中。

## 登录认证

`config.local.yaml` 中 `auth.username` 和 `auth.password` 都为空（或省略 `auth`）时，直接进入首页，不显示退出登录按钮。两者都指定时启用登录；只填写一项会启动报错。凭证按原值精确匹配，不允许纯空白值，包含 YAML 特殊字符时请加引号。示例默认留空，需要认证时填入自己的账号密码。修改后重启生效。

启用认证后，未登录访问跳转到 `/login`，登录成功进入首页。目录、状态、事件、图标 API 和 `/go/` 跳转均由服务端校验会话；顶栏提供退出登录。会话有效期为 24 小时，退出或重启后失效，使用 HttpOnly、SameSite=Strict Cookie，不在 localStorage 保存密码或令牌。已打开页面每 30 秒及重新聚焦时检查会话。

同一直接连接 IP 每分钟最多尝试五次登录，成功后清零；反向代理后的用户共享该代理 IP 限额。HTTPS 代理部署须设置 `auth.secure_cookie: true`，服务端不信任转发头。登录页、打包静态资源和配置的健康检查端点公开，健康端点仅返回粗粒度状态。

## 前端开发

```bash
npm --prefix web ci
npm --prefix web run dev
```

前端生产构建与完整门禁：

```bash
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run test
npm --prefix web run build
npm --prefix web run storybook:test
npm --prefix web run test:visual
npm --prefix web run test:e2e
npm --prefix web run test:production
```

当前开发服务器使用 `web/vite.config.ts` 中的确定性只读 fixture 和预登录会话模拟后端协议，真实登录由 `test:production` 验证；它只用于前端
开发与验收，不是第二份导航数据源，也不会进入生产构建。

## 单二进制构建

```bash
npm --prefix web run build
VERSION=${VERSION:-dev}
COMMIT=${COMMIT:-$(git rev-parse --short HEAD)}
BUILD_TIME=${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
CGO_ENABLED=0 go build -trimpath -buildvcs=false \
  -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT} -X main.buildTime=${BUILD_TIME}" \
  -o bin/navi ./cmd/navi
CONFIG_FILE=./configs/config.local.yaml ./bin/navi
./bin/navi --version
```

以上命令会构建前端、嵌入产物并生成 `bin/navi`，同时注入版本、提交与构建时间。生产运行不需要
Node；Node 只用于生成嵌入二进制的前端静态产物。

## 容器构建

先准备 `configs` 目录，放入 `config.local.yaml` 和 `urls.yaml`。配置设置 `server.listen: 0.0.0.0`、`catalog.path: ./urls.yaml`、`storage: /app/.cache`。挂载目录可让编辑器原子替换文件后热加载继续生效。

```bash
docker build -t navi:local .
docker run --rm -p 8080:8080 \
  -v "$(pwd)/configs:/app/configs:ro" \
  -v navi-cache:/app/.cache \
  -e CONFIG_FILE=/app/configs/config.local.yaml \
  navi:local
```

容器以非 root 用户运行。`config.local.yaml` 和 `urls.yaml` 应以只读方式挂载，`storage` 使用独立的可写
volume；容器中的挂载配置应设置 `storage: /app/.cache`。

## 部署提醒

Navi 在 `auth` 账号密码均配置时启用认证；两者为空时允许公开访问。示例默认监听 `127.0.0.1`，容器可配置 `0.0.0.0`。远程访问应使用 HTTPS 反向代理，并设置 `auth.secure_cookie: true`。请限制配置文件读取权限，不要在目标 URL 中保存凭证。

## 开发命令与运行状态

CI/CD 直接调用 Go 和 npm 命令；完整检查顺序见[开发与验证](docs/IMPLEMENTATION.md)。

```sh
go mod download
npm --prefix web ci
npm --prefix web run dev

npm --prefix web run build
go run ./cmd/navi
```

浏览器测试前执行 `cd web && npx playwright install`。直接运行 Go 编译器前先执行 `npm --prefix web run build`。Storybook 检查为 `npm --prefix web run storybook:test`。额外审计可执行 `staticcheck ./internal/... ./cmd/... ./web`、`govulncheck ./internal/... ./cmd/... ./web` 和 `npm --prefix web audit --omit=dev`。

项目没有持久业务数据库或上传文件。需要备份 `configs/config.local.yaml` 与 `configs/urls.yaml`，并限制凭证文件读取权限。`.cache/favicons/` 可重建，无需备份；容器 `/app/.cache` 挂载须允许 UID 65532 写入。会话保存在内存中，重启失效。不创建空 `data/`。清理时仅删除生成物，保留配置和运行数据。
