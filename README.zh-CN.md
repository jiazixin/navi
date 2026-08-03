# Navi

Navi 是一个文档优先的个人导航系统。它只有一个核心目标：用优秀、克制、自然的 UI/UX，
把人类易读的 YAML 导航目录渲染成适合每天使用的高品质界面。

Go 后端读取 `urls.yaml`，提供只读目录、合法配置热加载和内外网链接选择；React 前端
嵌入 Go 二进制，重点实现快速搜索、响应式布局、可访问性和有高级质感的黑白界面。

> 项目状态：`0.1` 前端里程碑已经完成。Go 后端现已加载真实 YAML、监听合法热更新、缓存可重建
> favicon、解析 private/public 链接、提供只读 API，并将生产前端嵌入 `navi` 二进制。

[English README](README.md)

## 产品契约

- `urls.yaml` 是导航内容、分组和顺序的唯一事实来源。
- 不提供登录、数据库、拖拽排序、Web 编辑器或写入 API。
- 页面严格按 YAML 顺序渲染；分组顺序由该分组第一次出现的位置决定。
- 优先访问 private URL；内网地址不可达时自动回退 public URL。
- 合法 YAML 修改会热加载，并自动通知已打开的页面刷新内容。
- 自动发现站点 favicon，并缓存到主配置指定的 `datadir`。
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

主配置选择优先级：

1. `-f /path/to/config.yaml`
2. 小写环境变量 `configpath`
3. `./config.yaml`

主配置中的相对路径以主配置文件所在目录为基准。

```yaml
datadir: ./data

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
`/favicon.ico`。校验通过的图标保存到 `datadir/favicons` 并由 Navi 本地提供。
该目录只是可删除、可重建的派生缓存，不保存第二份导航数据。

## 文档

- [设计文档](docs/DESIGN.md)：产品行为、架构、配置、接口和 UI 规范。
- [UI 组件规范](docs/UI_SPEC.md)：组件几何、响应式行为、视口矩阵、视觉回归和布局断言。
- [代码规范](docs/CODING_STANDARDS.md)：生产级命名、组织、错误处理、依赖和弃用门禁。
- [实施文档](docs/IMPLEMENTATION.md)：按顺序执行、测试先行的实现计划。
- [验收文档](docs/ACCEPTANCE.md)：可复现的功能、UI、性能和安全门禁。
- [变更文档](docs/CHANGELOG.md)：实时记录需求与设计决定。

后续实现必须以这些文档为依据。任何行为变化都必须在同一次修改中更新变更文档和所有
受影响文档。

UI/UX 与生产级工程质量都拥有发布否决权。功能全部正确，但体验仍显粗糙，或代码使用
弃用、弱类型、所有权不清或无界行为时，项目不能声明完成。

任何支持场景出现溢出、重叠、裁切、上下间距不一致或组件 geometry 不一致，也会阻止发布。

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
```

当前开发服务器使用 `web/vite.config.ts` 中的确定性只读 fixture 模拟后端协议；它只用于前端
开发与验收，不是第二份导航数据源，也不会进入生产构建。

## 单二进制构建

```bash
make verify
make build
./navi -f ./config.yaml
./navi --version
```

`make build` 会构建前端、嵌入产物并生成 `navi`，同时注入版本、提交与构建时间。生产运行不需要
Node；Node 只用于生成嵌入二进制的前端静态产物。

## 容器构建

```bash
docker build -t navi:local .
docker run --rm -p 8080:8080 \
  -v "$(pwd)/config.yaml:/app/config.yaml:ro" \
  -v "$(pwd)/urls.yaml:/app/urls.yaml:ro" \
  -v navi-data:/data \
  navi:local -f /app/config.yaml
```

容器以非 root 用户运行。`config.yaml` 和 `urls.yaml` 应以只读方式挂载，`datadir` 使用独立的可写
volume；容器中的挂载配置应设置 `datadir: /data`。

## 部署提醒

示例默认监听 `127.0.0.1`，因为 Navi 不内置身份认证。若监听 `0.0.0.0`，
必须通过网络 ACL 或带认证的反向代理限制访问范围。
