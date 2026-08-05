# Navi 验收文档

状态：实现验收基线  
版本：1.4.0
日期：2026-08-03

## 1. 验收规则

- P0 项必须全部通过，项目才可声明第一版完成。
- UI/UX P0 项拥有发布否决权；功能测试全部通过不能抵消粗糙的视觉或交互体验。
- P1 项允许经明确记录后延期，但必须进入 `docs/CHANGELOG.md`。
- 每个用例保留命令、日志摘要、截图或测试报告作为证据。
- 验收以实际可执行二进制为对象，不以开发服务器替代。
- 任何与本文件不一致的“实际行为”都视为缺陷或待批准变更。

## 2. 验收环境

- 一台可运行目标二进制的 Linux 或 macOS 主机。
- 一个合法和一个非法的 `urls.yaml` fixture。
- 两个本地 HTTP fixture：private 和 public，可独立启停并控制响应码/延迟。
- Chromium 桌面和移动视口。
- 测试期间浏览器无旧 Service Worker、无扩展注入页面。

## 3. 功能验收

### AC-P0-001 主配置默认路径

前置：工作目录存在 `config.yaml` 和合法 `urls.yaml`。  
操作：不传参数、不设置环境变量启动程序。  
预期：程序读取 `./config.yaml`，日志显示配置来源，health 返回 `ok`。

### AC-P0-002 configpath 环境变量

操作：

```bash
configpath=/tmp/navi/config.yaml ./navi
```

预期：加载指定文件；相对 `catalog.path` 以 `/tmp/navi` 为基准解析。

### AC-P0-003 -f 优先级

操作：同时设置 `configpath` 并传入另一个有效 `-f`。  
预期：`-f` 文件生效；日志清楚标识来源但不泄露敏感查询参数。

### AC-P0-004 用户提供的基础配置兼容

操作：使用包含完整 server、health、logging 段的配置。  
预期：所有字段生效；超时值可从实际 server 行为或单元测试证据确认。

### AC-P0-005 严格配置校验

分别加入未知字段、非法 port、未知日志级别、负 timeout。  
预期：每次均在监听端口前退出非零；错误指出文件与字段路径。

### AC-P0-006 YAML 唯一事实来源

检查程序目录、运行目录、网络请求和进程打开文件。  
预期：

- 不创建或使用 SQLite、BoltDB、导航 JSON 状态文件或其他目录副本。
- `storage/favicons` 中允许存在可删除、可重建的 favicon 派生缓存及其元数据；
  其中不得保存导航目录副本或排序状态。
- 不存在新增、修改、删除、排序、上传的 HTTP API。
- UI 中不存在登录、编辑、拖拽、保存和管理入口。
- 页面内容和顺序只随 `urls.yaml` 改变。

### AC-P0-007 顺序规则

准备交错分组的 YAML：

```yaml
version: 1
pages:
  - id: page1
    title: Order Test
    urls:
      - {name: A1, group: A, private_url: "http://a1.test"}
      - {name: B1, group: B, private_url: "http://b1.test"}
      - {name: A2, group: A, private_url: "http://a2.test"}
  - id: page2
    title: Second Page
    urls: []
```

预期：分页顺序为 page1、page2；page1 的分组顺序为 A、B；A 内顺序为 A1、A2；B 内为 B1。
刷新后不变化。旧版顶层 `site/urls` 必须严格校验失败。

### AC-P0-008 合法 YAML 热加载

操作：程序运行中以普通保存和临时文件 rename 两种方式更新 `urls.yaml`。  
预期：防抖后 revision 增加；已打开页面自动更新；搜索词和滚动位置保留；服务不中断。

### AC-P0-009 非法 YAML 热加载

操作：运行中将文件改为语法错误或字段非法。  
预期：页面继续展示最后有效快照；出现紧凑错误提示；health 为 `degraded`；
日志指出错误但不暴露 URL 查询参数。修复文件后自动恢复 `ok`。

### AC-P0-010 启动时非法 YAML

操作：使用非法目录文件启动。  
预期：程序不监听端口，以非零状态退出，不展示空白或半加载页面。

### AC-P0-011 private 优先

前置：private 和 public fixture 均可达。  
操作：点击链接。  
预期：单次点击在新标签页打开 private 地址；public fixture 未收到探测请求。

### AC-P0-012 public 自动回退

前置：private 不可达，public 可达。  
操作：点击链接并计时。  
预期：不显示中间选择页面，自动进入 public；总等待不超过配置的 private timeout、
public 实际响应时间与 200ms 处理余量之和。

### AC-P0-013 两端均不可达

前置：private 和 public 均不可达。  
预期：显示与主界面一致的失败页，明确链接名称，并提供独立重试入口；
不显示服务器堆栈、本地文件路径或完整探测内部信息。

### AC-P0-014 单地址链接

分别测试仅 private、仅 public。  
预期：存在的地址可达则打开，不可达则进入失败页；不会访问空 URL。

### AC-P0-015 探测语义

使用 fixture 返回 200、302、401、403、404、405、500 和超时。  
预期：100-499 可达；405/501 触发 Range GET；5xx 和网络错误不可达；
重定向不超过 3 次。

### AC-P0-016 探测缓存与并发

对同一未缓存链接并发发起 50 次点击请求。  
预期：探测请求被合并；并发总量不超过配置值；缓存期内不重复探测；过期后重新探测。

### AC-P0-017 优雅关闭

操作：存在慢请求时发送 SIGTERM。  
预期：停止接收新请求；已有请求在 shutdown timeout 内完成；到期后干净退出；
无 goroutine 泄漏告警。

### AC-P0-018 Favicon 自动发现

准备页面分别声明相对 `link rel="icon"`、`shortcut icon`、`apple-touch-icon`，
以及完全不声明图标的站点。  
预期：按设计顺序发现图标；无声明时请求 origin 的 `/favicon.ico`；
public 发现失败时尝试 private；成功内容保存到 `storage/favicons`。

### AC-P0-019 Favicon 本地缓存

首次加载后停止目标站点并刷新 Navi 页面。  
预期：图标仍由本站 `/api/icons/{id}` 正常提供；响应带正确 Content-Type、ETag、
长期缓存头和 nosniff。删除缓存并重启后，目标不可达时回退到字标。

### AC-P0-020 Favicon 安全与限制

分别返回超大文件、HTML 伪装图片、超过 3 次重定向、慢响应、路径穿越式远端文件名和 SVG。  
预期：超大、HTML、过多重定向和超时均拒绝落盘；缓存路径始终在
`storage/favicons`；合法 SVG 通过隔离图像响应提供，不能执行脚本或作为 HTML。

### AC-P0-021 storage 故障降级

将 `storage` 指向不可写位置。
预期：目录渲染和链接跳转仍可使用，所有图标回退字标，health 返回 `degraded`，
日志给出权限错误。恢复可写后，重启或刷新周期能建立缓存。

## 4. UI/UX 验收

### AC-P0-101 首屏与布局

在 1440x900 打开首页。  
预期：首屏直接是导航内容；顶部栏、至少一个分组标题和链接卡片可见；
没有 hero、营销说明、嵌套卡片、装饰渐变或大面积空白。

### AC-P0-102 视觉规范

通过计算样式与截图检查：

- 卡片圆角不超过 8px。
- 默认主题主色为黑、白和中性灰；彩色主题也必须以中性或低彩度画布为主体，用户给定的
  撞色只能集中在分组刻度、图标、选中、焦点和 hover 等低面积角色。
- 卡片默认边框必须为中性色，不能把主题色复制到每张卡片轮廓或作为整页高饱和背景。
- 状态色只承担语义，不成为大面积背景。
- 字间距为 0。
- 卡片图标区域和高度稳定，加载前后无明显位移。
- hover、focus 和 active 状态可区分但不过度动画。

### AC-P0-103 响应式

执行 `docs/UI_SPEC.md` 的 PR 阻断矩阵。  
预期：无非预期水平滚动，无文字遮挡，无控件重叠；列数由可用内容宽度决定；
顶部栏控件均可触达，最长测试名称能省略、换行或增高而不撑破容器。

### AC-P0-104 搜索

分别输入名称、分组、description、tag、不同大小写和中文。  
预期：50ms 内更新结果；匹配正确；分组上下文保留；无结果状态稳定；
清空后恢复原始 YAML 顺序。

### AC-P0-105 键盘操作

仅使用键盘执行聚焦搜索、输入、清空、遍历卡片和打开链接。  
预期：`/`、`Ctrl/Cmd+K`、`Escape` 正确；焦点环清晰；Tab 顺序与页面顺序一致；
没有键盘陷阱。

### AC-P0-106 可访问性

预期：

- 自动化 axe 扫描无 serious/critical 问题。
- 正文、控件和焦点对比度满足 WCAG 2.2 AA。
- 200% 和 400% 缩放不遮挡、不丢失功能。
- 图标按钮具有可访问名称。
- reduced motion 下无位移动画。

### AC-P0-107 主题

分别测试系统深色、系统浅色、8 个合法 `config.yaml theme` 值、非法主题、用户本地覆盖、
主题菜单键盘操作和刷新恢复。  
预期：`default` 跟随系统；无本地偏好时使用主配置主题；本地选择优先并只写浏览器
localStorage；不修改 YAML 或生成服务器状态文件；非法配置在监听端口前失败。菜单展示
默认、绀樱夜、薄荷汐、苔庭青、茶雾青、琥珀潮、晴海橙、藤萝青，支持方向键、Home/End、
Enter、Escape 和外部点击关闭。全部主题的正文、控件、焦点和状态满足 WCAG 2.2 AA，
切换期间无白闪、布局位移或文字遮挡。重点双向测试藤萝青与绀樱夜：当前百度 provider 徽章
背景逐帧保持 `#f8fafc`、边界逐帧保持 `#cbd5e1`、爪印逐帧保持品牌色 `#2932e1`；按钮、SVG
和 path 保持同一实例，`opacity: 1`、`visibility: visible`、`filter: none`，且不存在作用于徽章
background、border 或 color 的主题动画。搜索提交按钮保持单个 button 与单个 SVG，不包含
专用主题状态、额外主题 DOM 或组件级主题观察器。

### AC-P0-108 异常与加载状态

模拟慢 API、API 500、SSE 中断、图标 404、favicon 后台到达和空目录。  
预期：骨架尺寸稳定；错误不造成空白页；SSE 自动重连；图标使用字标回退；
后台图标替换无布局位移；空目录展示简洁空状态。

### AC-P0-109 动效语言一致性

检查首次进入、卡片 hover/press、搜索、favicon 到达、YAML 热更新、主题切换和错误条。  
预期：

- 所有动画使用设计文档中的 duration、easing 和 spring token。
- 首次进入总编排不超过 600ms，且不会阻塞搜索、滚动或点击。
- hover 在 50ms 内开始反馈，press 有清晰但克制的触感。
- 常用交互没有超过 480ms 的动画，没有无意义循环动画。
- 不存在倾斜卡片、强发光、夸张弹跳、视差、磁吸光标或装饰性粒子。

### AC-P0-110 状态连续性

操作：连续进行搜索过滤、清空搜索、等待 favicon 到达、原子替换 YAML 并切换主题。  
预期：卡片通过空间连续的补位动效变化；滚动位置和输入焦点不丢失；favicon 交叉淡入且
不改变 36x36px 容器；热更新只动画变化内容；主题颜色统一过渡且无白闪。

### AC-P0-111 高刷新率与无锁帧

在 60Hz 和 165Hz 显示环境分别录制 Chrome Performance trace，并用
`requestAnimationFrame` 采样至少 300 帧。  
预期：

- 应用代码没有 60fps 或其他最高帧率常量，不用 timer 逐帧驱动动画。
- CSS、WAAPI、Motion 和 requestAnimationFrame 跟随浏览器实际刷新节奏。
- 165Hz 环境的稳定采样中位间隔应接近约 6ms，不出现应用造成的持续 16.7ms 台阶。
- 常用动效掉帧率不超过 5%，且没有由动画引起的超过 50ms Long Task。
- 若操作系统、节能策略或浏览器主动降频，验收记录必须包含环境与实际刷新率。

### AC-P0-112 主观体验门禁

由项目负责人在 compact、phone、tablet、desktop、ultrawide 模式实际使用不少于
15 分钟，完成搜索、浏览所有分组、连续打开链接、主题切换、热更新和异常恢复。  
预期：明确批准以下五项：视觉层级、排版间距、交互反馈、动效自然度、长期使用舒适度。
任一项未批准即视为 P0 失败，并记录具体页面、状态和改进要求，不能以“功能可用”放行。

### AC-P0-113 设备与视口矩阵

执行 `docs/UI_SPEC.md` 的 PR、nightly 和发布前真实设备矩阵。  
预期：

- 自动化覆盖宽度 320-5120 CSS px 及代表性高度。
- 连续几何扫描覆盖 320-1920px 每 16px、1920-5120px 每 64px，防止断点之间错位。
- Chromium、Firefox、WebKit 阻断项目全部通过。
- DPR 1、1.25、1.5、2、3 抽样无错位。
- 真实手机、平板、笔记本、桌面和 165Hz 环境有 smoke 记录。

### AC-P0-114 组件几何一致性

对 TopBar、SearchField、GroupSection、LinkCard、Favicon、IconButton、StatusBanner、
Skeleton、EmptyState 和 FailurePage 执行 Storybook 与 computed-style 检查。  
预期：尺寸、padding、gap、radius、font、line-height、icon box、状态反馈完全符合
`docs/UI_SPEC.md`；GroupSection 标题行不渲染横向分隔线；同层级重复间距误差不超过 1 CSS px。

### AC-P0-115 文字与内容边界

使用 60 字符名称、40 字符分组、120 字符描述、无空格长词、中英文混排、emoji、
字体加载失败和系统最小字号提高。  
预期：无文字覆盖、裁切、卡片撑破或相邻元素移动；组件按契约换行或增高；
完整 accessible name 保留。

### AC-P0-116 横竖屏、安全区与输入方式

在手机和平板运行中切换 portrait/landscape，并测试 iOS safe area、平板分屏、
coarse pointer、touch、鼠标、触控板和键盘。  
预期：不刷新页面；搜索词、焦点、滚动位置和主题保留；命令 target >= 44x44；
无 hover-only 功能；overlay 关闭命令始终可见。

### AC-P0-117 Zoom 与 Reflow

在 1280px 视口执行 200% 和 400% browser zoom，并测试 320x256 reflow 与浏览器字体放大。  
预期：400% 时回流到约 320 CSS px 单列；不存在二维滚动；固定高度不裁切内容；
顶栏、搜索 overlay、失败页和所有命令保持可用。

### AC-P0-118 跨浏览器一致性

对 Chromium、Firefox、WebKit 的 compact、tablet、desktop、ultrawide 代表视口
比较截图与几何报告。  
预期：允许字体抗锯齿差异，不允许结构、列数、padding、gap、换行策略、focus、
sticky、overlay 或滚动行为差异。

### AC-P0-119 自动几何断言

Playwright 读取 DOM bounding boxes 和页面 metrics。  
预期：

- 根节点 `scrollWidth <= clientWidth`。
- 任意可见组件不超出 viewport/content container。
- 不存在 TopBar、Banner、GroupSection、Card 和 overlay 非预期 overlap。
- 同行卡片边缘误差 <= 1 CSS px，标题与首列卡片左边缘误差 <= 0.5 CSS px。
- Favicon 始终 36x36，IconButton clickable box >= 44x44。
- focus ring 不被裁切，loading 到内容 CLS <= 0.02。

### AC-P0-120 状态与数据矩阵

执行 `docs/UI_SPEC.md` 中 0/1/20/500 链接、长文本、图标生命周期、加载、错误、
degraded、恢复、搜索和主题矩阵。  
预期：每个状态都有 Storybook story 和至少一个自动化断言；状态切换不改变不相关组件
geometry，不产生残留分隔线、双滚动或上下 spacing 不一致。

### AC-P1-121 视觉回归

所有规定视口生成受版本控制的截图基线。差异经人工确认，不允许仅以测试通过为由接受
明显的间距、重叠、字体或颜色回归。

### AC-P0-122 外部搜索工作台

在 1440x900、768x1024 和 390x844 分别检查首屏，并依次选择百度、Google、Yandex、
Bing、GitHub、ChatGPT、Claude 和 Gemini，输入中英文混合查询后用按钮与 Enter 提交。

预期：

- desktop/tablet 搜索区高度在 330-460px，phone 无横向溢出；1440x900 首屏仍能看到第一
  个导航分组及至少一行卡片，不形成占满首屏的 hero。
- 网页 provider 构造正确的 HTTPS 查询 URL；Bing host 为 `www.bing.com`，GitHub 保留
  repository 搜索类型；查询通过 URL API 编码，空查询不打开页面。
- ChatGPT 携带查询打开新对话；Claude/Gemini 打开官方页面并尝试复制原查询，剪贴板成功
  或失败均显示不造成 layout shift 的状态文字。
- 当前 provider 圆形按钮打开 accessible name 为“选择搜索入口”的菜单；网页/模型分组共 8 个
  `menuitemradio`，具备至少 44x44 target、清晰焦点、非纯色选中反馈，并支持方向键、Home/End、
  Enter、Escape、Tab 与外部点击关闭；
  外部搜索与现有“搜索导航”筛选框具有不同 accessible name，不发生测试或操作歧义。
- `web_search` 缺失时使用 `baidu`，8 个合法值均可解析，未知值失败；API 的根级 `webSearch`
  决定初始入口。当前会话手动切换不持久化，刷新回到配置值。
- desktop 搜索器静止约 640px；mouse pointer-enter 后在 220ms 内通过 FLIP 舒展到约 820px，
  pointer-leave 后仍保持展开，8000ms 窗口结束且无 focus/menu-open 时在 180ms 内自动收回；
  再次 pointer-enter 必须重新计时。展开 easing 为 `cubic-bezier(0,0,0.38,0.9)`，收回为
  `cubic-bezier(0.2,0,0.38,0.9)`，不得使用 spring、回弹或恒速 linear。高度保持 72px、圆角
  保持 999px、内部控件不位移。phone 始终满宽且高 60px，不执行宽度动画或指针计时。
- 每个入口显示可辨识 SVG 品牌图标，辅助技术仍读取完整 provider 名称；百度在 21/24px 下显示
  无微字的清晰爪印，Google 的四条 path 分别保持 `#4285F4`、`#34A853`、`#FBBC05`、
  `#EA4335`，Gemini 的星形使用实例唯一 clipPath 与 radialGradient，在 18/24px 下同时呈现
  `#FC413D`、`#FBBC04`、`#00B95C`、`#3186FF` 四向色场且没有模糊滤镜。其余单色 SVG 的 computed
  color 必须等于自身 `--provider-brand`，不得退回到祖先主题文字色。菜单关闭时当前 provider
  按钮只含一个品牌 SVG；打开后显示当前图标与全部 8 个选项图标，不得出现无
  `data-provider-icon` 的第二枚 SVG、小箭头或角标。
- 搜索工作台周围不存在角色、挂件、随机环境动画或与搜索任务无关的持续装饰动画；搜索器、
  provider 菜单和背景纹样之外不增加额外视觉主体。
- 主搜索椭圆在支持 `backdrop-filter` 时使用 18-24px 的受控模糊，并保留清晰边界、内高光和
  AA 文字对比；禁用或不支持 blur 时回退为不透明 surface，内容仍完整可读。provider 菜单
  不继承该透明材质，必须使用 `AC-P0-124` 的不透明 floating surface。结构纹理不得穿透输入
  文字、遮挡焦点或造成移动端横向溢出。
- 自动化覆盖 URL 构造、Enter/按钮等价、空值、剪贴板成功/失败、配置同步与本会话覆盖、
  菜单键盘和关闭行为、desktop/mobile 伸缩几何、无装饰角色与随机动画、blur fallback、
  serious/critical axe 和视觉回归。

### AC-P0-123 背景纹样系统

在 1440x900、768x1024、390x844 和 320x568 下，分别选择素幕、经纬阵、天游环、双鱼宫、
天弓宫、回廊纹、玫瑰窗、八芒阵和星轨幕，并至少在默认、绀樱夜、茶雾青、晴海橙主题下组合检查。

预期：

- 顶栏“背景纹样”入口位于主题之后，触发目标至少 44x44；菜单包含 9 个带缩略图的
  `menuitemradio`，支持方向键、Home/End、Enter、Escape、Tab 和外部点击关闭。
- `background_pattern` 缺失时使用 `meridian-grid`，9 个合法值均可解析，未知值失败；本地
  `navi.background-pattern` 覆盖配置并跨刷新保留，没有本地覆盖时配置变更立即生效。
- 纹样从顶栏下方连续覆盖搜索区和目录区，UniversalSearch 与 main 不再有互相割裂的实色
  背景；`none` 完全移除线条，切换不改变内容尺寸、滚动位置、主题或搜索状态。
- 纹样图层固定、`pointer-events: none`、不进入可访问树，不创建横向滚动；1440x900 与
  390x844 下纹样 SVG 覆盖视口，卡片、输入、状态条和焦点文字继续满足 WCAG 2.2 AA。
- 8 套线条分别具有可辨识的经纬网、天文环、双鱼、弓箭、连续回纹、放射玫瑰窗、八芒星和
  左下同心星轨几何特征；普通模式下八套纹样均默认运动，且动作语义可区分：经纬校准、星体
  公转、双鱼对游、弓箭掠过、回纹流动、玫瑰窗内外反转、八芒晶格迁移和星轨长曝光流动。
  主题切换只改变线色，不改变
  路径几何、动画周期或当前 SVG/DOM 身份。
- 动效只使用固定 CSS/SVG transform、opacity 或 stroke-dashoffset；不存在随机数、Canvas、
  粒子、JS timer、requestAnimationFrame 循环、React state 循环或新增运行时依赖。所有周期
  读取共享 18s/36s/72s/108s ambient token，最短周期不低于 18s。
- `none` 不渲染线条；其余纹样没有静止配置或菜单开关。reduced motion 下环境动效全部停止、
  纹样立即替换；普通模式 crossfade 使用既有 motion token，CLS 为 0。
- 星轨幕在 1440x900 与 390x844 下均保留左下视口外侧圆心，主要有效像素位于左侧和下方 60%
  范围，右上四分之一保持低密度；不遮挡正文、不捕获指针、不改变布局或制造横向溢出。
- 星轨幕 computed opacity 为约 0.86；引导圆约 1.1px，slow/medium/fast 三档轨迹分别约
  1.55/1.3/1.45px。浅色和深色主题下轨迹均可辨识，主轨、辅轨、引导圆层级清楚，同时正文、
  搜索器、卡片边界和焦点状态继续保持更高视觉优先级与原有对比门禁。
- 自动化覆盖 schema、配置/本地优先级、菜单键盘操作、全选项切换、指针穿透、几何、axe、
  八套纹样的 animation-name/周期/运行状态、动作语义区分、reduced motion、主题组合和视觉回归。

### AC-P0-124 浮层表面一致性与背景隔离

在 1440x900 下覆盖系统深色、系统浅色和 7 套彩色主题，在 390x844 下覆盖系统默认、绀樱夜
与藤萝青，并分别打开主题菜单、背景纹样菜单和 provider 菜单；菜单后方准备可辨识的导航
文字、卡片边界与背景纹样。自动计算样式门禁启用 reduced motion 以隔离表面测试与动效测试，
普通动效模式另由视觉回归和背景纹样验收覆盖。

预期：

- 三个 `role=menu` 均消费共享 floating surface 语义 token；computed background alpha 为 `1`，
  `backdrop-filter: none`，边界与阴影一致遵循共享 token，不存在组件私有的透明 `color-mix`、
  blur feature query 或通过更高 `z-index` 掩盖穿透的实现。菜单仍可使用标准 enter/exit opacity
  动画；动效中的元素 opacity 不承担背景隔离职责，也不得被误当成 background alpha。
- 菜单内看不到可辨识的页面文字、卡片轮廓或动态背景纹样；滚动菜单时隔离结果保持不变，
  selected、hover、focus、缩略图与色样仍清晰，正文和交互状态满足 WCAG 2.2 AA。
- 菜单祖先不得以小于 `1` 的 opacity、filter、blend mode 或意外 stacking context 改变最终
  合成结果；Chromium、Firefox、WebKit 的深浅代表主题均得到一致隔离。
- 搜索椭圆和顶栏仍可按设计使用受控透明材质，它们不属于 floating surface；全屏搜索 dialog
  使用专用 overlay token，背后正文与纹样不可辨识且页面没有双滚动。菜单缩略图的透明层只在
  不透明父面板内部合成，不视为背景穿透。
- 自动化同时检查计算样式、三个菜单的视觉回归、移动端安全边距、键盘关闭路径、forced-colors
  fallback 和 console；禁止只依靠截图阈值放行透明度回归。

### AC-P0-125 搜索品牌图标准确性与徽章纯净度

在 Google、Gemini 和任一单色 provider 作为当前入口时，分别覆盖菜单关闭/打开、浅色/深色、
1280x720 与 390x844，并在同一页面同时检查当前徽章和菜单实例。

预期：

- Google 始终显示四色 G；Gemini 始终显示四色渐变星形，多个实例的 clipPath/gradient id 唯一
  且每个引用只指向本实例定义；18/24px 下红、黄、绿、蓝均可辨。主题切换不得改变品牌色、
  opacity、filter 或节点身份。
- 当前 provider 按钮内部恰好一个 SVG，图标在 52x52px/44x44px 圆形表面中视觉居中；DOM、
  computed style 和截图均不存在小箭头、圆形角标、第二枚 SVG 或移除后残留的空白偏移。
- 百度、Yandex、Bing、GitHub、ChatGPT、Claude 继续消费既有单色品牌 token；修正不得改变
  provider 选择、键盘菜单、搜索 URL、剪贴板降级、伸缩几何或浮层表面契约。
- Vitest 精确验证 Google path fill、Gemini gradient stop/实例 id 和单 SVG 结构；Playwright
  覆盖三浏览器、主题稳定性、desktop/mobile 几何、console、overflow 与视觉回归。

### AC-P0-126 多页目录与底部分页

准备至少两个页面，分别包含不同标题、分组和链接，在 1440x900、768x1024、390x844 与
reduced motion 下完成上一页、下一页和页点直达操作。

预期：

- `/api/catalog` 返回根级公开外观字段和按 YAML 顺序排列的 `pages`；每页包含稳定唯一 ID、
  标题、副标题和分组。旧版顶层 `site/urls` 启动时严格失败，不存在兼容或迁移分支。
- 顶栏标题、浏览器标题、目录内容和移动搜索结果始终属于当前页；本地搜索不跨页，主动切页会
  清空旧页查询并关闭移动搜索浮层。
- 分页固定在视口底部中央且高于正文，滚动到任意位置仍保持相同视口坐标；外层空白区域不拦截
  正文操作，正文底部预留足够空间，最后一排卡片不被遮挡，并正确叠加左右/底部 safe area。
- 分页采用无边框、无面板的 Morphing Page Dots：Lucide Chevron 裸图标按钮、6x6px 非活动页点
  和约 22x7px 活动胶囊；每个目标至少 44x44px，当前页具有 `aria-current="page"`，首尾方向按钮
  禁用，单页不渲染分页或底部占位。
- 活动 indicator 在页点之间以 280ms ease-out tween 平滑形变移动，并触发一次约 520ms 的低透明
  ripple；不使用 spring、回弹或循环动画。reduced motion 下 indicator 立即切换且不渲染 ripple。
- 前进时新页从右侧进入、旧页向左退出；后退方向相反。位移约 24px、时长 220ms，透明度与位移
  连续且不回弹。reduced motion 下无水平位移并使用 instant token。
- desktop 与 mobile 不出现水平溢出、固定分页遮挡卡片、文字重叠、safe-area 冲突或页面切换后的
  残留旧内容；热加载保留仍存在的当前页 ID，删除当前页时回到第一项。

## 5. 性能验收

### AC-P0-201 后端

500 个链接、日志 info、release build：

- 冷启动到 health 可用 <= 1s。
- `/api/catalog` P95 <= 100ms。
- 缓存命中的跳转 P95 <= 50ms。
- `go test -race ./...` 无数据竞争。

### AC-P0-202 前端

局域网、桌面 Chromium、无缓存首次访问：

- LCP <= 1.5s。
- CLS <= 0.05。
- 搜索交互 <= 50ms。
- 初始压缩 JS+CSS <= 300 KiB，不计本地按需加载的 favicon。
- Favicon 抓取不阻塞首屏目录响应。

### AC-P1-203 稳定性

连续 1 小时每秒触发文件事件、每秒 10 次目录读取并周期性点击链接。  
预期：无崩溃、无持续内存增长、无 watcher 或 SSE goroutine 泄漏。

## 6. 安全验收

### AC-P0-301 只读表面

对常见写方法和猜测路由执行 POST/PUT/PATCH/DELETE。  
预期：返回 404 或 405；YAML mtime 和内容哈希不变化。

### AC-P0-302 安全响应头

预期首页和 API 包含设计要求的 CSP、nosniff、referrer policy、permissions policy
和 frame 限制，且不破坏图标加载。

### AC-P0-303 探测请求隔离

入站请求携带 Cookie、Authorization、X-Forwarded-For。  
预期：目标 fixture 不收到这些值；日志不记录敏感查询参数。

Favicon 的 HTML 和图像抓取必须满足相同的请求头隔离要求，且不存在接受任意 URL 的抓取
接口。

### AC-P0-304 默认监听

使用示例配置启动。  
预期：只监听 `127.0.0.1:8080`。文档明确说明绑定 `0.0.0.0` 时需外部访问控制。

## 7. 生产级代码验收

### AC-P0-401 Go 目录与命名

对照 `docs/CODING_STANDARDS.md` 检查所有 Go 文件。  
预期：

- `cmd/navi/main.go` 保持薄入口，业务逻辑位于职责明确的 `internal` package。
- 不存在 `utils`、`helpers`、`common`、`misc` 等模糊 package。
- package 小写无下划线，文件名小写，测试和平台后缀符合 Go 约定。
- 标识符正确使用 URL、HTTP、API、ID、HTML、SSE 等 initialism。
- 不存在 `catalog.CatalogLoader` 之类 package stutter。
- 导出标识符都有符合 Go doc 的注释。

### AC-P0-402 Go 静态质量门禁

运行：

```bash
gofmt -l .
go vet ./...
staticcheck ./...
govulncheck ./...
go test ./...
go test -race ./...
```

预期：全部退出 0；`gofmt -l` 无输出；Staticcheck SA1019 无报告；
race detector 无数据竞争；govulncheck 无影响当前调用路径的已知漏洞。

### AC-P0-403 React 与 TypeScript 门禁

运行 lint、typecheck、单元测试和生产构建。  
预期：

- TypeScript strict、noUncheckedIndexedAccess 和 exactOptionalPropertyTypes 生效。
- 无显式/隐式 any、无 `@ts-ignore`、无未说明的 `@ts-expect-error`。
- `@typescript-eslint/no-deprecated` 和 React Hooks rules 为 error 且零违规。
- 组件 render 纯净，Hook 不条件调用，Effect 只同步外部系统。
- feature 目录无循环依赖，公共模块无无边界 barrel export。

### AC-P0-404 零弃用代码与字段

检查 Go 文档 `Deprecated:`、TypeScript `@deprecated`、编译器/linter 输出、包管理器
警告和配置 schema。  
预期：

- 产品代码不使用弃用函数、类型、方法、字段或 React legacy API。
- 不使用 `io/ioutil`、`http.CloseNotifier`、`Request.Cancel`、
  `Transport.Dial`、`ReactDOM.render` 或等价旧式入口。
- `config.yaml` 和 `urls.yaml` 不存在静默兼容的弃用字段别名。
- 没有未记录的 lint suppression；正式发布默认零弃用例外。

### AC-P0-405 依赖与漏洞

预期：

- `go.mod`、`go.sum` 和 npm lockfile 完整并可重复安装。
- 不存在浮动 branch、未固定远程脚本、deprecated 或 archived 直接依赖。
- `npm audit --omit=dev` 无 high/critical 生产漏洞。
- 每个新增直接依赖都有用途、替代方案、维护状态和体积影响记录。

### AC-P0-406 生命周期与错误处理

使用取消、超时、连接中断、磁盘权限错误、非法 YAML 和并发关闭场景测试。  
预期：

- context 是 I/O 函数第一个参数且不存入长期 struct。
- 每个 goroutine 有 owner 和停止路径，无 fire-and-forget。
- 文件、响应体、timer、ticker、channel 和取消函数正确释放。
- 错误使用 `%w` 保留链路，内部错误不会直接暴露给客户端。
- 网络、文件读取、队列和重试全部有界。

### AC-P0-407 文档与可维护性

预期：

- 所有公开 package 和标识符有准确 doc comment。
- 不存在裸 TODO、死代码、复制的弃用实现或未使用 feature flag。
- 复杂并发、缓存失效、安全边界有必要说明。
- 代码、测试、设计、UI 规范、代码规范、验收和变更记录保持一致。

## 8. 发布门禁

最终验证记录见 [`docs/FINAL_VERIFICATION.md`](FINAL_VERIFICATION.md)。

发布前必须保存以下证据：

1. `make verify` 完整通过记录。
2. `docs/UI_SPEC.md` PR 与 nightly 矩阵的深浅色截图和几何报告。
3. 首次进入、搜索重排、favicon 到达、热更新和主题切换的动效录像。
4. 60Hz 与 165Hz Performance trace 和 rAF 采样结果。
5. private/public/failure 三条跳转路径的集成测试。
6. 合法与非法热加载测试。
7. `-f`、`configpath` 和默认路径测试。
8. 二进制版本信息和产物哈希。
9. `docs/CHANGELOG.md` 已包含本次交付条目。
10. Favicon 自动发现、本地缓存、安全限制和 storage 降级测试。
11. Go/TypeScript 弃用检查、race、govulncheck 和生产依赖 audit 报告。
12. `docs/CODING_STANDARDS.md` 的 Code Review 清单已逐项确认。
13. 手机、平板、桌面、超宽屏、横竖屏、zoom 和真实设备 smoke 记录。
14. Storybook component states、跨浏览器视觉结果和 baseline 人工审查记录。
