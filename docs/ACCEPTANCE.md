# 界面重构验收（2026-10-16）

本轮把 Web 前端整体重构为「等高 / Contour」设计（动态 Canvas 纹样、四种色调、JetBrains Mono 显示字体、站内与外部合一的搜索、快速搜索、分区目录），并同步调整后端外观配置与关闭流程。项目尚未上线，按用户授权不保留旧主题、旧纹样或旧接口的兼容代码。以下结果均来自本轮在最终代码上实际执行的检查，不沿用历史记录。

结论：源码检查、单元测试、三浏览器 E2E、视觉基线、真实 Go 二进制三浏览器集成、前后端构建均通过。容器、真机和线上 HTTPS 代理未验证。

## 变更范围

| 范围 | 内容 |
| --- | --- |
| 前端 | 删除旧 UI（主题菜单、9 种纹样、分页、顶栏筛选、搜索弹层等）并按新设计重写；保留并沿用目录/状态/认证 API 客户端、SSE 订阅、外部搜索 provider 与图标 |
| 外观配置 | `theme` 改为 `default/ink/paper/celadon/dusk`，`background_pattern` 改为 `none/contour/flow/guilloche/stars/ridge`（默认 contour）；三项外观默认值不再出现在 `/api/catalog`，改为注入页面根元素，登录页与失败页首帧即可使用 |
| 关闭流程 | 新增 `internal/app/connections.go`：关闭时立即关闭从未发出请求的预连接，避免浏览器预开的空闲连接拖过 `shutdown_timeout`（Firefox 集成测试据此稳定复现并修复，附 Go 回归测试） |
| 构建 | 新增 `@fontsource-variable/jetbrains-mono`，移除未再使用的 `motion`；`assetsInlineLimit: 0`，避免 `data:` 字体被 CSP 拒绝 |
| 本地配置 | 未提交的 `configs/config.local.yaml` 中旧值 `violet-lime`/`star-trails` 会导致启动失败，已改为 `dusk`/`stars`，其余内容未动 |

## 审查方式

- Go 修改前按 `use-modern-go` CLI（Go 1.27 规则）列出准则并遵循。
- `open-code-review-delegate`：`ocr delegate preview`（v1.12.13）选出 75 个可审查文件，按 5 组规则（Go、TS/React、CSS、YAML/JSON 键、package.json）逐文件审查，覆盖率 100%；工具默认排除的测试、文档、快照与锁文件另行检查。审查发现并已修复：首屏搜索 Tab 离开后结果层遮住引擎行、快速搜索点击链接后不关闭、聚光效果每次指针移动读取全部卡片布局（改为每帧一次）、`/go/` 与 `/api/icons/` 路径重复硬编码、嵌套三元表达式。未保留已确认未修复的问题。
- E2E 期间另发现并修复：页标签高度不足 44px、`<time>` 上禁止的 `aria-label`、装饰遮罩造成的窄屏横向溢出（改为限制遮罩范围，而非隐藏溢出）。

## 实际验证

环境：macOS arm64；Go 1.27.2、Node 26.12.0、npm 11.20.0、Playwright 1.62.1（本轮安装项目对应的 Chromium、Firefox、WebKit）。命令从仓库根执行，Go 检查在生成 `web/dist` 后运行。

| 命令 / 检查 | 结果 |
| --- | --- |
| `npm --prefix web run lint`、`npm --prefix web run typecheck` | 通过 |
| `npm --prefix web run test` | 20 个测试文件、100 项通过；语句 95.97%、分支 86.1%、函数 96.85%、行 97.18%（门槛未调整） |
| `npm --prefix web run test:e2e` | Chromium、Firefox、WebKit 共 42 项通过 |
| `npm --prefix web run test:visual` | 16 项通过；基线本轮重新生成（旧 UI 基线已删除），逐张人工查看后接受 |
| `npm --prefix web run test:production` | 真实 Go 二进制三浏览器共 21 项通过（修复关闭流程前 Firefox 稳定失败 2–3 项） |
| `npm --prefix web run storybook:test` | 测试模式构建通过 |
| `npm --prefix web run build` | 通过；JS 361 kB（gzip 114 kB）、CSS 37 kB；字体以独立 woff2 文件输出，无 `data:` 资源 |
| `gofmt -l cmd internal web/embed.go`、`go mod verify` | 无格式问题；模块校验通过 |
| `go test`、`go test -race`、`go vet`（`./internal/... ./cmd/... ./web`） | 全部通过 |
| 手工运行 `bin/navi` | 合成配置（含/不含认证）下首页、登录页、目录、图标 404 回退与 CSP 无报错；全部色调与纹样、桌面 1280/1440 与移动 375/390 人工查看 |

E2E 覆盖：首屏与分区目录、所有可见按钮 ≥44px、卡片入场后不透明与跳转、首屏搜索与外部搜索、⌘K 快速搜索与焦点恢复、页签切换与记忆、外观面板切换与持久化、五种纹样在动态/静态下均绘制像素、纹样不拦截输入、降级提示、加载失败重试、1000 链接、320/390/768 视口无横向溢出及 axe 无 serious/critical 问题。

## 未执行与部署前剩余检查

- 未执行镜像构建、容器启动与 UID 65532 挂载读写。
- 未执行真机触控、高 DPI、高刷新率、200%/400% 浏览器缩放；纹样的 CPU/电量占用未做设备基准测试。
- 未在线上 HTTPS 反向代理验证 Secure Cookie、Host 转发与 SSE 长连接。
- 本轮未执行 `staticcheck`、`govulncheck` 与 `npm audit`。
- 仓库无已配置 CI；以上为本机结果。
