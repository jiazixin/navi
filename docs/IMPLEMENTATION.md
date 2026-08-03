# Navi 实施文档

> 执行规则：必须按任务顺序实施；每个任务先写测试，再实现，再运行验证。实现行为若与
> `docs/DESIGN.md`、`docs/UI_SPEC.md`、`docs/CODING_STANDARDS.md` 或
> `docs/ACCEPTANCE.md` 不一致，先更新设计与变更文档，不得用代码默默改变契约。

**目标：** 构建一个 Go 单二进制、只读渲染 `urls.yaml`、以 UI/UX 为唯一核心目标并支持
内外网自动选择的个人导航系统。

**架构：** Go 负责配置、YAML 快照、热加载、链接探测、只读 API 和静态资源；React
负责高品质响应式界面。`urls.yaml` 是唯一持久化事实来源，不存在数据库和写入接口。

**技术栈：** Go、`net/http`、`gopkg.in/yaml.v3`、`golang.org/x/net/html`、
`fsnotify`、React、TypeScript、Vite、TanStack Query、Motion for React、
Lucide React、Storybook、Vitest、Playwright。

## 1. 目标目录结构

```text
.
├── cmd/navi/main.go
├── internal/
│   ├── app/app.go
│   ├── catalog/loader.go
│   ├── catalog/model.go
│   ├── catalog/store.go
│   ├── catalog/watcher.go
│   ├── config/config.go
│   ├── favicon/discovery.go
│   ├── favicon/manager.go
│   ├── favicon/store.go
│   ├── httpapi/handlers.go
│   ├── httpapi/middleware.go
│   ├── httpapi/server.go
│   ├── navigation/probe.go
│   └── navigation/resolver.go
├── web/
│   ├── .storybook/
│   ├── src/
│   │   ├── app/
│   │   ├── features/
│   │   │   ├── catalog/
│   │   │   ├── navigation/
│   │   │   ├── search/
│   │   │   ├── status/
│   │   │   └── theme/
│   │   ├── motion/
│   │   ├── shared/
│   │   │   ├── api/
│   │   │   ├── lib/
│   │   │   └── ui/
│   │   ├── styles/
│   │   └── main.tsx
│   ├── tests/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── ui/
│   ├── dist/
│   └── embed.go
├── testdata/
├── config.example.yaml
├── urls.example.yaml
├── go.mod
├── go.sum
├── .editorconfig
├── .gitignore
├── Makefile
├── README.md
└── README.zh-CN.md
```

生成目录 `ui/dist` 只由前端构建命令写入。源代码不得依赖开发机上的绝对路径。

## 2. 实施阶段

### Task 1：初始化 Go 与前端工程

**创建：** `go.mod`、`cmd/navi/main.go`、`web/package.json`、
`web/package-lock.json`、`web/tsconfig.json`、`web/eslint.config.js`、
`web/vite.config.ts`、`.editorconfig`、`.gitignore`、`Makefile`。

步骤：

1. 初始化 Go module，并只添加设计文档列出的后端依赖。
2. 初始化 React + TypeScript + Vite。
3. 增加 `make test`、`make build-ui`、`make build`、`make lint` 命令。
4. 启用 TypeScript strict、React Hooks、no-deprecated 和 no-explicit-any。
5. 初始化 Storybook，并使用与正式应用相同的 theme、font、motion 和 CSS token。
6. 固定 Go toolchain、Go 工具、Go 依赖和 npm lockfile。
7. 添加最小 Go、前端和 Storybook 冒烟测试。
8. 运行 `go test ./...`、Staticcheck、typecheck 和前端测试，预期均通过。

完成标准：空目录配置下程序能编译，前端能生成确定性的生产构建。

### Task 2：实现主配置加载

**创建：** `internal/config/config.go`、`internal/config/config_test.go`、
`config.example.yaml`。

测试先覆盖：

- `-f` 高于 `configpath`，环境变量高于默认路径。
- 相对 `catalog.path` 和 `datadir` 以主配置目录为基准。
- `theme` 缺失时默认为 `default`，8 个主题标识均可解析，未知主题失败。
- `background_pattern` 缺失时默认为 `meridian-grid`，9 个纹样标识均可解析，未知值失败。
- `web_search` 缺失时默认为 `baidu`，8 个搜索入口标识均可解析，未知值失败。
- 用户给定的 server、health、logging 字段完整解析。
- 未知字段、非法枚举、非法端口、零/负 timeout 失败。
- 错误包含配置文件和 YAML 字段路径。

实现要点：

- 使用独立 `flag.FlagSet`，便于测试参数优先级。
- 使用严格 YAML 解码。
- 将默认值集中在一个构造函数中，禁止散落在处理器里。

验证命令：

```bash
go test ./internal/config -run Test -v
```

预期：所有配置选择和校验用例通过。

### Task 3：实现目录模型与严格加载

**创建：** `internal/catalog/model.go`、`internal/catalog/loader.go`、
`internal/catalog/loader_test.go`、`urls.example.yaml` 和 YAML fixtures。

测试先覆盖：

- 合法最小文件与完整可选字段。
- 组顺序取首次出现顺序。
- 组内链接保持 YAML 相对顺序。
- 只配置 private 或 public 均合法，两者都缺失非法。
- 非 HTTP(S)、重复项、超长字段、超过 1000 项、超过 2 MiB 失败。
- runtime ID 对相同输入稳定，对关键字段变化敏感。
- 错误不泄露 URL 查询参数。

实现要点：

- 解析后立即规范化空白，但不改变展示文本内部空白。
- 存储为不可变结构；响应层不得修改模型切片。
- 生成分组视图时只做稳定分组，不按字母排序。

### Task 4：实现原子快照仓库

**创建：** `internal/catalog/store.go`、`internal/catalog/store_test.go`。

测试先覆盖：

- 首次发布和 revision 递增。
- 并发读期间替换快照无数据竞争。
- 请求持有的旧快照在替换后仍然完整可用。
- ETag 与 revision 对应。

实现要点：

- 使用 `atomic.Pointer` 或等价只读快照方案。
- 所有对外数据在发布前构建完成。
- 使用 `go test -race` 验证。

### Task 5：实现文件观察与热加载

**创建：** `internal/catalog/watcher.go`、`internal/catalog/watcher_test.go`。

测试先覆盖：

- 普通写入、临时文件 rename 覆盖、连续事件防抖。
- 合法更新替换快照并发送 updated 事件。
- 非法更新保留旧快照并发送 error 事件。
- 修复文件后从 degraded 恢复。
- 停止 watcher 后不泄漏 goroutine。

实现要点：

- 监听父目录并按清理后的绝对路径过滤事件。
- reload debounce 使用可注入时钟或可控 timer。
- 事件总线必须有慢消费者保护，不能阻塞文件监听。

### Task 6：实现 Favicon 自动发现与缓存

**创建：** `internal/favicon/discovery.go`、`store.go`、`manager.go` 及测试。

测试先覆盖：

- public HTML 中 `link rel="icon"` 的绝对和相对 URL。
- `shortcut icon`、`apple-touch-icon`、多 sizes 选择和 `/favicon.ico` 回退。
- public 失败后使用 private 入口。
- HTML 读取上限、图标大小上限、超时、3 次重定向和非法 content type。
- 临时文件校验后原子 rename，文件名不能由远端输入控制。
- ETag/Last-Modified 条件刷新、singleflight、worker 上限和过期清理。
- datadir 不可写时进入 degraded，但目录与跳转仍可用。
- SVG 不能以 HTML 或脚本响应方式提供。

实现要点：

- `datadir/favicons` 只保存派生图标和 sidecar 元数据。
- 页面发现最多读取 256 KiB；图标内容由配置限制。
- 首屏先用字标，后台任务完成后发布 `favicon.updated` 事件。
- 不提供接受任意远端 URL 的 favicon 抓取 API。

### Task 7：实现链接探测器

**创建：** `internal/navigation/probe.go`、`internal/navigation/probe_test.go`。

测试先覆盖：

- HEAD 成功。
- 401/403/404 视为可达。
- 405/501 回退到 Range GET。
- 5xx、DNS、连接拒绝、TLS 错误和超时视为不可达。
- 最多 3 次重定向。
- TTL 缓存、singleflight 和并发上限。
- 请求不携带客户端认证信息。

实现要点：

- 使用专用 `http.Client` 和 Transport，不复用入站请求头。
- 完整响应体不得读入内存；GET 探测立即关闭。
- 缓存 key 使用规范化完整目标，不把查询串写入日志。

### Task 8：实现内外网解析器

**创建：** `internal/navigation/resolver.go`、
`internal/navigation/resolver_test.go`。

测试先覆盖决策表：

| private | public | private 状态 | public 状态 | 结果 |
| --- | --- | --- | --- | --- |
| 有 | 有 | 可达 | 未探测 | private |
| 有 | 有 | 不可达 | 可达 | public |
| 有 | 有 | 不可达 | 不可达 | failure |
| 无 | 有 | - | 可达 | public |
| 有 | 无 | 可达 | - | private |
| 有 | 无 | 不可达 | - | failure |

要求每次决策绑定单个目录快照。链接在热加载中删除时，新请求返回 404，已经开始的请求
按旧快照安全完成。

### Task 9：实现只读 HTTP API

**创建：** `internal/httpapi/server.go`、`handlers.go`、
`middleware.go` 及对应测试。

按顺序实现：

1. `GET /api/catalog`、ETag 和 304。
2. `GET /api/events` SSE、心跳、断连清理。
3. `GET /api/icons/{id}` 的类型校验、ETag 和缓存头。
4. `GET /api/status` 和配置化健康路由。
5. `GET /go/{id}` 的 302 与同风格失败页。
6. 安全响应头、request ID、访问日志、panic 恢复。
7. 对业务路径的 POST/PUT/PATCH/DELETE 返回 405。

集成测试必须断言不存在内容修改接口，且 API 响应中不含本地文件绝对路径。

### Task 10：搭建 UI 设计令牌和页面骨架

**创建：** `web/src/styles/tokens.css`、`global.css`、
`web/src/app/App.tsx`、Storybook decorators、基础组件、stories 和 Vitest 测试。

实现顺序：

1. 定义默认深浅色与 7 套彩色主题 token、9 套背景纹样 token、8px 最大圆角、稳定间距和焦点样式。
2. 实现 56px 顶栏、内容容器、无卡片外框的分组区段。
3. 实现响应式链接 Grid 和固定尺寸卡片内部布局。
4. 实现 `config.yaml` 默认主题、`background_pattern` 与 `web_search`、系统黑白默认主题、两套本地覆盖和
   可访问主题/背景纹样下拉菜单。
5. 按 `docs/UI_SPEC.md` 实现 TopBar、BackgroundPattern、UniversalSearch、IconButton、LinkCard、GroupSection、
   SearchField、StatusBanner、Skeleton 和 EmptyState 的完整状态 stories。
6. 增加 320-5120px 的 container/viewport 行为和 safe-area 支持。
7. 用 axe 或等价工具做基础可访问性测试。

浮层表面实现必须从语义 token 开始：在 `tokens.css` 定义 `--floating-surface` 与
`--floating-surface-border`，由主题、背景纹样和 provider 三个选择菜单共同消费。token 最终
背景必须完全不透明，组件 CSS 不得再次通过 `color-mix(..., transparent)` 降低 alpha，也不得
给不透明菜单附加 `backdrop-filter`。`z-index` 只使用既有层级 token；修复背景穿透时必须同时
检查 computed background alpha、祖先 opacity/transform/filter、stacking context 和实际截图，
不能只提高层级。搜索椭圆/顶栏的透明材质与全屏搜索 overlay 按设计文档单独分类，不复用
floating surface token。

背景纹样必须使用确定性 SVG/CSS 几何并覆盖搜索区与目录区；八套实际线条纹样默认运行专属
语义环境动效，不提供静止配置或菜单开关。动画只使用共享 ambient token 与 SVG 分组的
transform、opacity 或 stroke-dashoffset，禁止随机数、Canvas 粒子、JS timer、逐帧状态循环和
捕获指针；reduced motion 下全部停止。禁止在此阶段加入渐变光球、装饰光斑、bokeh、装饰性玻璃拟态和大型营销 hero。外部搜索
工作台允许使用低透明材质面、受控 blur、内高光与实色 fallback 表达层级，但必须是实际可用
的首屏工具区，保留第一导航分组预览，不得演变为宣传页面。

### Task 11：实现统一动效系统

**创建：** `web/src/motion/tokens.ts`、`MotionProvider.tsx`、
`useMotionPreferences.ts`、动效单元测试和 Playwright motion fixtures。

测试先覆盖：

- 所有公开 duration 和 easing 与设计文档一致。
- reduced motion 下关闭 stagger、spring、scale 和 translate。
- 首次进入编排只播放一次，目录热更新不重播全页面入场。
- hover 反馈、press 反馈、搜索补位、favicon crossfade 和主题切换使用正确 token。
- 主题切换逐帧采样关键控件；当前 provider 徽章的表面、边界和唯一品牌 SVG 保持稳定，
  不继承主题文字色，不存在第二枚 SVG 或额外动画对象。
- 超过 80 个可见搜索结果时自动使用简化动效。
- 动画组件卸载后不保留 timer、listener 或 animation frame。
- 八套背景纹样分别验证经纬校准、星体公转、双鱼对游、弓箭掠过、回纹流动、玫瑰窗反转、
  八芒晶格迁移和左下星轨长曝光流动；不得通过一个通用旋转 class 伪装成八种动作。

实现要点：

- 在应用根部使用统一 MotionConfig，不允许业务组件硬编码 spring 参数。
- CSS transition 与 Motion for React 共用同一组 token。
- 布局重排使用 FLIP/layout animation，禁止直接动画 width、height、top、left。
- 不使用固定 60fps 的 timer 驱动动画；CSS、WAAPI 和 requestAnimationFrame 必须跟随
  浏览器实际刷新率，不设置人为最高帧率。
- 首屏动画不阻塞搜索、滚动和点击。
- 背景纹样持续运动只由 CSS/SVG 合成友好属性驱动；不新增运行时动画依赖，不产生 React
  render 循环，reduced motion 下所有 animation-name 为 `none`。
- 星轨幕使用 `xMinYMax slice` 保留左下视觉原点；通过固定圆弧、`stroke-dashoffset` 与围绕
  左下圆心的轻微 transform 形成运动，禁止随机星点、全屏粒子场和 JS 驱动帧循环。
- 星轨幕的可见度调整使用组件局部 class，不修改共享 `primary`、`secondary`、`faint` 线宽；
  目标为图层 opacity 0.86、引导圆 1.1px、slow/medium/fast 轨迹约 1.55/1.3/1.45px，避免影响
  其余七套纹样或破坏既有主题 token。
- 在 60Hz 和可用的高刷新率设备上记录 Chrome Performance trace；确认没有由动画造成的
  超过 50ms Long Task，并确认 165Hz 环境不存在应用造成的 16.7ms 锁帧台阶。

### Task 12：实现目录渲染与搜索

**创建：** `CatalogPage`、`GroupSection`、`LinkCard`、`UniversalSearch`、provider URL builder、
`SearchField`、`EmptyState`、API client 与 hooks。

测试先覆盖：

- API 顺序与 DOM 顺序完全一致。
- 搜索匹配 name、group、description、tags。
- 搜索不区分大小写并正确处理中文。
- `/`、`Ctrl/Cmd+K`、`Escape` 行为。
- 外部搜索默认值来自 `site.webSearch`，缺失时百度；Google/Yandex/Bing/GitHub URL 使用
  `URLSearchParams` 正确编码。异步 catalog 到达时更新默认值，但用户本会话已手动选择后不覆盖。
- Bing host 固定为 `www.bing.com` 并使用国际市场参数；GitHub 固定 repository 类型。
- 外部搜索按钮与 Enter 等价，空查询不打开页面；ChatGPT 携带查询，Claude/Gemini 覆盖
  剪贴板成功、失败和不可用降级。
- 8 个 provider 使用可独立 tree-shake 的 SVG 品牌图标；百度从 Simple Icons 爪印中移除小尺寸
  不可辨的 `du` 微字，避免视觉回归的单像素抗锯齿漂移。Google 直接渲染四色 G 的四条 path；
  Gemini 复用稳定星形 path 作为 clipPath，以蓝色底和红/黄/绿三个透明 radialGradient 叠加
  成四向色场；所有定义由 React `useId` 生成实例唯一 id，避免当前徽章与菜单同时出现时发生
  SVG id 冲突。渐变不使用 blur filter，保证 18/24px 清晰度和合成成本。其余单色品牌在 SVG
  本体定义并消费品牌变量。当前
  provider 使用只含一个品牌 SVG 的圆形图标按钮并打开分组 `menu/menuitemradio`，不渲染小箭头
  或角标。方向键、Home/End、Escape、Tab 和外部点击均可操作；切换任何名称时输入起点和搜索
  按钮不得位移。当前徽章使用固定 `#f8fafc` 背景、`#cbd5e1` 边界与固定品牌色，移除 color、
  background 和 border 的主题过渡。选中与焦点状态仍可消费主题 token，但不得改变徽章核心。
- UniversalSearch desktop 使用 640px 静止宽、820px 交互宽、72px 固定高度和 999px 圆角；
  通过 Motion FLIP/layout animation 舒展，禁止直接动画 width。mouse pointer-enter 设置
  8000ms 保持 timer，pointer-leave 不修改状态，再次进入先清理旧 timer 并重新计时；focus 与
  menu-open 独立保持展开。展开使用 220ms productive entrance easing，收回使用 180ms
  productive standard easing，不使用 spring、回弹或恒速 linear；卸载时清理 timer。
  phone 始终满宽且高 60px，不执行宽度动画或指针计时。
- UniversalSearch 材质层在支持时使用受控 `backdrop-filter`，并实现无 blur 的实色 fallback；
  几何纹理由全页 BackgroundPattern SVG 图层统一绘制且保持极低对比，不在搜索区重复生成，
  不引入图片、角色挂件、装饰性光球、随机环境动画或持续动画。
- 搜索提交按钮使用 `accent` 背景与 `accent-contrast` 图标，是不含专用主题状态的单层按钮；
  background、border、color、box-shadow 和 transform 使用 UniversalSearch 既有短动效 token。
- 首次进入、卡片 hover/press 和搜索过滤符合 `docs/DESIGN.md` 的动效时间线。
- 图标失败回退到稳定字标且不引发布局位移。
- `favicon.updated` 事件只替换对应图像，不重排卡片。
- 卡片 href 始终为本站 `/go/{runtime_id}`。

所有卡片、图标按钮和搜索控件必须有正确可访问名称和键盘焦点。

### Task 13：实现实时更新和异常状态

**创建：** SSE hook、`StatusBanner`、`SkeletonGrid` 和相关测试。

测试先覆盖：

- updated 事件使 catalog query 失效并重新获取。
- favicon.updated 事件刷新对应本地图标 URL。
- error 事件显示紧凑错误条但保留现有目录。
- 热更新只动画发生变化的卡片和分组，不重播首屏编排。
- SSE 断开指数退避重连。
- 更新时保留搜索词、主题和滚动位置。
- 空目录、首次加载失败、离线和 500 都有稳定布局。

### Task 14：嵌入前端并完成应用生命周期

**创建：** `ui/embed.go`、`internal/app/app.go` 和测试。

实现要点：

- `go:embed` 包含生产前端产物。
- SPA fallback 不得吞掉 `/api`、`/go` 和 health 路由的 404。
- 启动顺序：配置 -> datadir -> 目录 -> favicon manager -> watcher -> HTTP。
- 关闭顺序：停止接收 -> HTTP drain -> watcher stop -> favicon workers stop -> logger flush。
- 构建信息通过 linker flags 注入版本、commit 和 build time。

### Task 15：端到端、响应式、动效与视觉验证

**创建：** `web/tests/e2e/*.spec.ts`、固定测试 YAML、截图基线。

必须覆盖：

- `docs/UI_SPEC.md` 的 PR 阻断视口矩阵和 Chromium/Firefox/WebKit。
- nightly 执行 320x568 至 5120x2880 的完整矩阵及 DPR 抽样。
- nightly 执行 320-1920px 每 16px、1920-5120px 每 64px 的连续宽度几何扫描。
- 手机/平板横竖屏、桌面缩放窗口、safe area、touch/coarse pointer。
- 200%/400% zoom、系统字体变化、forced-colors 和 reduced motion。
- 深色、浅色、系统 reduced motion。
- 首次进入、hover、press、搜索重排、favicon 到达、热更新和主题切换动效。
- 长名称、长分组名、缺失图标、500 个链接。
- YAML 原子替换后页面自动更新。
- favicon 自动发现、落盘、缓存命中、刷新和字标回退。
- private 成功、private 失败 public 成功、两者失败。
- 键盘完成搜索和打开链接。
- 页面无重叠、无横向溢出、无空白主区域。
- Performance trace 中没有动画造成的超过 50ms Long Task；关键动画跟随设备原生刷新率，
  不存在固定 60fps 或其他人为最高帧率。
- Storybook 中每个组件状态有视觉基线，且 baseline 变更经人工审查。
- DOM 几何断言覆盖 overflow、overlap、对齐、gap、touch target、focus clipping 和 CLS。
- 在深色、浅色和全部彩色主题下逐一打开主题、背景纹样与 provider 菜单，断言三者 computed
  background alpha 均为 `1`、`backdrop-filter: none`、边界与阴影来自共享语义 token；截图中
  菜单后方的正文、卡片与动态纹样不可辨识。另行验证搜索椭圆仍保留受控透明材质，全屏搜索
  overlay 不暴露可辨识背景内容，避免把所有透明表面误收敛为同一种组件。

视觉基线变化必须人工检查，不能无条件更新截图。

### Task 16：打包与发布验证

**创建：** `Dockerfile`、`.dockerignore`、发布脚本和运行说明。

要求：

- Linux/macOS 主流架构能构建单二进制。
- 容器以非 root 用户运行，配置通过只读挂载提供。
- datadir 使用独立可写 volume；`urls.yaml` 仍可只读挂载。
- `-f` 与 `configpath` 在本机和容器中均验证。
- 二进制执行 `--version` 不加载配置。
- 完整执行 `docs/ACCEPTANCE.md` 的 P0 项。

## 3. 每次变更的工作流

1. 阅读设计、代码规范、实施、验收和现有变更记录。
2. 若需求变化，先在 `docs/CHANGELOG.md` 新增条目。
3. 同步更新受影响的设计与验收条款。
4. 添加失败测试。
5. 完成最小实现。
6. 运行相关测试、全量测试、race test 和前端检查。
7. 对 UI 变化运行 Playwright 截图与移动端检查。
8. 在变更条目中补充实际验证命令和结果。

## 4. 统一验证命令

项目实现后，`make verify` 应等价执行：

```bash
go test ./...
go test -race ./...
go vet ./...
staticcheck ./...
govulncheck ./...
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run test
npm --prefix web run build
npm --prefix web run storybook:test
npm --prefix web run test:visual
npm --prefix web run test:e2e
npm --prefix web audit --omit=dev
```

`make verify` 还必须检查 `gofmt`/`goimports`、测试覆盖率和生成文件是否干净。
任何命令未运行或因环境跳过，都必须在交付说明和变更文档中明确记录。
弃用检查、安全检查和 race test 不得在正式发布中跳过。
