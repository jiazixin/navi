# 历史验证记录

以下记录仅供追溯，其中路径、命令和结果不代表当前版本。当前入口见 [开发说明](../IMPLEMENTATION.md)。

## 历史检查（2026-09-10，认证功能加入前）

已修复：探测排队/合并等待超时与取消缓存、3 次重定向边界、SSE 重连补拉/混合事件溢出、HEAD SSE 长时间占用连接、favicon 缓存重新验证/失败后重试/周期维护、关闭目录监听时的图标事件、Unicode 长度协议不一致、localStorage 异常白屏、空 storage 与不可路由 health.uri 校验、关闭超时后强制释放连接。

部署前收尾已完成原先四项改进：统一跳转失败页与即时重试、根图标回退、运行时缓存降级/恢复通知、真实生产二进制三浏览器集成。另将内联主题初始化移入生产模块，关闭 Zod JIT 以遵守严格 CSP；`configs/config.example.yaml` 已补充每个字段的中文用途、默认值、约束和部署说明，并通过测试核对示例与默认配置一致。

最终自动验证（本机 Go 1.27.0 / Node 26.7.0）：

| 检查 | 结果 |
| --- | --- |
| Go race、vet、Staticcheck | 通过 |
| Vitest | 76 项通过 |
| Chromium / Firefox / WebKit 常规 E2E | 51 项通过 |
| 视觉回归 | 26 项通过，未改截图基线 |
| 生产二进制三浏览器集成 | 12 项通过 |
| ESLint、TypeScript、生产构建、Storybook 构建 | 通过 |
| Govulncheck / npm 生产依赖审计 | 均无漏洞告警 |
| `git diff --check` | 通过 |

依赖 `golang.org/x/net` 从 v0.55.0 升至 v0.56.0，必要间接依赖 `x/sys` 升至 v0.46.0；最低 Go 版本仍为 1.25。升级清除了未使用的 dnsmessage 包中的 GO-2026-5942 模块告警，升级后重新通过 Go 和生产集成测试。

Storybook 在本机 Node 26 下仍有第三方 `module.register()` 弃用提示及开发产物体积提示，构建成功；不影响已验证的生产包。Docker 和真机检查由项目负责人自行完成，本记录不代表这些环境已经验收。

## 账号认证验证（2026-09-12～13）

最初新增必填 `auth.username/password`（后续改为可选，见下文）、服务端会话与路由保护、登录/退出接口、登录页及会话复查。配置示例、双语 README、设计协议和 UI 规范同步更新。当时要求现有部署补充认证配置；现行规则见下文。

- Go 功能测试、race 和 vet 通过；覆盖未认证访问、错误密码、限流、跨站请求拒绝、Cookie 属性、退出撤销和过期。
- Vitest 78 项通过，ESLint、TypeScript、生产构建、Storybook 构建通过；二进制构建 和二进制版本命令通过。
- 真实生产三浏览器集成 18 项通过，包括约 30 秒后的会话失效回退。最终会话协议校验调整后，三浏览器完整登录/退出流程再验证通过。
- 常规 E2E 首轮 50/51 通过；Firefox 动画采样用例在多套浏览器并行时采样不足，单独复跑通过，未放宽断言。
- 视觉检查 26 项通过；人工检查桌面/手机及顶栏差异后，为新增退出按钮更新 25 张基线。登录页另检查桌面、320px 手机布局和 axe serious/critical 零问题。
- 集成 fixture 在终止服务前关闭浏览器上下文，释放浏览器预连接，避免 2 秒测试关闭期限内残留未发送请求的连接。持久 SSE 的正常关闭仍由 Go 生命周期测试验证。
- `git diff --check` 通过。本轮未运行 Staticcheck、Govulncheck、npm audit、Docker 和真机检查；前文历史审计结果不代表本轮执行。


## 可选认证调整（2026-09-13）

账号密码同时为空或省略 auth 时直接进入首页，API、图标与跳转也无需会话，隐藏退出登录入口；两者同时配置才启用认证，单项配置或纯空白凭证报错。认证模式加载期间不展示登录表单。当前 configs/config.yaml 已有的账号密码保留，config.example.yaml 默认留空。

本次通过：Go 全部功能测试、认证/配置 race、go vet、79 项 Vitest、ESLint、TypeScript 和生产构建；真实 Go 服务下 Chromium/Firefox/WebKit 共 6 项用例覆盖已启用与已关闭认证的完整访问流程。未重新运行不受此调整影响的全量视觉及其他导航 E2E。

## 目录基线与迁移验证（2026-09-17）

通用规范位于根目录 [DIRECTORY_STRUCTURE.md](../DIRECTORY_STRUCTURE.md)，项目具体布局和升级方式见 README。`ui/` 已合并到 `web/`；运行 YAML 位于 `configs/`；可执行文件输出到 `bin/navi`。旧测试、静态检查入口 会先构建嵌入资源，避免依赖旧产物。初始化运行配置需从两份 example 文件复制，本地文件不参与版本控制。现有缓存保持在根目录 `storage/`。

已验证 Go 测试、race、vet、Staticcheck；前端 ESLint、TypeScript、79 项单元测试、Storybook 测试构建、26 项视觉回归；Govulncheck 和生产依赖 npm audit 未发现漏洞。Staticcheck/Govulncheck 本次通过 `go run honnef.co/go/tools/cmd/staticcheck@latest` 和 `go run golang.org/x/vuln/cmd/govulncheck@latest` 执行，未修改项目依赖。

实际启动检查在隔离临时目录进行：不传 `-f` 时发现 `configs/config.yaml`，健康检查、嵌入首页和目录 API 正常，缓存落在配置目录外的 `storage/favicons`。测试修复包括：示例配置测试从受版本控制的两份示例初始化临时文件，消除对本地 urls.yaml 的依赖；浏览器几何断言先等待搜索框可见，消除异步首次渲染时序问题。未修改视觉基线。

干净副本排除了本地配置、node_modules、dist、缓存及测试报告，重新执行 依赖安装、测试、二进制构建 全部通过。三浏览器前端端到端测试修复后 51 项通过，真实后端生产集成测试 21 项通过。

Dockerfile 的复制路径已同步，但本机 Docker 守护进程未运行，容器构建和容器运行未验证。
