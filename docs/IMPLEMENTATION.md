# 开发与验证

## 工作方式

用户入口与运行示例见根目录 README；协议见 [DESIGN.md](DESIGN.md)，界面约定见 [UI_SPEC.md](UI_SPEC.md)。修改行为时只更新受影响的契约和回归测试，不再同步实施计划、验收清单和重复变更流水。历史记录位于 `docs/archive/`，不作为当前路径或命令依据。本轮验收见 [ACCEPTANCE.md](ACCEPTANCE.md)。

- Go 按现有 `internal` 模块分工，保持显式依赖；前端按功能组织，共享 API 边界用 Zod 校验。
- YAML 字段保持 snake_case，JSON 保持 camelCase，避免为了统一外观而破坏已有配置。
- goroutine、订阅、timer、文件及响应体须有明确释放路径；外部 I/O 有超时及并发上限。
- 不把请求取消当作目标不可达的永久证据，不用可变化 URL 搭配 immutable 缓存。
- 不回写 YAML；图标目录只存可重建缓存。日志避免输出 URL 查询参数、用户凭证和原始远端响应。
- TypeScript 保持严格类型，不以 any、非空断言或 lint suppression 绕过问题。
- 修 bug 添加能复现失败路径的测试；不要用静态截图或高覆盖率替代真实后端集成测试。
- 不进行无理由依赖升级。升级时核对官方迁移说明、弃用信息与漏洞扫描结果。

## 命名与可维护性

- 业务变量表达对象与含义，例如 `requestPath`、`usernameHash`、`expiresAt`；函数名表达具体动作，布尔值表达判断。避免 `a/b/c`、`tmp` 等含糊名称及无理由缩写。
- 遵循语言上下文：Go 接收者、短循环索引及 `err`、`ctx`，几何坐标 `x/y` 可保留惯用短名；同类 HTTP 处理器统一使用 `writer/request`。
- 多个有关联的返回值使用具名结构，尤其避免多个同类型位置参数或返回值；状态码和业务限制使用明确的常量。
- 函数按实际职责分段；认证、限流和会话存储各自拥有清楚的边界与锁范围。React 组件负责装配与展示，复杂状态和副作用放在所属应用或业务域的 hook。
- 复杂分支优先使用早返回或 `switch`，避免多层三元表达式。已有多个调用方的相同逻辑提取共享实现，不为减少行数制造无实际职责的抽象。
- 重构须验证原有行为，特别是并发数据所有权、认证边界、键盘焦点和订阅清理；不能仅以类型检查通过判定完成。

## 构建与自动验证

版本要求以 `go.mod`、`web/package.json` 的 engines 为准。CI/CD 直接编排以下 Go 和 npm 命令，均从仓库根执行。先安装依赖并生成前端资源，再执行需要嵌入资源的 Go 检查与构建。

```bash
go mod download
npm --prefix web ci
npm --prefix web run build
test -z "$(gofmt -l cmd internal web/embed.go)"
# 明确列出 Go 源码目录，避免 ./... 扫进 node_modules 中第三方 Go 文件。
go test ./internal/... ./cmd/... ./web
go test -race ./internal/... ./cmd/... ./web
go vet ./internal/... ./cmd/... ./web
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run test
VERSION=${VERSION:-dev}
COMMIT=${COMMIT:-$(git rev-parse --short HEAD)}
BUILD_TIME=${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
CGO_ENABLED=0 go build -trimpath -buildvcs=false \
  -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT} -X main.buildTime=${BUILD_TIME}" \
  -o bin/navi ./cmd/navi
./bin/navi --version
```

默认检查包括上述格式、静态检查、类型检查、单元测试、race 和生产构建。浏览器与 Storybook 检查单独执行；浏览器测试前需安装浏览器二进制：

```bash
(cd web && npx playwright install)
npm --prefix web run storybook:test
npm --prefix web run test:e2e
npm --prefix web run test:visual
npm --prefix web run test:production
```

Staticcheck、Govulncheck 和 npm audit 可另行执行，需要预先安装对应 Go 工具并联网访问漏洞数据库。未安装或无法联网必须报告“未执行”，不能记为零漏洞。沙箱内测试需要允许本机监听端口及浏览器启动；Go 构建缓存需可写。

Vite 开发服务器提供预登录的固定 fixture，`test:e2e`/`test:visual` 用它验证前端交互与布局。`test:production` 先构建嵌入资源，再在临时目录构建和运行真实 Go 二进制，覆盖真实登录、错误密码、会话持久化、退出撤销、未认证 API 拦截、登录页手机布局与无障碍，以及 CSP、private/public 跳转、失败后重新探测、YAML 原子热更新/非法更新恢复，以及关闭目录监听时的磁盘故障提示和图标恢复；三浏览器各执行同一组用例，不 mock API。临时进程和目录由 fixture 自动清理，退出码也纳入检查。

## 发布前手工检查

- 临时配置启动二进制，检查未登录重定向、错误密码、正确登录、退出后的 API 401、health、已认证 catalog、实际卡片跳转及关闭。
- 合法 YAML 普通保存/原子替换能热加载；非法 YAML 保留最近有效内容并提示；修复后恢复。
- private 成功、private 失败 public 成功、全部失败；注意浏览器与服务器网络可能不同。
- 空缓存首次图标失败后能随后台事件出现，重启后使用缓存；关闭 catalog.watch 时图标仍可到达。
- 检查真机触控、200%/400% 缩放、高 DPI、reduced motion 和高刷新率；截图与视觉差异需人工确认。
- 容器使用目录挂载，配置监听 0.0.0.0，验证 UID 65532 缓存写权限、代理认证和 SSE。
