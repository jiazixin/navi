# 1.0 上线前验收（2026-10-20）

本轮是 1.0 发布前的最后一次全量测试：在 `fix/direct-navigation`（基于 `10a36df`）的工作区上执行全部检查、实际运行生产二进制，并修复测试中发现的问题。项目尚未上线，按用户要求不保留兼容代码。以下结果均来自本轮在最终代码上实际执行的检查，不沿用历史记录（上一轮界面重构验收见 Git 历史）。

结论：源码检查、单元测试、静态分析、漏洞扫描、三浏览器 E2E、视觉基线、真实 Go 二进制三浏览器集成、Storybook 与前后端构建全部通过。容器、真机和线上 HTTPS 代理未验证。

## 发现并修复的问题

| 问题 | 发现方式 | 修复 |
| --- | --- | --- |
| 登录页的胶片颗粒纹理 `/grain.svg` 位于 `public/`，未登录时被 302 到 `/login`，登录页纹理缺失 | 浏览器网络记录 | 纹理移到 `web/src/features/appearance/grain.svg` 由 CSS 引用，构建进公开的 `/assets/`；删除 `web/public/`；生产集成新增断言：登录页图片、样式、字体、脚本均直接 200（已在旧代码上确认该断言失败） |
| 导航 YAML 热加载失败时日志只有通用提示，没有解析或校验错误原因 | 实际编辑 YAML 观察日志 | `catalog.NewWatcher` 接收 logger，`catalog reload failed` 记录路径、revision 与 `error`；页面和 API 仍只显示通用提示；附 Go 回归测试 |
| `catalog.path` 不存在时只报 `cannot access catalog file`，不显示解析后的绝对路径 | CLI 启动错误场景 | 错误包含解析后的路径与系统原因；附 Go 回归测试 |
| 内网 HTTPS 使用自签或内部 CA 证书时，服务器无法验证证书，private 探测判为不可达，总是跳 public | 代码审查后用 TLS 测试服务器复现 | 证书验证失败（握手已到达对端）按可达处理，证书信任由浏览器决定；其他网络错误仍不可达；附 Go 回归测试，DESIGN/README 同步 |
| `golang.org/x/net` v0.56.0 含 5 个 HTTP/2 公告（GO-2026-6603/6610/6611/6612/6617，代码未调用） | `govulncheck` | 升级到 v0.60.0（`golang.org/x/sys` 随之 v0.48.0） |
| 开发依赖 `source-map-js` 1.2.1 高危公告 GHSA-68fv-2mgg-jv7q | `npm audit` | `npm audit fix` 仅更新锁文件到 1.2.2 |
| 死代码：`config.LoadFile` 仅测试使用；`DEFAULT_WEB_SEARCH_PROVIDER`、`webSearchProviders`、`aiSearchProviders` 无使用方 | 导出引用扫描 | 删除测试专用导出与未用列表；`main.tsx` 改用 `DEFAULT_WEB_SEARCH_PROVIDER` 作为唯一默认值 |
| Vite 开发 fixture 的 SSE 发送真实服务不存在的 `connected` 事件 | 协议对照 | 删除，fixture 与后端协议一致 |
| 正常关闭没有结束日志；示例配置头部说明位于 `auth` 段之后 | 实测 / 审读 | 优雅关闭后记录 `Navi stopped`；示例配置头部移到文件开头 |

## 实际验证

环境：macOS arm64；Go 1.27.2、Node 26.12.0、npm 11.20.0、Playwright 1.62.1（Chromium、Firefox、WebKit）、staticcheck 2026.2.2 (0.8.2)、govulncheck（`golang.org/x/vuln` 最新版，联网数据库）。命令从仓库根执行，Go 检查在生成 `web/dist` 后运行。

| 命令 / 检查 | 结果 |
| --- | --- |
| `npm --prefix web ci`、`lint`、`typecheck` | 通过 |
| `npm --prefix web run test` | 通过；语句 95.95%、分支 86.1%、函数 96.83%、行 97.17%（门槛未调整） |
| `npm --prefix web run build` | 通过；JS 362 kB（gzip 114 kB）、CSS 38 kB；纹理与字体为独立文件 |
| `gofmt -l`、`go mod verify` | 无格式问题；模块校验通过 |
| `go test`、`go test -race`、`go vet`（`./internal/... ./cmd/... ./web`） | 全部通过 |
| `staticcheck ./internal/... ./cmd/... ./web` | 无问题 |
| `govulncheck` 源码模式与 `-mode=binary bin/navi` | 修复后均为 No vulnerabilities found |
| `npm --prefix web audit` | 修复后 0 vulnerabilities |
| `npm --prefix web run test:e2e` | 三浏览器 42 项通过 |
| `npm --prefix web run test:visual` | 16 项通过，基线未改动 |
| `npm --prefix web run test:production` | 真实 Go 二进制三浏览器 24 项通过 |
| `npm --prefix web run storybook:test` | 构建通过 |
| 手工运行 `bin/navi` | 合成配置（含认证）下：健康检查、未登录 401/302、错误/正确登录、6 次失败后 429、退出后 401、private 可达 / 不可达回退 public / 单地址不探测、`/go/` 不存在 404、YAML 非法更新降级与原子替换恢复、SIGTERM 正常关闭；CLI 的多余参数、空路径、缺失文件、非法环境变量均以非零码退出并给出原因 |

## 未执行与部署前剩余检查

- 未执行镜像构建、容器启动与 UID 65532 挂载读写。
- 未执行真机触控、高 DPI、高刷新率、200%/400% 浏览器缩放；纹样的 CPU/电量占用未做设备基准测试。
- 未在线上 HTTPS 反向代理验证 Secure Cookie、Host 转发与 SSE 长连接。
- `npm ci` 提示 esbuild、fsevents 的安装脚本未被 npm 允许运行；本轮构建与测试不受影响，未修改 npm 安装脚本策略。
- 仓库无已配置 CI；以上为本机结果。
