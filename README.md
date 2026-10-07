# Navi

Navi is a self-hosted, read-only personal navigation system. The Go backend reads a YAML catalog and provides optional login, live catalog updates, private/public destination selection, and favicon caching. The React frontend is embedded in one Go binary, with search, pagination, themes, responsive layouts, and keyboard controls. Production does not require Node.

[中文说明](README.zh-CN.md) · [Design and protocol](docs/DESIGN.md) · [Development and verification](docs/IMPLEMENTATION.md) · [Current acceptance](docs/ACCEPTANCE.md)

## Requirements and first run

- [go.mod](go.mod) declares the Go requirement, currently Go 1.27.1 or later.
- [web/package.json](web/package.json) declares the Node requirement: Node 22.x from 22.22.2, 24.x from 24.15.0, or 26+. Use the npm version bundled with that Node release.
- Install from the committed `web/package-lock.json` using `npm ci`. Browser checks also require Playwright browsers and their operating-system dependencies.

Run these commands from the repository root. Initialization preserves existing configuration:

```sh
cp -n configs/config.example.yaml configs/config.local.yaml
cp -n configs/urls.example.yaml configs/urls.yaml
go mod download
npm --prefix web ci
npm --prefix web run build
CGO_ENABLED=0 go build -trimpath -buildvcs=false -o bin/navi ./cmd/navi
./bin/navi --config ./configs/config.local.yaml
```

The default address is `http://127.0.0.1:8080`; health is available at `/health`. Edit both local YAML files first. Both credentials are empty by default, allowing direct access. Set both `auth.username` and `auth.password` to enable login.

## Configuration

[config.example.yaml](configs/config.example.yaml) is the source for all fields, defaults, and constraints. See [urls.example.yaml](configs/urls.example.yaml) and the [catalog contract](docs/DESIGN.md#导航数据) for navigation data.

- `-f PATH` / `--config PATH` explicitly selects the main configuration and overrides `CONFIG_FILE`; without a flag, `CONFIG_FILE` remains available. Relative paths resolve from the process working directory. If neither is set, only `./configs/config.local.yaml` is checked, and an absent file uses built-in defaults. An explicitly empty value, a missing/unreadable selected file, or invalid YAML fails startup. The catalog must exist and be valid.
- Priority is environment variables > selected file > built-in defaults. Fields map to `NAVI_<FIELD>` or `NAVI_<SECTION>_<FIELD>`, for example `NAVI_STORAGE=/var/cache/navi`, `NAVI_SERVER_PORT=8081`, or `NAVI_CATALOG_WATCH=false`.
- String variables are preserved literally; paths trim surrounding whitespace and credentials match exactly. An empty variable overrides the file: optional credentials may be cleared together, but required paths cannot be empty. Numbers, booleans, and durations must be single non-empty scalar values. Durations accept `250ms`, `3s`, and `168h`, rather than `7d`.
- `storage` and `catalog.path`, including environment overrides, resolve from the selected configuration's directory. Without the implicit main file, the expected `configs/` directory remains the base, so the defaults are `configs/urls.yaml` and `.cache/`. Prefer absolute paths in deployment.
- Main configuration changes require restart. Only the catalog supports live reload. Valid updates notify open pages through SSE; invalid updates retain the last valid catalog and report degraded status until repaired.

Catalog example:

```yaml
version: 1
pages:
  - id: work
    title: Work
    urls:
      - name: Grafana
        group: Infrastructure
        description: Metrics and dashboards
        private_url: http://grafana.lan:3000
        public_url: https://grafana.example.com
        tags: [monitoring, metrics]
```

At least one of `private_url` and `public_url` is required, accepting only absolute HTTP(S) URLs. Pages follow `pages` order; groups follow their first occurrence and preserve relative YAML order within each group. Every page must explicitly include `urls`, allowing an empty array. Limits are 2 MiB, 20 pages, and 1000 links. Navi never writes the catalog and has no web editor, drag-and-drop sorting, database, or catalog write API.

Link selection probes the private URL from the **Navi server**, then tries the public URL on failure. Server reachability does not guarantee browser reachability. Probes have timeouts, caching, and concurrency limits. Favicons are discovered in the background and cached under `storage/favicons`; initials provide a fallback without blocking the first render.

## Authentication and deployment

Both credentials empty, or omitted `auth`, disables authentication. Both configured enables login; a partial account or whitespace-only credential fails startup. Quote credentials containing YAML syntax. Sessions live in memory for 24 hours and expire on logout or restart. Cookies use HttpOnly and SameSite=Strict; passwords and tokens are never stored in localStorage.

With authentication enabled, unauthenticated pages redirect to `/login`, and the backend protects catalog, status, SSE, icons, and navigation. Login, bundled static assets, and health remain public; health exposes only coarse status. Login is limited to five attempts per minute per directly connected IP. Proxy users share the proxy IP limit; forwarding headers are not trusted.

Use an HTTPS reverse proxy and set `NAVI_AUTH_SECURE_COOKIE=true` for remote deployment. Disable buffering for `/api/events`, allow connections longer than its 15-second heartbeat, and preserve the original Host header. Catalog APIs expose configured internal/public URLs; do not place credentials in those URLs. Only trusted users should edit YAML because the server fetches its destinations, icons, and redirect targets.

## Development and verification

```sh
npm --prefix web run dev
```

The development address is `http://127.0.0.1:10090`. Vite serves fixed read-only catalog and pre-authenticated fixtures, rather than local navigation YAML. Use the production binary or `test:production` to exercise actual authentication, configuration, and backend protocols. `npm --prefix web run preview` previews static output and does not provide a backend API.

Default check sequence:

```sh
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run test
npm --prefix web run build
test -z "$(gofmt -l cmd internal web/embed.go)"
go mod verify
go test ./internal/... ./cmd/... ./web
go test -race ./internal/... ./cmd/... ./web
go vet ./internal/... ./cmd/... ./web
```

`web/embed.go` embeds `web/dist` directly, so build the frontend before every Go check or build. Explicit Go package paths avoid scanning third-party Go code under `node_modules`.

Run browser checks and component-documentation builds separately:

```sh
(cd web && npx playwright install)
npm --prefix web run storybook:test
npm --prefix web run test:e2e
npm --prefix web run test:visual
npm --prefix web run test:production
```

`storybook:test` builds Storybook in test mode; it does not run browser interaction assertions. Regular E2E uses Vite fixtures. Production integration uses real Go binaries, temporary directories, and synthetic configuration across three browsers for authentication, navigation, reload, and recovery. Existing visual baselines are macOS screenshots; establishing baselines on another OS requires manual review. [IMPLEMENTATION.md](docs/IMPLEMENTATION.md) covers full commands, tools, performance checks, and manual verification.

The repository has no CI configuration and no verifiable external CI configuration. These commands are local check entry points. An actual CI should directly orchestrate native Go/npm commands, building Web before Go. See [ACCEPTANCE.md](docs/ACCEPTANCE.md) for current results and unexecuted checks.

## Release build

```sh
npm --prefix web run build
VERSION=${VERSION:-$(git describe --tags --exact-match HEAD 2>/dev/null || printf '%s\n' dev)}
COMMIT=${COMMIT:-$(git rev-parse --short HEAD)}
BUILD_TIME=${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
CGO_ENABLED=0 go build -trimpath -buildvcs=false \
  -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT} -X main.buildTime=${BUILD_TIME}" \
  -o bin/navi ./cmd/navi
./bin/navi --version
```

`bin/navi` includes the frontend, version, commit, and build time. An explicit `VERSION` wins; otherwise an exact Git tag on the current commit is used, falling back to `dev`. The tag is injected at build time, so the resulting binary does not depend on `.git`. The commit field does not identify uncommitted changes; confirm the actual source being released.

## Container

Dockerfile installs frontend dependencies from the lockfile, builds `web/dist`, and compiles a static Go binary. The runtime image does not include Node. After preparing local configuration:

```sh
docker build -t navi:local .
docker run --rm -p 127.0.0.1:8080:8080 \
  -v "$(pwd)/configs:/app/configs:ro" \
  -v navi-cache:/app/.cache \
  -e CONFIG_FILE=/app/configs/config.local.yaml \
  -e NAVI_SERVER_LISTEN=0.0.0.0 \
  -e NAVI_STORAGE=/app/.cache \
  navi:local
```

The container working directory is `/app` and the user is UID/GID 65532. This example binds the host port to localhost for a host-side reverse proxy; choose the binding explicitly for remote access. Add `-e NAVI_AUTH_SECURE_COOKIE=true` for HTTPS deployment. Environment overrides configure container listening and caching without changing the local file; `catalog.path: ./urls.yaml` resolves to `/app/configs/urls.yaml`.

Mount the entire configuration directory read-only, allowing editor atomic replacements to remain visible. UID 65532 must be able to traverse the directory and read both YAML files; owner-only `0600` files need a container-aware ownership/access arrangement. A fresh named cache volume inherits image ownership; existing volumes and bind mounts must explicitly allow UID/GID 65532 to write. The image has no shell or curl, so request `/health` from outside the container. HTTP 200 can mean `degraded`; authenticated `/api/status` provides further status.

## Runtime state and backups

Back up `configs/config.local.yaml` and `configs/urls.yaml`; limit credential-file access to administrators and the runtime user. Custom local configurations also belong under `configs/`; only `*.example.yaml` is committed. The entire directory is excluded from the Docker context, preventing local instances from entering the image.

There is no persistent business database or upload store. `.cache/favicons/` is rebuildable and does not need backup; stop the service before deleting it. Logs go to stdout and sessions expire on restart. Dependencies, builds, caches, coverage, and test output are ignored; preserve configuration during cleanup.

## Layout and documentation

[目录规范.md](目录规范.md) is the sole general directory baseline. Current ownership is:

```text
cmd/navi/             Executable entry point
internal/             config, catalog, navigation, favicon, app and colocated Go tests
web/                  Frontend manifests, tooling, HTML entry and embed.go
  src/app/            Application assembly, APIs and global state
  src/layouts/        Page shell
  src/features/       Domain features, colocated tests and stories
  src/components/     Reusable UI
  src/lib/keyboard/   Shared keyboard logic
  src/styles/         Themes and motion
  src/test/           Unit-test setup
  tests/fixtures/     Development and integration inputs
  e2e/                Browser tests, real-server fixtures and reviewed snapshots
  dist/               Generated static bundle
configs/              Examples and local configuration
docs/                 DESIGN, UI_SPEC, IMPLEMENTATION and ACCEPTANCE
bin/                  Generated binary
.cache/               Rebuildable favicon cache
coverage/             Go coverage reports, generated on demand
```

Completed plans and obsolete acceptance records remain in Git history and are not current command/result references. [UI_SPEC.md](docs/UI_SPEC.md) retains interface and accessibility contracts; current acceptance is recorded separately.

### Directory exceptions

| Rule / standard path | Actual path or behavior | Reason and evidence | Scope | Reassessment condition |
| --- | --- | --- | --- | --- |
| Section 7.1: paths without a configuration file default to the working directory | Missing implicit configuration resolves built-in paths from the expected `configs/config.local.yaml` directory | Existing Load/finishConfig protocol in `internal/config/config.go`; paths remain stable whether the implicit file exists | Root Go service default startup | An explicitly authorized configuration-protocol change |
| Section 7.1: `CONFIG_FILE` explicitly selects configuration | `-f PATH` / `--config PATH` are also supported and take precedence | This project is an executable service; the user explicitly requested standard CLI configuration flags while retaining environment selection for containers | `cmd/navi` configuration selection | An explicitly authorized CLI or configuration-protocol change |
