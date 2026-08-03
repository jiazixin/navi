# Navi 生产级代码规范

状态：强制执行基线  
版本：1.1.0  
日期：2026-08-01

## 1. 适用范围与优先级

本规范适用于 Navi 的 Go、React、TypeScript、CSS、YAML、测试、构建脚本和 CI。
所有实现、重构和代码审查都必须遵守，并同时满足 `docs/UI_SPEC.md`。发现规范与实际
依赖的最新官方建议冲突时，不得直接绕过；先在 `docs/CHANGELOG.md` 记录依据和决定，
再同步修改本规范。

参考来源以官方资料为主：

- [Organizing a Go module](https://go.dev/doc/modules/layout)
- [Effective Go](https://go.dev/doc/effective_go)
- [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments)
- [Go Doc Comments](https://go.dev/doc/comment)
- [React Rules](https://react.dev/reference/rules)
- [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks)
- [TypeScript strict](https://www.typescriptlang.org/tsconfig/strict.html)
- [typescript-eslint no-deprecated](https://typescript-eslint.io/rules/no-deprecated/)
- [Staticcheck SA1019](https://staticcheck.dev/docs/checks/#SA1019)
- [Go vulnerability management](https://go.dev/doc/security/vuln/)

官方资料没有规定唯一的 Go 仓库布局，也没有规定统一的 React 文件命名方式。本文件在
官方原则之上为 Navi 选定固定约定，以保证整个仓库一致、可搜索、可 lint、可维护。

## 2. 总体工程原则

- 正确性、可读性、可测试性、可观测性和可升级性优先于代码行数少。
- 优先使用标准库和现有依赖；新增依赖必须解决明确问题，并记录选择理由。
- 导航核心路径不得依赖未维护、已弃用、预发布或来源不清晰的包。
- 保持公开 API 最小；包内实现默认不导出。
- 通过清晰数据流和所有权控制复杂度，不用全局 service locator 或隐式注册。
- 不预先抽象未知需求。重复出现且具有相同变化原因后，才提取共享抽象。
- 不允许以 `utils`、`helpers`、`common`、`misc`、`base` 等无领域含义目录堆放代码。
- 不允许空 catch、静默忽略错误、无界重试、无界队列或无超时网络请求。
- 不为通过 lint 而关闭规则；例外必须足够窄并记录原因。

## 3. 仓库与模块组织

### 3.1 Go 目录

```text
cmd/navi/                 Thin executable entry point
internal/app/             Composition, startup, shutdown
internal/config/          Main configuration loading and validation
internal/catalog/         urls.yaml domain model, parsing, snapshots, watching
internal/favicon/         Discovery, validation, cache, refresh workers
internal/navigation/      Reachability probes and private/public resolution
internal/httpapi/         HTTP routes, middleware, response DTOs
ui/                       Embedded, generated frontend distribution
testdata/                 Stable fixtures shared by Go tests
```

规则：

- `cmd/navi/main.go` 只负责参数入口、调用 app 组合根和确定进程退出码。
- 业务逻辑不得放在 `main` package。
- 不能被模块外部导入的代码全部置于 `internal`。
- 第一版不创建 `pkg`；只有未来确实存在独立外部消费者时才考虑公开包。
- 每个目录只包含一个 package；测试可使用同包或 `package_name_test` 黑盒包。
- 类型放在拥有其不变量和行为的 package，不建立全局 `models` 目录。
- 依赖方向：
  - `cmd/navi -> internal/app`。
  - `internal/app` 是组合根，可以组装其他 internal package。
  - `internal/httpapi` 可以依赖 catalog、favicon 和 navigation 的最小契约。
  - catalog、favicon、navigation 不得反向依赖 httpapi 或 app。
  - config 不得依赖业务和传输层。
- package 之间用明确参数和小接口连接，禁止通过可变全局变量共享状态。
- 接口由消费者定义，通常保持 1-3 个方法；不要为每个 struct 机械创建接口。

### 3.2 前端目录

```text
web/
├── .storybook/           Storybook configuration and deterministic decorators
└── src/
    ├── app/              App shell, providers, routing
    ├── features/
    │   ├── catalog/      Catalog rendering and group presentation
    │   ├── navigation/   Link opening and failure states
    │   ├── search/       Search input, matching, result transitions
    │   ├── status/       SSE, reload and degraded states
    │   └── theme/        Theme preference and transition
    ├── motion/           Shared motion tokens and primitives
    ├── shared/
    │   ├── api/          Typed API client and runtime decoding
    │   ├── lib/          Domain-neutral, narrowly named utilities
    │   └── ui/           Truly shared visual primitives
    ├── styles/           Global tokens and reset
    └── main.tsx
```

规则：

- 按产品能力组织组件，不建立长期增长的单一 `components` 或 `hooks` 大目录。
- feature 内部实现默认私有；跨 feature 只通过明确的公开入口或 shared 层使用。
- 禁止循环依赖。
- 避免无选择地使用 `index.ts` barrel；跨边界优先直接导入，减少隐藏依赖和打包开销。
- 静态资源只放在一个明确资产目录；生成的 `ui/dist` 不手工编辑。
- shared UI 和 feature 级可视组件必须有同目录 `*.stories.tsx`。

## 4. 文件命名

### 4.1 Go 文件

- 文件名使用小写 ASCII，必要时使用下划线分词：`reload_state.go`。
- 禁止 CamelCase、PascalCase、空格和连字符文件名。
- 测试使用 `*_test.go`。
- 平台文件遵循 Go build suffix：`probe_linux.go`、`probe_windows.go`。
- 生成文件使用可识别后缀，例如 `catalog.gen.go`，文件头包含标准 generated 标记。
- 文件名表达主要职责：`loader.go`、`watcher.go`、`resolver.go`；
  禁止 `stuff.go`、`misc.go`、`implementation.go`。
- 不要求“一种类型一个文件”；以职责内聚和可导航性为准。

### 4.2 React 与 TypeScript 文件

官方 React 未规定统一文件命名，Navi 固定使用：

- React 组件：`PascalCase.tsx`，例如 `LinkCard.tsx`。
- Hook：`useCamelCase.ts`，例如 `useCatalogEvents.ts`。
- 普通模块：`camelCase.ts`，例如 `decodeCatalog.ts`。
- CSS Module：与组件同名的 `PascalCase.module.css`。
- 单元测试：与源文件同目录的 `*.test.ts` 或 `*.test.tsx`。
- Playwright：`web/tests/e2e/*.spec.ts`。
- Storybook：与组件同目录的 `ComponentName.stories.tsx`。
- 类型不单独堆入全局 `types.ts`；放在拥有它的 feature 或 API 边界。

### 4.3 配置与文档

- YAML 字段使用 `snake_case`，与现有配置保持一致。
- JSON API 字段使用 `lowerCamelCase`，符合 TypeScript 使用习惯。
- Markdown 文档使用大写语义文件名，与现有 `DESIGN.md` 等保持一致。
- 环境变量遵循已接受契约；`configpath` 保持用户指定的小写形式。

## 5. Go 命名

### 5.1 Package

- package 名短、小写、无下划线，表达单一能力：`catalog`、`favicon`、`httpapi`。
- package 名不得使用 `common`、`util`、`core` 等模糊词。
- 使用者代码应自然可读，避免重复：
  - 正确：`catalog.Loader`、`favicon.Manager`。
  - 错误：`catalog.CatalogLoader`、`favicon.FaviconManager`。

### 5.2 标识符

- 导出标识符使用 PascalCase，未导出标识符使用 camelCase。
- 常见首字母缩写保持一致：`URL`、`HTTP`、`API`、`ID`、`HTML`、`SSE`、
  `TLS`、`JSON`、`YAML`。
  - 正确：`publicURL`、`runtimeID`、`ServeHTTP`、`HTMLParser`。
  - 错误：`publicUrl`、`runtimeId`、`ServeHttp`、`HtmlParser`。
- 函数名使用动作语义：`LoadFile`、`Resolve`、`Refresh`、`ServeIcon`。
- 类型名使用名词：`Loader`、`Snapshot`、`Resolver`、`ValidationError`。
- 布尔值使用可直接判断的正向含义：`enabled`、`reachable`、`hasSnapshot`。
- 不给 getter 加 `Get`：使用 `Snapshot()`，不是 `GetSnapshot()`。
- 构造函数使用 `New` 或 `NewType`，只在确有多种构造语义时增加后缀。
- receiver 使用 1-2 个与类型对应的字母并在 package 内保持一致，例如
  `s *Store`、`m *Manager`；禁止 `this` 和 `self`。
- 避免无意义短名；循环索引和极小局部作用域可以使用 `i`、`n`。
- 不在接口前添加 `I`；接口通常按行为命名，例如 `Reader`、`Resolver`。

### 5.3 注释与文档

- 所有导出的 package、type、func、method、const、var 都必须有符合 Go doc 的注释。
- 导出标识符注释以标识符名称开头，并描述契约而不是重复代码。
- package comment 放在 `doc.go` 或主要文件中。
- 复杂并发所有权、缓存失效和安全边界必须有简短设计注释。
- 禁止逐行翻译代码的无价值注释。
- TODO 必须包含可追踪编号或负责人和原因，禁止裸 `TODO`。

## 6. Go 实现规则

### 6.1 Context 与生命周期

- `context.Context` 是需要它的函数第一个参数，不存入长期存活 struct。
- 所有 I/O、探测、关闭和 worker 操作都接受取消信号。
- 每个启动的 goroutine 都必须有明确 owner、停止条件和测试。
- 使用 `errgroup` 或等价结构传播并发错误；禁止 fire-and-forget goroutine。
- channel 由发送方/owner 关闭；接收方不得随意关闭共享 channel。

### 6.2 错误

- 错误字符串小写开头、无句号，因为上层可能添加上下文。
- 使用 `fmt.Errorf("load catalog: %w", err)` 保留错误链。
- 只有调用方需要 `errors.Is` 时才定义 sentinel error。
- 需要携带字段路径、状态或用户安全信息时定义 typed error。
- HTTP handler 不直接返回内部错误文本；通过统一映射生成安全响应。
- 除真正不可恢复的程序员错误外不使用 panic；配置、文件、网络和请求错误都正常返回。
- 禁止 `_ = err`；明确处理或在代码中说明为什么安全忽略。

### 6.3 API 与数据

- 输入在边界完整验证，内部函数接收已验证的领域值。
- 时间统一使用 `time.Time` 和 `time.Duration`；测试注入 clock，不散落
  `time.Now()`。
- URL 使用 `net/url` 解析和规范化，不用字符串拼接。
- HTTP 状态、方法和 header 使用标准库常量。
- 文件路径使用 `filepath`，不手工拼接 `/`。
- 临时文件与目标文件位于同一目录，校验完成后原子 rename。
- 响应体、文件、timer、ticker 和取消函数的所有权必须清晰并正确释放。

### 6.4 日志与可观测性

- 使用标准库结构化日志 `log/slog`。
- 日志消息简短稳定，动态值放属性；属性键使用 `snake_case`。
- request ID、route、status、duration 使用统一键名。
- 不记录密码、Cookie、Authorization、完整查询参数或 favicon token。
- 相同可恢复错误必须限频，避免日志风暴。

### 6.5 格式与可读性

- 所有 Go 文件必须通过 `gofmt` 和 `goimports`。
- import 分组由工具管理，不手工保持个性化格式。
- 优先 early return，减少深层嵌套。
- 函数保持单一明确职责；不设置机械行数上限，但复杂函数必须拆分到可命名步骤。
- 尽量让 struct 零值可用；不可用时提供明确 constructor 并验证依赖。
- 不使用 `init` 执行业务注册、I/O 或启动 goroutine。
- 不复制标准库已有功能。

## 7. React 与 TypeScript 规则

### 7.1 React

- 组件和 Hook 必须保持纯净；render 期间不得发起副作用或修改外部值。
- Hook 只在组件或自定义 Hook 顶层调用，禁止条件调用和普通函数调用 Hook。
- Effect 只用于同步外部系统；可在 render 派生的数据不得通过 Effect 再写 state。
- 用户操作逻辑优先放在 event handler，不用 Effect 间接响应。
- 不在组件内部定义另一个组件。
- props 和 state 按不可变数据处理。
- server state 由 TanStack Query 管理；不复制到全局客户端 store。
- 输入、hover、scroll 和 animation frame 高频路径避免触发整页 re-render。
- 大型可选功能使用动态 import；日常首屏组件保持直接和稳定。
- 直接导入使用的模块，避免大型 barrel import。

### 7.2 TypeScript

`tsconfig.json` 至少启用：

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

规则：

- 禁止显式和隐式 `any`；未知外部输入使用 `unknown` 并在边界收窄。
- 禁止 `@ts-ignore`。确有编译器问题时可用精确 `@ts-expect-error`，
  但必须带原因和追踪编号。
- 避免非空断言 `!`；优先显式分支、类型守卫和 schema 校验。
- API 响应必须在边界运行时校验，不能仅依赖 compile-time interface。
- 状态模型优先使用 discriminated union，避免多个互相矛盾的 boolean。
- 导出的函数和组件显式声明输入类型；公共 API 返回类型保持稳定可读。
- 不用类型断言掩盖模型不匹配。

### 7.3 CSS 与动效

- 颜色、间距、圆角、层级和动效只使用共享 token。
- 所有尺寸、spacing、component state 和 responsive behavior 必须符合
  `docs/UI_SPEC.md`；禁止 viewport/device 特判修补单个机型。
- component style 使用 CSS Module；全局只放 reset、字体、主题和 token。
- 禁止 `!important`，除非处理明确记录的第三方样式边界。
- 不使用 JS timer 逐帧动画，不设置最高帧率。
- 只在合成友好的属性上运行高频动效，并遵守 reduced-motion。
- class 名表达角色或状态，不表达暂时视觉值。

## 8. API 与 Schema 命名

- Go 内部字段保持 Go initialism 规则：`RuntimeID`、`PublicURL`。
- JSON DTO 使用显式 tag 转为 `runtimeId`、`publicUrl`。
- YAML 使用现有 `private_url`、`public_url` 等 snake_case。
- 传输 DTO 与内部领域模型分离；handler 不直接序列化内部 struct。
- 所有 schema 包含明确版本或由 API contract 固定解释。
- YAML 未知字段继续严格报错，禁止为拼写错误增加静默 alias。
- 增加、重命名或删除字段必须先更新设计、验收和变更文档。

## 9. 弃用 API 与依赖策略

### 9.1 零弃用目标

- 新代码不得使用 Go 文档中标记 `Deprecated:` 的标识符。
- 新代码不得使用 TypeScript 类型中标记 `@deprecated` 的字段、函数或组件。
- 新配置不得引入已决定弃用的字段名或兼容别名。
- 新依赖不得在包管理器中标记 deprecated、archived 或 unmaintained。
- 禁止仅为消除警告而复制弃用实现到项目中。

常见禁止示例：

| 禁止 | 使用 |
| --- | --- |
| `io/ioutil` | `io` 和 `os` |
| `http.CloseNotifier` | `Request.Context()` |
| `http.Request.Cancel` | context cancellation |
| `http.Transport.Dial` | `DialContext` |
| `ReactDOM.render` | `createRoot` |
| React legacy context / `findDOMNode` | 现代 context、ref 和组件组合 |

该表只作示例，不能替代编译器、linter 和当前官方文档检查。

### 9.2 自动门禁

CI 必须执行：

```bash
gofmt -l .
go vet ./...
staticcheck ./...
govulncheck ./...
go test -race ./...

npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run test
npm --prefix web run build
npm --prefix web audit --omit=dev
```

前端 ESLint 必须启用类型信息，并将以下规则设为 error：

- `@typescript-eslint/no-deprecated`
- `@typescript-eslint/no-explicit-any`
- React Hooks rules
- 未处理 Promise 和不安全类型操作相关规则

Staticcheck 的 `SA1019` 不得禁用。CI 中任何弃用使用都必须失败。

### 9.3 例外

只有上游尚无替代、且缺少该能力会阻塞 P0 功能时才能提议临时例外。例外必须：

1. 在 `docs/CHANGELOG.md` 以 accepted 变更记录。
2. 精确到一个标识符或一行，不得全文件关闭检查。
3. 写明上游 issue、风险、隔离方式、替代计划和移除日期。
4. 不位于身份、安全、配置解析、URL 探测和文件写入边界。

默认发布门禁是零例外。

## 10. 依赖与构建

- Go toolchain 版本在实施时选择仍受支持的稳定版本，并通过 `go.mod`
  `go`/`toolchain` 指令固定。
- Go 依赖由 `go.mod`、`go.sum` 固定；前端依赖使用 package lock 和 `npm ci`。
- 不使用浮动版本、Git branch 依赖或未固定远程脚本。
- 升级依赖前阅读官方 release notes 和 migration guide，先运行完整测试与视觉回归。
- 直接生产依赖出现 high/critical 漏洞时阻止发布；无修复版本时走变更例外流程。
- 每个新增依赖在 PR/变更说明中记录：用途、替代方案、维护状态、bundle/二进制影响。
- release build 可复现，版本、commit、构建时间通过 linker flags 注入。

## 11. 测试标准

- 新行为先有失败测试，修复缺陷必须添加回归测试。
- config、catalog、favicon、navigation、httpapi 的关键分支必须有单元测试。
- YAML、URL 规范化、HTML favicon discovery 和内容类型识别增加 Go fuzz test。
- 并发代码必须运行 race test，并验证取消、关闭和 goroutine 生命周期。
- HTTP 使用 `httptest`，网络异常使用可控 fixture，不依赖公共互联网。
- 时间相关测试注入 clock，禁止真实 sleep 造成不稳定测试。
- 前端纯逻辑使用 Vitest，关键用户路径使用 Playwright。
- shared UI 和关键 feature 组件使用 Storybook 固定展示全部状态，并执行视觉测试。
- 响应式测试覆盖 `docs/UI_SPEC.md` 的 PR、nightly 和真实设备矩阵。
- Playwright 增加 bounding-box、overflow、alignment、touch target 和 CLS 几何断言。
- 动效不仅检查截图，还检查状态时间线、reduced motion 和高刷新率 performance trace。
- 覆盖率是风险信号，不是替代断言；核心 Go package 目标行覆盖率不低于 85%，
  前端非样式逻辑目标不低于 80%，且关键失败路径必须显式覆盖。
- flaky test 不允许直接重试隐藏；必须定位根因或隔离并记录阻塞。

## 12. Code Review 清单

每次 review 至少确认：

1. 文件和 package 是否放在正确职责边界。
2. 名称是否符合 Go initialism、无 stutter、无模糊 util/common。
3. exported API 是否最小且有正确 doc comment。
4. context、goroutine、channel、文件和响应体所有权是否明确。
5. 所有网络和 I/O 是否有界、有超时、可取消。
6. 错误是否保留链路且不会向用户泄露内部信息。
7. 是否使用弃用 API、字段、依赖或旧式 React 模式。
8. 前端是否保持组件纯净、Hook 合法、类型严格且无不必要 re-render。
9. UI 是否遵循 token、可访问性、reduced motion 和高刷新率要求。
10. 测试是否覆盖成功、失败、取消、并发和边界输入。
11. 日志是否结构化且不含敏感数据。
12. 设计、验收和变更文档是否与行为一致。

## 13. 完成定义

代码只有同时满足以下条件才算完成：

- 命名、布局、依赖方向符合本规范。
- 格式化、lint、typecheck、测试、race、vulnerability 和弃用检查全部通过。
- 没有未批准的弃用 API、字段、包或 lint suppression。
- 关键失败模式、并发生命周期和安全边界有测试。
- UI/UX 与性能验收通过。
- 相关设计、实施、验收、变更和 README 已同步。
