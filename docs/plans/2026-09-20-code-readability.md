# Code Readability Implementation Plan

**Goal:** 按已确认的审查建议提高命名、函数职责和重复逻辑的可维护性，保持产品行为与公开协议。

**Architecture:** 认证流程保留在 internal/app，以命名明确的私有函数分离请求校验、限流和会话管理；favicon 使用具名结果结构。菜单共享纯键盘导航逻辑，App 将目录同步与搜索分页状态分离为专属 hooks。

**Tech Stack:** Go、React、TypeScript、Vitest、Playwright。

## 实施步骤

1. 修改 internal/app/auth.go 和 auth_test.go：展开含糊命名、引入状态与限制常量、拆分登录流程；用原有认证测试并补充限流窗口、非法请求和会话替换回归覆盖。
2. 修改 internal/favicon/manager.go：以 iconFetchResult 替代六位置返回值，保留并发共享结果的内容复制；检查现有调用并运行 favicon 测试。
3. 新增 web/src/lib/keyboard/menuNavigation.ts 及行为测试；三个菜单使用共享函数，覆盖首尾循环、Home/End 和非导航按键。
4. 从 web/src/app/App.tsx 提取 useCatalogState.ts 和 useCatalogNavigation.ts，保留数据刷新、SSE、快捷键、分页、搜索和 banner 行为；补充关键状态交互测试。
5. 在 docs/IMPLEMENTATION.md 记录简明命名与函数职责要求。运行前端 lint/typecheck/test/build，Go 格式/test/race/vet/build，以及受影响的浏览器行为验证。检查本轮差异，保留已有工作区修改。

## 边界

本轮不提交 Git，不更改配置、接口、视觉设计或依赖。现有工作区包含其他进行中的修改，以开始实施时的文件快照核对本轮改动。

## 当前验证记录（2026-09-20）

基于当前工作区修改验证，保留开始前已有变更。

- `npm --prefix web run lint`、`npm --prefix web run typecheck`、`npm --prefix web run build`：通过。
- `npm --prefix web run test`：24 个测试文件、93 项测试通过。
- `npm --prefix web run test:e2e`：Chromium、Firefox、WebKit 共 51 项通过。
- `go test ./internal/... ./cmd/... ./web`、`go test -race ./internal/... ./cmd/... ./web`、`go vet ./internal/... ./cmd/... ./web`：通过。
- Go 格式检查、`git diff --check`：通过。
- `CGO_ENABLED=0 go build -trimpath -buildvcs=false -o /tmp/navi-readability-verified ./cmd/navi` 及 `--version`：通过。
- 新增会话替换测试首次运行未考虑公共测试 helper 预置会话，修正为核对替换前后会话总数一致、旧 token 撤销和新 token 生成后通过。
- 独立视觉快照、Storybook、漏洞扫描和容器构建未执行；本轮没有视觉样式、依赖或部署配置变更。
- `npm --prefix web run test:production`：三个浏览器共 21 项真实服务测试通过，覆盖登录/退出/会话撤销、公开模式、跳转、YAML 热更新及图标故障恢复。

全部实施步骤已完成，未创建 Git 提交。
