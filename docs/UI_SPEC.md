# Navi UI 组件与响应式规范

状态：强制执行基线  
版本：1.1.0
日期：2026-08-03

## 1. 目的

Navi 的唯一核心产品目标是 UI/UX 质量。本规范把“好看、自然、一致、适配各种屏幕”
转化为可实现、可测量、可验收的组件与布局契约。

所有 UI 实现、Story、截图基线、响应式测试和代码审查都必须遵循本文件。不得在单个组件
中临时添加魔法数字来修复某一分辨率；发现例外时先修正 token、容器规则或组件契约。

最低参考依据：

- [WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- [WCAG 2.2 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
- [WCAG 2.2 Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [web.dev Responsive Web Design](https://web.dev/learn/design/)
- [Playwright Emulation](https://playwright.dev/docs/emulation)
- [Playwright Projects](https://playwright.dev/docs/test-projects)
- [Storybook Stories](https://storybook.js.org/docs/writing-stories)
- [Storybook Visual Tests](https://storybook.js.org/docs/writing-tests/visual-testing)

项目标准可以高于最低标准，不能低于最低标准。

## 2. 支持范围

### 2.1 视口

必须支持宽度 `320-5120 CSS px`，高度 `256-2880 CSS px`。内容区域在超宽屏中保持
最大宽度和可读密度，不把卡片无限拉宽。

布局模式名称只用于设计和测试，不用于判断具体设备品牌：

| 模式 | 宽度 | 页面 gutter | 典型场景 |
| --- | ---: | ---: | --- |
| compact | 320-479px | 16px | 小屏手机、桌面窄窗口、400% zoom |
| phone | 480-767px | 16px | 大屏手机、手机横屏、窄分屏 |
| tablet | 768-1023px | 24px | 平板竖屏、桌面分屏 |
| desktop | 1024-1439px | 32px | 笔记本、平板横屏 |
| wide | 1440-1919px | 32px | 标准桌面 |
| ultrawide | 1920px 以上 | 40px | 2K、4K、5K、超宽屏 |

主内容最大宽度为 `1440px`。超过该宽度后居中，不能通过放大字体或无限增加列数填满屏幕。

### 2.2 显示与输入环境

必须覆盖：

- DPR：1、1.25、1.5、2、3。
- 浏览器缩放：80%、100%、125%、150%、200%、400%。
- 方向：portrait、landscape，以及运行中切换方向。
- 输入：鼠标、触控板、键盘、触控、粗指针、无 hover。
- 色彩：深色、浅色、系统切换、forced-colors/high contrast。
- 动效：标准、reduced motion。
- 浏览器：Chromium、Firefox、WebKit；产品支持 Chrome、Firefox、Safari、Edge
  当前稳定版和前一个稳定版，发布前补充真实浏览器 smoke。
- 系统显示缩放：Windows 125%/150%、macOS Retina、移动设备高 DPR。
- 安全区域：刘海、圆角屏、iOS 底部 home indicator。
- 窗口场景：全屏、桌面自由缩放、平板分屏、浏览器侧栏占用空间。

## 3. 设计令牌

### 3.1 间距

所有外边距、内边距和 gap 必须来自 4px 基础网格：

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
```

禁止在组件 CSS 中出现 `13px`、`17px`、`23px` 等未定义间距。1px 仅用于边框和
像素对齐，不作为布局 gap。

垂直节奏：

| 关系 | compact/phone | tablet | desktop/wide |
| --- | ---: | ---: | ---: |
| Top bar 到首个分组 | 24px | 32px | 32px |
| 分组之间 | 32px | 40px | 40px |
| 分组标题到卡片 Grid | 12px | 12px | 16px |
| 卡片 Grid gap | 12px | 12px | 12px |
| 页面底部安全留白 | 32px | 48px | 64px |

相同层级在同一模式中必须使用相同上下间距。不得因为某个分组有更多卡片就改变标题上下间距。

### 3.2 尺寸

```css
--radius-control: 6px;
--radius-card: 8px;
--border-width: 1px;
--topbar-height: 56px;
--control-height: 40px;
--touch-target: 44px;
--link-card-height: 88px;
--link-icon-size: 36px;
--content-max-width: 1440px;
```

`--link-card-height` 是标准模式最小高度，不是强制裁切高度。在 200%/400% zoom、
更大系统字体或内容需要换行时组件必须向下增长，不能截断必要内容或与下一行重叠。

### 3.3 排版

| Token | 字号/行高 | 用途 |
| --- | --- | --- |
| site-title | 16px/24px, 600 | 顶栏站点名 |
| group-title | 15px/20px, 600 | 分组标题 |
| card-title | 14px/20px, 600 | 链接名称 |
| body | 14px/20px, 400 | 描述、空状态 |
| meta | 12px/16px, 500 | 数量、状态、辅助信息 |

- 字间距始终为 0。
- 不使用 vw、clamp 或 viewport width 改变字体大小。
- 普通模式下链接名称最多两行；secondary text 最多一行。
- 组件的可访问名称必须保留完整文本。
- compact、文字放大或长词场景允许卡片增高，不允许文字覆盖图标或相邻卡片。
- 英文长词使用 `overflow-wrap: anywhere`；URL 不直接作为卡片主文字。

### 3.4 层级

```css
--z-base: 0;
--z-sticky: 10;
--z-banner: 20;
--z-overlay: 30;
--z-dialog: 40;
--z-toast: 50;
```

禁止组件自行使用 9999 等任意 z-index。每个 overlay 必须有明确关闭路径、焦点管理和
滚动策略。

### 3.5 浮层表面

```css
--floating-surface: var(--surface);
--floating-surface-border: var(--border);
```

- 所有 `menu`、`listbox` 和 `popover` 使用同一不透明 floating surface；computed background
  alpha 必须为 `1`，边界使用 `--floating-surface-border`，阴影使用 `--shadow-menu`。
- floating surface 不使用 `backdrop-filter`，不得在组件内用 `color-mix(..., transparent)`
  降低背景 alpha。`z-index` 只决定绘制顺序，不负责遮蔽后方内容。
- 搜索椭圆与顶栏属于常驻材质，可继续使用受控透明和 blur；全屏搜索 dialog 使用独立 overlay
  token。菜单中的色样/纹样缩略图只能在不透明父面板内部使用透明层。

## 4. 响应式布局规则

### 4.1 App Shell

- 使用 `min-height: 100dvh`，并为不支持动态 viewport unit 的浏览器提供合理 fallback。
- 页面 padding 使用逻辑属性和 viewport 模式 gutter。
- 顶部、左右、底部加入 `env(safe-area-inset-*)`。
- 页面级 `overflow-x` 不得隐藏布局错误；根节点必须自然满足
  `scrollWidth <= clientWidth`。
- 使用 `scrollbar-gutter: stable` 避免滚动条出现导致横向抖动。
- 固定/粘性顶栏不能遮挡锚点、搜索结果或键盘焦点。

### 4.2 内容 Grid

链接 Grid 使用内容驱动的自动列，不用设备品牌断点硬编码列数：

```css
.linkGrid {
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(min(100%, 272px), 1fr)
  );
  gap: var(--space-3);
  align-items: stretch;
}
```

- 每列最小宽度 272px；空间不足时自动回到单列。
- 最大内容宽度限制列数，超宽屏不能出现过宽卡片。
- 同一行卡片宽度与高度视觉一致；内容变长时该行按最高卡片伸展。
- Grid item、flex child 和文字容器必须设置正确 `min-width: 0`。
- 不依赖 JavaScript 计算列数。
- 组件内部响应优先使用 container query，页面结构才使用 viewport media query。

### 4.3 顶栏响应

- tablet 及以上：单行 56px，左侧标题、中部搜索、右侧状态与主题命令。
- phone/compact：保持单行 56px，不把控件挤成两行；隐藏常驻搜索框，保留 44x44
  搜索命令，点击后打开搜索 overlay。
- 标题区域可收缩且 `min-width: 0`；标题省略不能推动右侧命令出屏。
- 所有命令触控目标至少 44x44，视觉图标可为 18-20px。
- 顶栏高度不因某个状态图标、网络状态或语言改变。

### 4.4 横竖屏与运行时变化

- orientation change、窗口拖动和分屏调整时不能整页刷新。
- 正在输入的搜索词、焦点、滚动位置、主题和 SSE 连接状态必须保留。
- 布局变化使用既有 motion token；大规模 resize 期间简化动画，避免每帧运行弹簧。
- mobile landscape 高度较小时，overlay 使用可滚动内容，不让关闭按钮离开视口。

## 5. 组件契约

每个组件必须有 Storybook stories，覆盖默认、边界、交互、主题和异常状态。组件不得在
story 之外依赖真实网络或全局应用环境。

### 5.1 TopBar

| 属性 | 规定 |
| --- | --- |
| 高度 | 56px + 顶部 safe area |
| 水平 padding | 使用页面 gutter，不另加随机偏移 |
| 内容对齐 | 所有主控件垂直中心对齐，误差 <= 0.5 CSS px |
| 标题 | 16/24，单行省略，完整 accessible name |
| 控件 | 44x44 target，图标 18-20px |
| 控件顺序 | 移动搜索、刷新、主题、背景纹样；背景纹样必须紧随主题 |
| 状态 | default、scrolled、degraded、search-open、主题菜单打开、纹样菜单打开、全部主题与纹样 |
| 禁止 | 两行换行、控件宽度随状态抖动、透明 blur 导致文字不可读 |

### 5.2 UniversalSearch、SearchField 与 SearchOverlay

UniversalSearch 是顶栏和目录之间的开放式外部搜索工作台：

| 属性 | 规定 |
| --- | --- |
| 外层 | 透明连续画布，由全页 BackgroundPattern 提供低对比纹样；无独立实色色带、大卡片、营销标题、图片、渐变光球或 bokeh |
| 高度 | desktop/tablet `clamp(330px, 40vh, 460px)`；phone 由内容决定 |
| 内容宽度 | 最大 960px，居中，与页面 gutter 保持一致 |
| 主搜索器 | 椭圆；desktop 静止约 640px、pointer-held/focus/menu-open 约 820px，高 72px；phone 宽 100%、高 60px；圆角始终 999px |
| 输入材质 | 低透明表面、1px 边界、内高光、有限阴影；支持时 blur 18-24px，不支持时使用不透明 surface fallback |
| 当前 provider | 左侧 52x52px 圆形稳定徽章，phone 44x44px；核心背景固定 `#f8fafc`、边界固定 `#cbd5e1`，内部只有一个居中的 21-24px 品牌 SVG，不显示名称前缀、小箭头或角标；主题切换时背景、边界和图标不换色、不闪烁 |
| provider | 网页：百度、Google、Yandex、Bing 国际版、GitHub；模型：ChatGPT、Claude、Gemini |
| 配置/API | `web_search` / 根级 `webSearch`；默认 `baidu`；当前会话切换不持久化，刷新回到配置值 |
| 提交 | trim 后非空查询；按钮与 Enter 等价；新标签页打开，使用 `noopener,noreferrer` |
| 提交配色 | 52x52px/44x44px 圆形单层主题按钮；背景使用 `accent`、放大镜使用 `accent-contrast`，背景、边界、图标、阴影和 transform 使用搜索组件既有短动效；不增加专用主题状态、额外 DOM 或脚本 |
| 模型降级 | Claude/Gemini 先打开官方页再尝试复制问题；成功/失败均通过固定高度 `role=status` 告知 |
| 品牌图标 | 8 个 provider 均有 SVG 品牌图标；百度使用保留官方爪印外轮廓、去除 21/24px 不可辨微字的几何版本；Google 固定使用蓝/绿/黄/红四色 G；Gemini 使用 `#FC413D`、`#FBBC04`、`#00B95C`、`#3186FF` 四向混合的渐变星形，18/24px 下四种颜色均可辨。其余 provider 的单色变量定义并消费在同一 SVG。菜单图标容器 30px、图标 18px；品牌色仅限图标本体，禁止继承主题文字色 |
| 选择器 | 当前图标按钮打开单个 `menu`；网页/模型分组包含 8 个 `menuitemradio`，单项高 48px；菜单 accessible name 为“选择搜索入口” |
| 选择器表面 | 使用共享不透明 floating surface、共享边界与菜单阴影；不得继承输入椭圆的 blur 或透明材质 |
| 指针展开 | mouse pointer-enter 启动 8000ms 展开窗口；pointer-leave 不收回；再次 pointer-enter 重新计时；计时结束且无 focus/menu-open 时自动收回；组件卸载必须清理 timer |
| 伸缩动效 | Motion FLIP/layout animation；展开 220ms `cubic-bezier(0,0,0.38,0.9)`，收回 180ms `cubic-bezier(0.2,0,0.38,0.9)`；无 spring、回弹或恒速 linear；高度、半径和内部控件位置稳定；reduced motion 下立即完成；phone 不伸缩 |
| 状态 | empty、pointer-held、focused-expanded、menu-open、typing、provider-selected、submitting、copied、clipboard-failed、reduced-motion |
| 禁止 | 名称宽度改变输入几何、直接动画 width、角色或挂件装饰、随机环境动画、provider 品牌色污染主题、provider SVG 继承主题文字色、把 Google/Gemini 压成单色、在当前 provider 图标上叠放小箭头或角标、provider 徽章执行主题颜色过渡、为单个控件增加专用主题生命周期、装饰性光球、嵌套卡片、胶囊云、自动提交空值、静默丢失查询 |

SearchField 与 SearchOverlay 继续只筛选当前页的本地导航内容：

| 属性 | 规定 |
| --- | --- |
| 桌面尺寸 | 高 40px，宽 360-520px，不能挤压左右区域 |
| 移动端 | 顶栏按钮打开 overlay；overlay 使用 16px gutter 和 safe area |
| 输入 padding | inline 12px，图标与文字 gap 8px |
| 状态 | empty、typing、results、no-results、loading、error、focused |
| 键盘 | `/`、`Ctrl/Cmd+K`、`Escape`、方向键和 Enter |
| 禁止 | 搜索时输入框宽度变化、结果更新导致焦点丢失、overlay 背景页面双滚动 |

### 5.3 BackgroundPattern 与 BackgroundPatternButton

| 属性 | 规定 |
| --- | --- |
| 配置字段 | `background_pattern`；默认 `meridian-grid` |
| API 字段 | 根级 `backgroundPattern`；缺失时前端按 `meridian-grid` 处理 |
| 选项 | 素幕、经纬阵、天游环、双鱼宫、天弓宫、回廊纹、玫瑰窗、八芒阵、星轨幕 |
| 图层 | `position: fixed`、全视口、顶栏下方、内容背后、`pointer-events: none` |
| 颜色 | 只消费当前主题 token；主线、辅线、节点至少分 3 个低透明层级 |
| 线宽 | 常规纹样 1-1.25 CSS px；星轨幕引导圆约 1.1px、三档轨迹约 1.3-1.55px；DPR 1/2/3 下保持清晰，不能出现高频摩尔纹 |
| 菜单 | 44x44 触发目标，位于主题之后；9 个带缩略预览的 `menuitemradio`；使用共享不透明 floating surface，页面纹样不得穿透菜单 |
| 状态 | configured、local override、none、switching、ambient、reduced-motion、全部 8 个主题组合 |
| 动效 | 八套线条纹样默认运行专属语义环境动效；周期使用 18s/36s/72s/108s ambient token；轨道、星轨描边和重复纹样允许 linear，双鱼、箭迹和经纬校准使用含停顿的长周期 easing；切换仍为 opacity crossfade |
| 星轨布局 | 圆心位于左下视口外侧；弧线主要占据左侧约 60% 与下方约 60%，右上保持安静；移动端使用左下对齐裁切，不能把视觉中心裁离屏幕 |
| 星轨对比 | 图层 opacity 约 0.86；慢速主轨最粗、快速轨次之、中速辅轨最细，引导圆继续低于轨迹；浅色与深色主题都必须清晰可见但不得压过正文和卡片边界 |
| reduced motion | 停止所有环境位移、旋转、描边和相位运动，并立即完成纹样切换；不提供额外静止配置或菜单开关 |
| 禁止 | 捕获指针、影响布局、独立色板、图片纹理、随机生成、Canvas/粒子、JS timer/逐帧循环、文字遮挡、横向溢出、所有纹样套用同一个旋转动作 |

### 5.4 PagePagination

| 属性 | 规定 |
| --- | --- |
| 位置 | 固定在视口底部中央，使用独立 `z-pagination` 层级，高于目录正文、低于 sticky 顶栏及其菜单、全屏搜索与对话层；无需滚到文档末尾即可使用。外层只负责定位且不截获空白区域指针，正文必须预留控件高度与安全区 |
| 控件 | 参考 Morphing Page Dots：无边框、无面板、无卡片阴影；Lucide `ChevronLeft` / `ChevronRight` 裸图标按钮 + 可直达页点；所有目标至少 44x44px |
| 状态 | 当前页使用 `aria-current="page"`；首尾方向按钮禁用；单页时不渲染分页占位 |
| 文案 | 图标按钮 accessible name 为“上一页/下一页”；页点包含页码与页面标题，触控不依赖 tooltip |
| 页点形变 | 非活动页为 6x6px 弱化圆点；活动页为约 22x7px 短横胶囊，使用共享 layout indicator 在目标之间平滑移动；切页时允许一次低透明外扩 ripple |
| 内容动效 | 根据目标页方向水平移动 24px，并在 220ms 内淡入淡出；进入与退出方向一致，不使用 spring 或回弹 |
| 指示器动效 | 280ms `cubic-bezier(0.22, 1, 0.36, 1)` tween；ripple 约 520ms，仅响应切页，不持续循环 |
| reduced motion | 取消内容水平位移、indicator 移动与 ripple，使用 instant token 完成状态切换 |
| 禁止 | 文字箭头、分页表面或边框、滚动到页尾后才可操作、遮挡最后一排卡片、分页导致正文宽度变化、切页后继续沿用旧页搜索词、只靠颜色表达当前页 |

### 5.5 GroupSection

| 属性 | 规定 |
| --- | --- |
| 外层 | 无卡片背景，无额外圆角容器 |
| 标题行 | 最小 28px，3px 主题刻度、标题与数量对齐；不使用横向分隔线 |
| 标题到 Grid | 使用统一 12/16px token |
| 分组间距 | 按模式统一 32/40px |
| 空分组 | YAML 当前模型不产生；若未来支持，必须有独立设计 |
| 禁止 | 第一个/最后一个分组使用不同内部 spacing、标题左右边缘与卡片不齐 |

### 5.6 LinkCard

| 属性 | 规定 |
| --- | --- |
| 最小高度 | 标准 104px；zoom/换行时可增长 |
| padding | 16px |
| radius/border | 8px / 1px |
| 内部布局 | icon 36px + gap 12px + min-width:0 文本 |
| secondary text | description；缺失时显示规范化 hostname；预留 2 行并最多显示 2 行 |
| 状态 | default、hover、focus-visible、pressed、opening、icon-loading、icon-error |
| 点击区域 | 整卡；键盘 Enter 可打开 |
| 对齐 | icon 顶部与文字首行视觉对齐，所有卡片使用相同内部 grid |
| 主题表达 | 默认边框保持中性；2px 短边缘刻度与图标底使用主题角色，hover/focus 才增强 |
| 禁止 | 因无 description 变矮、图标到达改变 padding、hover 改变 border 宽度、默认彩色描边 |

### 5.7 Favicon 与 Monogram

| 属性 | 规定 |
| --- | --- |
| 外框 | 固定 36x36，不随源图片尺寸变化；使用主题校准的低面积 icon token |
| 图片 | object-fit: contain，最大 28x28 可见内容 |
| 字标 | 同一 36x36 容器，字体和背景来自 token |
| 状态 | pending、cached、updated、invalid、offline |
| 动效 | 180ms crossfade，不改变容器 geometry |
| 禁止 | 图片撑破容器、透明图标不可见、失败图标占位尺寸不同 |

### 5.8 IconButton 与 Tooltip

| 属性 | 规定 |
| --- | --- |
| target | 最小 44x44 |
| visual icon | 18-20px |
| focus | 清晰 focus-visible，不因 border 增加改变尺寸 |
| tooltip | 只在 hover/focus 显示；触控不能依赖 tooltip 理解命令 |
| accessible name | 必填，不使用文件名或内部 key |

主题入口在 IconButton 契约上增加下拉菜单：宽度 272-336px，右对齐顶栏命令区；每项包含
稳定三色色样、主题名、短描述和当前项标记。菜单使用 `menu/menuitemradio` 语义，单项最小
高度 48px，移动端最大高度不得超出可见区并允许单轴滚动。打开菜单不得改变顶栏高度，
菜单表面保持中性，移动端固定在可视区安全边距内。不得使用胶囊标签、渐变色块、整项高
饱和填充或仅靠颜色表达选中状态。主题菜单与背景纹样、provider 菜单共享不透明 floating
surface、边界和阴影，不使用 backdrop blur。

### 5.9 StatusBanner

- 位于顶栏下方的正常文档流或稳定 sticky slot，不覆盖第一组内容。
- 最小高度 40px，padding 8px 16px，图标/文字/关闭命令垂直对齐。
- 长错误在 phone 换行，关闭按钮保持顶部对齐且可触达。
- 同一状态重复出现不改变页面上下间距。
- dismissed、degraded、restored、offline 都有 story 和测试。

### 5.10 LoadingSkeleton

- 骨架必须复制真实 GroupSection 和 LinkCard 的 geometry。
- icon、标题、secondary line 的位置与真实内容误差 <= 1 CSS px。
- 使用低幅 opacity 呼吸；reduced motion 下静止。
- 加载完成后 CLS 目标为 0，最大允许 0.02。

### 5.11 EmptyState 与 FailurePage

- 不包在装饰性大卡片中。
- phone 上水平 padding 16px，文字不超过可读宽度。
- FailurePage 的重试命令满足 44x44 target。
- 长链接名称、无 public URL、双端失败均不能造成溢出。

## 6. 统一状态矩阵

每个交互组件至少评估以下状态；不适用项必须在 story 中明确标记，而不是遗漏：

| 状态 | 必查内容 |
| --- | --- |
| default | 尺寸、对齐、文字、对比度 |
| hover | 不改变 geometry，不依赖 hover 才能使用 |
| focus-visible | 焦点不被 overflow 裁切 |
| active/pressed | 反馈及时，不造成相邻元素移动 |
| disabled | 仅真正不可用命令使用，仍可识别 |
| loading | 尺寸稳定、可取消或有明确等待 |
| error | 文案安全、可恢复、不会遮挡 |
| empty | 不产生残留分隔线或多余空白 |
| theme | 默认深浅与 7 个彩色主题结构完全一致，文本和焦点满足 AA |
| reduced-motion | 无位移、spring、scale 和 stagger |
| forced-colors | 控件、边框和焦点仍可识别 |
| coarse pointer | target >= 44x44，无 hover-only 行为 |

## 7. 测试数据矩阵

所有布局测试至少覆盖：

- 0 个链接。
- 1 个分组、1 个链接。
- 1 个分组、20 个链接。
- 30 个分组、500 个链接。
- 中文、英文、混合字符、emoji、全大写 initialism。
- 60 字符名称、40 字符分组、120 字符 description、无空格长词。
- 无 description、仅 private、仅 public、双 URL。
- favicon pending、cached、更新、404、损坏、透明、超宽、超高。
- 首次加载、慢加载、API error、SSE error、degraded、恢复。
- 搜索无结果、1 个结果、大量结果、输入法组合事件。
- 深色、浅色、reduced motion、forced-colors。

测试 fixture 必须确定性，不访问公共互联网。

## 8. 自动化视口矩阵

### 8.1 PR 阻断矩阵

每个 pull request 至少执行：

| 浏览器 | 视口 |
| --- | --- |
| Chromium | 320x256、320x568、390x844、768x1024、1024x768、1440x900、2560x1440 |
| WebKit | 390x844、820x1180、1440x900 |
| Firefox | 390x844、1024x768、1440x900 |

每个项目至少覆盖 dark/light；动效相关项目额外覆盖 reduced motion。

### 8.2 Nightly 完整矩阵

```text
320x256
320x568
360x800
375x812
390x844
412x915
430x932
844x390
600x960
768x1024
820x1180
1024x1366
1180x820
1366x1024
1024x768
1280x720
1280x800
1366x768
1440x900
1536x864
1920x1080
2560x1440
3440x1440
3840x2160
5120x1440
5120x2880
```

Nightly 在 Chromium 全矩阵运行，并在 Firefox/WebKit 选择 compact、tablet、desktop、
ultrawide 代表尺寸。DPR 至少抽样 1、1.25、1.5、2、3。

此外运行不截图的连续宽度几何扫描：

- 320-1920px 每 16px 一个宽度，固定代表性高度。
- 1920-5120px 每 64px 一个宽度，固定 1440px 高度。
- 每个宽度执行 overflow、overlap、alignment、gap、touch target 和 focus clipping 断言。

固定截图负责发现视觉变化，连续扫描负责发现两个常用 viewport 之间的断点缝隙。

### 8.3 发布前真实设备

至少手工 smoke：

- 一台小屏 iPhone 或等价 iOS Safari。
- 一台大屏 iPhone/Android Chrome。
- 一台 iPadOS Safari，覆盖竖屏、横屏和分屏。
- macOS Retina 的 Safari/Chrome。
- Windows 125% 或 150% display scaling 的 Chrome/Edge。
- 165Hz 桌面显示器的 Chrome。

真实设备结果记录设备、系统、浏览器、视口、DPR、方向和发现的问题。

## 9. 自动几何断言

Playwright 必须通过 DOM bounding box 和页面 metrics 自动断言：

- `document.documentElement.scrollWidth <= clientWidth`。
- 任意可见组件 bounding box 不超出 viewport/content container。
- TopBar、StatusBanner、GroupSection 和 LinkCard 之间没有非预期 overlap。
- 同一行卡片 left/right/top/bottom 对齐误差 <= 1 CSS px。
- 同一模式的重复 vertical gap 误差 <= 1 CSS px。
- Group title 与首列卡片左边缘误差 <= 0.5 CSS px。
- IconButton clickable box >= 44x44。
- Favicon box 始终 36x36。
- focus ring 不被 overflow、sticky header 或 viewport 裁切。
- 搜索 overlay 打开后背景没有第二条可滚动轴。
- 加载到真实内容 CLS <= 0.02。

几何断言失败不得通过提高截图 diff threshold 绕过。

## 10. 视觉回归

- 每个 shared UI component 在 Storybook 中有状态 stories。
- 视觉截图使用固定字体、固定时区、固定 locale、确定性 fixture 和关闭网络。
- 同一浏览器/OS 基线的 `maxDiffPixelRatio` 初始上限为 0.001；抗锯齿导致的必要调整
  必须精确到 story，不得全局放宽。
- 不跨不同浏览器共享像素基线；跨浏览器以几何断言和人工对比为主。
- 更新 baseline 前必须查看 before/after 和变更原因，禁止盲目执行 update snapshots。
- 对齐、间距、溢出、重叠、z-index、focus、文字换行变化视为高风险差异。
- 截图至少包含：默认首页、搜索结果、空结果、degraded、双端失败、移动搜索 overlay。

## 11. 缩放与 Reflow

- 1280 CSS px 宽视口在 400% 浏览器 zoom 下等价约 320 CSS px，页面必须回流为单列。
- 400% zoom 不允许同时出现横向和纵向二维滚动；数据表并不存在，因此不设例外。
- 200% text/页面 zoom 下所有文字、命令和状态仍可用，不能被固定高度裁切。
- 用户字体替换或字体加载失败时布局保持可用，fallback 字体不得引起控件重叠。
- 浏览器最小字号设置提高后，组件允许增高，不允许用 overflow hidden 隐藏重要内容。

## 12. QA 工作流

每次可见 UI 修改：

1. 确定受影响组件、状态和 viewport。
2. 先运行对应 Storybook component states。
3. 启动真实应用，检查页面 identity、非空、console、网络和框架 overlay。
4. 完成目标交互并检查 DOM 状态。
5. 运行 compact、tablet、desktop 至少三个 viewport。
6. 运行几何断言和视觉截图。
7. UI/动效修改运行 reduced motion；布局修改运行 200%/400% zoom。
8. 记录发现、修复和仍未测试的风险。

“构建成功”或“单个桌面截图正常”不能作为 UI 完成证据。

## 13. 发布门禁

以下任一情况阻止发布：

- 任意支持 viewport 出现非预期横向滚动、重叠、裁切或控件出屏。
- 相同层级的 padding、gap、圆角、字体、图标尺寸或状态反馈不一致。
- 手机、平板、桌面之一缺少真实或自动化测试证据。
- Chromium、Firefox、WebKit 任一阻断项目失败。
- 200%/400% zoom、横竖屏切换、触控或键盘流程不可用。
- Storybook state 缺失，或视觉 baseline 未人工审查。
- 几何断言通过容差放宽、隐藏 overflow 或设备特判绕过。
- Console 存在未解释 error/warn，或页面存在 layout shift、双滚动和焦点裁切。
