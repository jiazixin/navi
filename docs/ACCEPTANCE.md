# v1.0.2 代码质量与依赖安全验收（2026-10-22）

本轮在 `main`（基于 `bacadaf`）的工作区上做代码质量审查：清理死代码、未用变量与重复逻辑，改善命名与可读性，并把 Go 工具链升级到 1.27.3、CI 的 Node.js 固定到安全补丁版本、修复 npm 依赖漏洞。不改变 HTTP 协议、配置格式与界面行为。以下结果均来自本轮在最终代码上实际执行的检查，不沿用历史记录（1.0 上线前验收见 Git 历史）。

结论：源码检查、单元测试、静态分析、漏洞扫描、三浏览器 E2E、视觉基线、真实 Go 二进制三浏览器集成、Storybook、前后端构建与干净副本冒烟全部通过。容器、真机和线上 HTTPS 代理未验证。

## 发现并修复的问题

| 问题 | 发现方式 | 修复 |
| --- | --- | --- |
| `favicon.Store.Put`（无校验器版本）与 `Store.ReadAll` 只被测试调用 | 导出引用扫描 | 删除包装，`PutWithValidators` 更名为唯一的 `Put`；`ReadAll` 改为测试辅助函数 |
| `Store.PutWithValidators` 中删除旧文件的错误分支为空（staticcheck SA9003），元数据转换在三处重复 | staticcheck / 审读 | 显式忽略并说明原因；提取 `Entry.metadata()` / `metadata.entry()` |
| `httpServer` 方法接收者混用 `s` 与 `server`（ST1016）；字段 `request` 实为计数器 | staticcheck / 审读 | 统一为 `s`；改名 `requests` |
| `hasPrefixPath`、`htmlEscape` 重复实现标准库 | 审读 | 改用 `strings.HasPrefix`、`html.EscapeString`；`/api` 判断提取 `isAPIPath` |
| `status()` 返回三个关联值；健康状态字符串散落 | 审读（项目约定：关联多返回值用具名结构） | 返回 `statusResponse`，健康值改为常量 |
| SSE 事件与心跳的写入/刷新代码重复；无意义的 `if err != nil { return }` | 审读 | 提取 `writeFrame`；改为显式忽略 |
| `Run` 中对必然非空的 watcher 与完成通道做 nil 判断；图标调度、降级闭包各重复两次 | 审读 | 删除恒真判断；提取 `scheduleIcons`、`iconCacheUnavailable` |
| 探测器 HEAD/GET 的请求与关闭代码重复，局部变量遮蔽同名函数 | 审读 | 提取 `requestStatus` |
| favicon 管理器存储失败统计逻辑重复，`"maintenance"`、队列容量为魔法值 | 审读 | 提取 `updateStorageFailures`，引入命名常量 |
| 配置校验中 `storage` 空值判断不可达；日志枚举用临时 map | 审读 | 删除死分支（加载阶段已校验）；改为包级集合 |
| 前端 `CommandPalette` 的 `dialogRef` 未使用；测试夹具 `fixtureIcon` 未使用；9 个导出无外部使用方 | knip / ESLint | 删除或改为模块内部 |
| `catalog.ts` 与 `status.ts` 的请求与校验逻辑重复，`status.ts` 未处理 JSON 解析失败 | 审读 | 提取 `api/client.ts` 的 `fetchJSON`，错误文案不变 |
| 命名不清：`onCatalogError` 同时处理状态事件、`initial` 实为最新值、`nextKeys`、`visible`、`message`、`#last` 等 | 审读 | 改为 `onStatusChange`、`latest`、`arrowKeyOffsets`、`passwordVisible`、`navigationError`、`#lastFrameTime`；纹样强度边界改为共享常量 |
| 开发依赖 vite 8.2.0（含 launch-editor）、vitest 4.1.11、storybook 10.5.5 共 5 个公告（1 严重、1 高危、3 中危） | `npm audit` | 同大版本内升级到 vite 8.3.5、vitest/@vitest/coverage-v8 4.1.12、storybook 系列 10.6.3 |
| CI 写 `node-version: 24`，可能使用 runner 缓存的旧补丁版本；Dockerfile 用 `node:22-alpine` 浮动标签 | 版本核对（Node 2026-10-20 安全发布） | CI 与发布工作流固定 `NODE_VERSION: 24.22.1`；Dockerfile 用 `node:24.22.1-alpine`；`engines` 下限提到各线安全版本 |
| Go 1.27.2 | 用户要求 | `go.mod`、Dockerfile、README 升级到 1.27.3 |

GitHub Actions（checkout v7.0.1、setup-node v7.1.0、setup-go v7.0.0、goreleaser-action v7.3.0、GoReleaser v2.18.3）已是最新发布，未改动。Go 模块依赖 `govulncheck` 无公告，未升级。

## 实际验证

环境：macOS arm64；Go 1.27.3、Node 26.12.0、npm 11.20.0、Playwright 1.62.1（Chromium、Firefox、WebKit）、staticcheck 2026.2.2 (0.8.2)、govulncheck（`golang.org/x/vuln` 最新版，联网数据库）、knip 5。命令从仓库根执行，Go 检查在生成 `web/dist` 后运行。

| 命令 / 检查 | 结果 |
| --- | --- |
| `npm --prefix web ci`、`lint`、`typecheck` | 通过 |
| `npm --prefix web run test` | 20 个文件 100 项通过；语句 95.94%、分支 86.13%、函数 96.84%、行 97.17%（门槛未调整） |
| `npm --prefix web run build` | 通过；JS 361 kB（gzip 114 kB）、CSS 38 kB |
| `npx knip` | 仅报告 `@fontsource-variable/jetbrains-mono` 未用，实为 `global.css` 的 `@import`，属误报 |
| `gofmt -l`、`go mod verify` | 无格式问题；模块校验通过 |
| `go test -race`、`go vet`（含 `GOOS=linux` 交叉）| 全部通过 |
| `staticcheck ./internal/... ./cmd/... ./web` | 无问题（修复前 2 项） |
| `govulncheck` 源码模式与 `-mode=binary bin/navi` | No vulnerabilities found |
| `npm --prefix web audit` | 修复后 0 vulnerabilities |
| `npm --prefix web run test:e2e` | 三浏览器 42 项通过 |
| `npm --prefix web run test:visual` | 16 项通过，基线未改动 |
| `npm --prefix web run test:production` | 真实 Go 二进制三浏览器 24 项通过 |
| `npm --prefix web run storybook:test` | 构建通过 |
| 干净副本（`git ls-files -co`，不含依赖与产物） | `npm ci`、构建、`go vet`、编译通过；合成配置下 health、未登录 401/302、登录、目录、状态、首页与 SIGTERM 正常关闭均符合预期 |

## 未执行与部署前剩余检查

- 本机 Docker 守护进程不可用，未执行镜像构建、容器启动与 UID 65532 挂载读写；`node:24.22.1-alpine`、`golang:1.27.3-alpine` 标签已在 Docker Hub 确认存在。
- GitHub Actions 的实际运行结果以推送后的 CI 为准，本表为本机结果。
- 未执行真机触控、高 DPI、高刷新率、200%/400% 浏览器缩放；未在线上 HTTPS 反向代理验证 Secure Cookie、Host 转发与 SSE 长连接。
- `npm ci` 提示 esbuild、fsevents 的安装脚本未被 npm 允许运行；构建与测试不受影响，未修改 npm 安装脚本策略。
