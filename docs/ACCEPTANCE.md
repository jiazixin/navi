# 全量审查与验收（2026-09-30）

基于现有未提交工作区执行 `use-modern-go` 与 Open Code Review 全量审查及修复，保留已有目录调整和功能修改，未提交 Git commit，未新增兼容层。本轮结果如下；后面的 2026-09-17 记录仅作历史参考。

## 审查覆盖

OCR 未配置 LLM endpoint，直接 `ocr review` 未能执行；随后使用官方 delegate 流程，由 OCR 选择文件、解析规则，由当前代理审查源码和差异。没有把 endpoint 调用失败记为审查通过。

| 范围 | 总条目 | 可审查文件 | 已审查 | 主动跳过 | 可审查覆盖率 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 当前工作区差异 | 222 | 81 | 81 | 0 | 100% |
| 全仓扫描 | 211 | 121 | 121 | 0 | 100% |

工作区另有 141 项、全仓另有 90 项按 OCR 默认规则排除，包括测试路径、二进制基线和不支持的文本扩展名。测试、文档、Go/npm 依赖与锁文件另行检查和验证，不把这些排除项计入 OCR 的源码覆盖率。逐文件清单和固定问题保存在被忽略的 `web/test-results/navi-ocr-review.json`。

## 本轮修复

- 恢复被错误重命名的 `X-Content-Type-Options`、`X-Frame-Options`，增加公开与认证路由的响应头回归检查。
- 会话满 4096 个时允许已有会话正常重新登录并撤销旧令牌，同时继续拒绝额外的新会话。
- SSE 每帧写入使用配置的超时，空闲等待时清除期限；取消请求中断阻塞写入，清理时等待取消回调退出。响应记录器保留真实 Flush 错误，避免断开的客户端继续占用处理器。
- 图标缓存将文件、元数据与索引替换作为同一受锁保护的操作；读取时在释放读锁前打开文件，避免并发替换与清理造成内容、ETag 和持久元数据不一致。
- 合并探测中，等待者在自己的原始超时预算内重试被其他调用者取消的探测；取消不进入目标缓存，Resolver 保留调用者的取消错误。确定性并发测试覆盖该失败路径。
- 分组标题使用实例唯一 ID，手机目录与搜索浮层共存时无障碍标签不会指向重复 ID。标题网格允许合法的 40 字标题换行，三浏览器回归覆盖 320px 目录与浮层。
- 卡片点击计时器重复点击前清理，并在卸载时释放。认证 API 要求当前协议中的 `authRequired` 字段，开发 fixture 同步返回该字段。
- 应用 `wg.Go`、`t.Context()`、`slices.Clone`、`bytes.Clone`、`slices.SortStableFunc`、`maps.DeleteFunc`、`FieldsSeq`、`strings.Cut`、`omitzero` 和整数 range；移除旧定时器通道排空写法。API 标签数组仍保证空值编码为 `[]`。

## 依赖与构建基线

按 Docker 原固定的 Go 1.25.12 扫描发现 5 个可触达标准库漏洞：GO-2026-6218、GO-2026-6090、GO-2026-6089、GO-2026-5972、GO-2026-5026。Go 1.25 已结束官方支持，因此 `go.mod` 和 Docker 构建镜像统一到 Go 1.27.1。本机与 Docker 的版本口径一致；[Go 官方发布与支持政策](https://go.dev/doc/devel/release#policy)、[官方 Go 镜像标签](https://hub.docker.com/_/golang)。

完整 npm 审计最初报告 7 个受影响包（含传递影响，3 moderate、4 high）。Vitest 与 coverage-v8 固定到 4.1.11，更新相关 Vitest 包及 brace-expansion、js-yaml、nanoid、undici 的安全版本并同步锁文件；未使用强制审计修复。上游依据包括 [Vitest 公告](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9)、[js-yaml 公告](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh)、[Undici 公告](https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3)。

## 实际验证

| 项目 | 本轮结果 |
| --- | --- |
| Go 格式、完整测试、race、vet、Staticcheck | 全部通过 |
| Go 模块校验 | `go mod verify` 通过 |
| Govulncheck 源码与最终二进制 | Go 1.27.1：未发现已知漏洞 |
| ESLint、TypeScript、生产前端构建 | 全部通过 |
| 前端单元测试 | 24 文件、94 项通过；语句覆盖率 94.28% |
| Storybook 测试构建 | 通过；第三方弃用和产物体积提示仍存在 |
| 三浏览器 E2E | 54/54 通过，使用项目固定版本 Chromium、Firefox、WebKit |
| 视觉回归 | 26/26 通过，未更新图片基线 |
| 真实 Go 三浏览器集成 | 21/21 通过，无 API mock；含认证/会话撤销、跳转、热更新、磁盘故障恢复 |
| 完整 npm audit（包含开发依赖） | 0 项漏洞；干净 `npm ci` 同样为 0 |
| 干净副本 | 排除本地配置、缓存、node_modules 和产物；最终锁文件安装、前端构建及 Go 测试通过 |
| 最小启动 | 默认配置文件、显式 CONFIG_FILE、缺失隐式配置的内置默认值：health、catalog、session、嵌入首页与 SIGTERM 正常；显式空路径和缺失文件拒绝启动 |
| 二进制构建 | macOS arm64 构建及版本输出通过；Linux amd64 静态交叉编译通过 |
| 差异与生成物 | `git diff --check` 通过；报告、浏览器和审计工具不进入源码目录 |

Docker 守护进程未运行，容器构建与实际运行未验证；Linux 交叉编译和源码审查不能替代容器检查。真机触控、高 DPI 和高刷新率手工检查未执行。

---

## 历史目录规范整改验收（2026-09-17）

本次基于当前未提交工作区继续修改，未提交 Git commit。依据根目录《目录规范.md》，不保留旧入口、旧目录副本或兼容层。

## 迁移范围

- Go HTTP 装配、认证、处理器与测试归入 `internal/app/`，HTTP 内部类型取消导出；端口等待辅助函数移入测试文件。
- Web API 归入 `src/app/api/`，跨域 UI 归入 `src/components/`，顶栏归入 `src/layouts/`，导航失败页归入 `src/features/navigation/`，动效变量归入 `src/styles/`。
- 浏览器测试、生产服务 fixture 和既有视觉基线统一到 `web/e2e/`；共享开发/测试 fixture 在 `web/tests/fixtures/`；`src/test/` 只保留单元测试 setup。
- `CONFIG_FILE` 选择配置，默认只查找 `configs/config.local.yaml`；缺失使用默认值，显式空路径或缺失文件报错。`NAVI_<字段>` / `NAVI_<节>_<字段>` 覆盖文件与默认值。
- 本地 `configs/config.yaml` 迁为 `configs/config.local.yaml`；只修改其中缓存路径，其他配置值和导航 YAML 保留。原 `storage/` 整体迁至 `.cache/`，图标文件未丢弃。
- 安装、开发、运行、构建、检查与测试改为直接调用 Go/npm 命令；Docker、忽略规则、双语 README、开发文档和架构说明同步。历史计划及验收记录放入 `docs/archive/`。

## 实际验证

以下为 2026-09-17 的历史验证结果，不代表移除构建入口后重新执行了全套验证。

| 项目 | 结果 |
| --- | --- |
| 完整检查 | 通过：ESLint、TypeScript、79 项前端单元测试、Go 测试、race、vet、格式和生产构建 |
| Storybook 测试构建 | 通过；第三方工具仍有弃用/产物体积提示 |
| 常规三浏览器 E2E | 首轮 50/51；Firefox 动画采样只有 2 帧，未满足大于 2 帧断言。该用例随后在三个浏览器复跑均通过；未放宽断言 |
| 视觉回归 | 26/26 通过；本轮只迁移基线位置，未更新图片 |
| 真实 Go 三浏览器集成 | 21/21 通过，包含认证、会话撤销、跳转、目录热更新与缓存故障恢复 |
| 干净副本 | 排除本地配置、运行缓存、node_modules、dist 和报告，依赖安装与完整检查通过 |
| 最小启动 | 干净副本分别验证默认文件、无主配置文件的内置默认值、显式 CONFIG_FILE；health、嵌入首页、目录 API 与 SIGTERM 退出通过 |
| 配置错误 | 显式空 CONFIG_FILE 和不存在的路径均退出报错 |
| 生成物清理 | 在干净副本验证生成目录删除，配置、data 和缓存哨兵文件内容不变 |
| 路径与工作区 | 当前有效引用无旧目录/命令；Git 已跟踪内容中无被忽略的现存文件；`git diff --check` 通过 |

Docker 守护进程未运行，容器构建与运行未验证。未重新执行 Staticcheck、Govulncheck、独立依赖审计或真机检查；历史结果不能替代本轮验证。
