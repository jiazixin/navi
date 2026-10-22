<div align="center">

# Navi

**A self-hosted, read-only personal start page — one YAML file, one binary.**

[![CI](https://github.com/jiazixin/navi/actions/workflows/ci.yml/badge.svg)](https://github.com/jiazixin/navi/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jiazixin/navi?include_prereleases&sort=semver)](https://github.com/jiazixin/navi/releases)
[![Go](https://img.shields.io/github/go-mod/go-version/jiazixin/navi)](go.mod)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

[简体中文](README.md) · English

![Navi home page (contour pattern, ink palette)](web/e2e/visual.spec.ts-snapshots/home-desktop-visual-darwin.png)

</div>

## Overview

Navi turns a YAML link catalog into a map-inspired browser start page. The Go backend reads the catalog and provides optional login, live reload, private/public destination selection, and favicon caching. The React frontend is embedded into the same Go binary at build time, so production needs no Node, database, or external service.

Project type: a single Go service (`cmd/`, `internal/`) with one embedded web app (`web/`).

## Features

- **Single-file catalog**: pages, groups, and tags all live in one YAML file. Changes are pushed to open pages over SSE; an invalid edit keeps the last valid catalog and shows a degraded notice.
- **Private/public routing**: when a link has both `private_url` and `public_url`, the server probes the private address and redirects there if reachable, otherwise straight to the public one.
- **Unified search**: the hero search box filters your links and queries external search engines; `⌘K` / `Ctrl+K` opens quick search, and everything works from the keyboard.
- **Start page experience**: live clock, section index, four palettes (ink, paper, celadon, dusk) and five animated canvas patterns (contour, flow, guilloche, stars, ridge), responsive layouts.
- **Favicon cache**: site icons are discovered and cached in the background, with monogram fallbacks that never block first paint.
- **Optional login**: username/password, HttpOnly cookies, 24-hour in-memory sessions, per-IP rate limiting.
- **One binary**: the frontend compiles into the Go binary for linux/darwin on amd64/arm64; a distroless container image is provided.

Navi is deliberately read-only: there is no web editor, drag-and-drop ordering, database, or catalog write API. The catalog is maintained only through the YAML file.

## Quick start

### Prebuilt binaries

Download `navi_<version>_<os>_<arch>.tar.gz` for your platform from [Releases](https://github.com/jiazixin/navi/releases) and verify it against `checksums.txt`. Each archive contains the binary, the READMEs, the LICENSE, and both example configs:

```sh
mkdir navi && tar -xzf navi_<version>_<os>_<arch>.tar.gz -C navi && cd navi
cp -n configs/config.example.yaml configs/config.local.yaml
cp -n configs/urls.example.yaml configs/urls.yaml
./navi --config ./configs/config.local.yaml
```

Open `http://127.0.0.1:8080`; health is available at `/health`.

### Build from source

Required runtimes:

| Tool | Declared in | Current requirement |
| --- | --- | --- |
| Go | [go.mod](go.mod) | Go 1.27.3 or later |
| Node | [web/package.json](web/package.json) `engines` | 22.x (≥ 22.23.4), 24.x (≥ 24.22.1), or 26.x (≥ 26.12.1), with its bundled npm |

Run from the repository root. Initialization never overwrites existing configuration:

```sh
git clone https://github.com/jiazixin/navi.git
cd navi
cp -n configs/config.example.yaml configs/config.local.yaml
cp -n configs/urls.example.yaml configs/urls.yaml
go mod download
npm --prefix web ci
npm --prefix web run build
CGO_ENABLED=0 go build -trimpath -o bin/navi ./cmd/navi
./bin/navi --config ./configs/config.local.yaml
```

`web/embed.go` embeds `web/dist` directly, so `npm --prefix web run build` must run before any Go build, test, or check. For builds with version metadata, see [Release builds](#release-builds).

### Docker

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

See [Container deployment](#container-deployment) for version injection, permissions, and mounts.

## Configuration

Navi uses two YAML files: the main config (server, auth, appearance, …) and the link catalog. [config.example.yaml](configs/config.example.yaml) is the authoritative list of fields, defaults, and constraints; see [urls.example.yaml](configs/urls.example.yaml) and the [data contract](docs/DESIGN.md#导航数据) for the catalog format.

### Link catalog

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

- Each link needs at least one of `private_url` and `public_url`; only absolute HTTP(S) URLs are accepted.
- Page order follows `pages`; groups are ordered by first appearance, and links keep their YAML order within a group. Every page must declare `urls` explicitly; an empty list is allowed.
- Limits: 2 MiB per file, 20 pages, 1000 links.

A link with one address redirects without probing. With both addresses, the **Navi server** probes the private URL and redirects there if reachable, otherwise directly to the public URL (which is not probed). A TLS certificate the server cannot verify (self-signed or internal CA) still counts as reachable, leaving trust to the browser; server reachability does not guarantee the browser's network can reach it. Probes are bounded by timeouts, caching, and a concurrency limit.

### Main config and environment variables

```sh
./navi -c ./configs/config.local.yaml
./navi --config ./configs/config.local.yaml
./navi -h          # or --help: show help
./navi --version   # show version, commit, and build time
```

`-c` / `--config` also accept `=PATH`; when used together, they must specify the same path. `-f` has been removed. Help and version queries neither read configuration nor start the server.

- **Choosing a config file**: `-c PATH` / `--config PATH` selects the main config and overrides `CONFIG_FILE`; without the flag, `CONFIG_FILE` may be used. Relative paths resolve against the process working directory. When neither is set, only `./configs/config.local.yaml` is checked and built-in defaults apply if it is missing. An explicitly empty value, or a missing, unreadable, or invalid file, fails startup. The catalog YAML must exist and be valid.
- **Precedence**: environment variables > selected file > built-in defaults. Fields map to `NAVI_<FIELD>` or `NAVI_<SECTION>_<FIELD>`, for example `NAVI_STORAGE=/var/cache/navi`, `NAVI_SERVER_PORT=8081`, `NAVI_CATALOG_WATCH=false`.
- **Value semantics**: strings are kept as-is, paths are trimmed during resolution, and credentials must match exactly. An empty string overrides the file value: it can clear optional auth but not required paths. Numbers, booleans, and durations must be a single non-empty scalar; invalid values are errors. Durations use `250ms`, `3s`, `168h`; `7d` is not supported.
- **Relative paths**: `storage` and `catalog.path` (including environment overrides) resolve relative to the selected config's directory. Without an implicit main config, the expected `configs/` directory is still the base, so the defaults are `configs/urls.yaml` and `.cache/`. Prefer absolute paths in deployments.
- **Reloading**: main config changes take effect after a restart; only the catalog at `catalog.path` reloads live. Details of an invalid update appear in the server log as `catalog reload failed`; the page recovers once the file is fixed.
- **Appearance defaults**: `theme` accepts `default` (follows the system: ink when dark, paper when light), `ink`, `paper`, `celadon`, `dusk`; `background_pattern` accepts `none`, `contour`, `flow`, `guilloche`, `stars`, `ridge`; `web_search` sets the default search engine. Choices made in the Appearance panel are stored in the current browser and take precedence over the config.

## Login and security

- Authentication is off when `auth.username` and `auth.password` are both empty or `auth` is omitted, and on when both are set. Setting only one, or whitespace-only credentials, fails startup. Quote YAML special characters in credentials.
- Sessions live in memory, expire after 24 hours, and end on logout or restart. Cookies are HttpOnly and SameSite=Strict; no password or token is stored in localStorage.
- With auth enabled, unauthenticated pages redirect to `/login`; the backend checks the session for the catalog, status, SSE, icons, and redirects. The login page, bundled static assets, and `/health` are public, and health reports only coarse status.
- Login is limited to 5 attempts per minute per directly connected IP. Forwarded headers are not trusted, so users behind a reverse proxy share the proxy's quota.
- The catalog API returns the configured private and public URLs, so never put credentials in URLs. Only let trusted users edit the YAML, because the server requests the sites, icons, and redirect targets listed there.

### Reverse proxy

For remote access, run Navi behind an HTTPS reverse proxy and set `NAVI_AUTH_SECURE_COOKIE=true`. The proxy should:

- disable response buffering for `/api/events`;
- allow long-lived connections beyond the 15-second heartbeat interval;
- forward the original `Host`.

## Container deployment

The Dockerfile installs frontend dependencies from the lockfile, builds `web/dist`, then compiles a static Go binary. The runtime image is distroless with no Node, shell, or curl. Build with version metadata and run:

```sh
VERSION=$(git describe --tags --exact-match HEAD 2>/dev/null || git rev-parse --short HEAD)
COMMIT=$(git rev-parse --short HEAD)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker build \
  --build-arg VERSION="$VERSION" \
  --build-arg COMMIT="$COMMIT" \
  --build-arg BUILD_TIME="$BUILD_TIME" \
  -t navi:local .
docker run --rm -p 127.0.0.1:8080:8080 \
  -v "$(pwd)/configs:/app/configs:ro" \
  -v navi-cache:/app/.cache \
  -e CONFIG_FILE=/app/configs/config.local.yaml \
  -e NAVI_SERVER_LISTEN=0.0.0.0 \
  -e NAVI_STORAGE=/app/.cache \
  navi:local
```

- The container works in `/app` and runs as UID/GID 65532. The example binds the port to the host's loopback for a host-side reverse proxy; choose another bind address for direct remote access. For HTTPS deployments, also pass `-e NAVI_AUTH_SECURE_COOKIE=true`.
- Environment variables override the listen address and cache path without changing local config; `catalog.path: ./urls.yaml` resolves to `/app/configs/urls.yaml`.
- Mount the whole config directory read-only so atomic saves by editors are picked up (a single-file mount keeps pointing at the old file). UID 65532 must be able to traverse the directory and read both YAML files; host-owner-only `0600` permissions are not readable inside the container.
- A named cache volume inherits ownership from the image; an existing volume or bind mount must be writable by UID/GID 65532.
- Probe `/health` from outside the container. HTTP 200 may still report `degraded`; read the authenticated `/api/status` when needed.

## Data and backups

- Only `configs/config.local.yaml` and `configs/urls.yaml` need backups. Config containing credentials should be readable only by administrators and the service user. Custom config instances also live in `configs/`; only `*.example.yaml` files are committed, and the container build context excludes `configs/` entirely, so local config never ends up in an image.
- There is no persistent business database or uploaded content. `.cache/favicons/` is a rebuildable cache that needs no backup; clear it only while the service is stopped.
- Logs go to standard output; sessions end on restart.

## Development

```sh
npm --prefix web run dev
```

The dev server runs at `http://127.0.0.1:10090`. Vite serves a fixed read-only catalog and a signed-in fixture and does not read your local catalog YAML; use the production binary or `test:production` to exercise real login, config, and backend protocols. `npm --prefix web run preview` previews only the static build without backend APIs.

### Tests and checks

Default check order (the frontend must be built before Go checks):

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

Go packages are listed explicitly so `./...` does not pick up third-party Go files inside `web/node_modules`.

Browser tests and component docs:

```sh
(cd web && npx playwright install)
npm --prefix web run storybook:test
npm --prefix web run test:e2e
npm --prefix web run test:visual
npm --prefix web run test:production
```

`storybook:test` is a Storybook test-mode build and does not run browser interaction assertions. Regular E2E tests use the Vite fixture; production integration uses the real Go binary, temporary directories, and synthetic config to cover login, redirects, live reload, and recovery in three browsers. Visual baselines are currently macOS screenshots, and establishing baselines on another OS requires manual review. Full commands, tool setup, performance checks, and manual scope are in [IMPLEMENTATION.md](docs/IMPLEMENTATION.md).

### Continuous integration

CI runs on GitHub Actions, configured in [.github/workflows/](.github/workflows/). It calls the native Go and npm commands above and always builds the web app before compiling Go. Pushes to `main` and pull requests run web lint/typecheck/unit tests/build and the Storybook build; Go format, vet, and race tests; fixture and production-integration E2E in Chromium; and a [GoReleaser](.goreleaser.yaml) snapshot build. Firefox/WebKit and visual tests still run locally; [ACCEPTANCE.md](docs/ACCEPTANCE.md) records what currently passes and what was not run.

## Release builds

```sh
npm --prefix web run build
VERSION=${VERSION:-$(git describe --tags --exact-match HEAD 2>/dev/null || git rev-parse --short HEAD)}
COMMIT=${COMMIT:-$(git rev-parse --short HEAD)}
BUILD_TIME=${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
CGO_ENABLED=0 go build -trimpath -buildvcs=false \
  -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT} -X main.buildTime=${BUILD_TIME}" \
  -o bin/navi ./cmd/navi
./bin/navi --version
```

The resulting `bin/navi` contains the frontend plus version, commit, and build time. An explicit `VERSION` wins; otherwise an exact Git tag on the current commit is used, or the short commit ID when there is none. Without injected values, the binary falls back to the Go-embedded VCS revision (or the commit in a Go pseudo-version) as a short ID, and shows `dev` only when neither exists. The metadata is fixed at build time, so the binary never needs `.git`; uncommitted working-tree changes are not reflected in the commit field.

Pushing a `vMAJOR.MINOR.PATCH` tag (optionally with a `-` prerelease suffix) triggers [release.yml](.github/workflows/release.yml): it checks that the binary reports the tag as its version, then GoReleaser injects the tag, short commit, and commit time the same way, builds linux/darwin amd64/arm64 archives plus `checksums.txt`, and publishes a GitHub Release. Preview locally with `goreleaser release --snapshot --clean`; output goes to the ignored `bin/release/`.

## Project layout

General ownership rules are maintained only in [目录规范.md](目录规范.md) (Chinese). This project's actual layout:

```text
cmd/navi/             program entry point
internal/             config, catalog, navigation, favicon, app, and colocated Go tests
web/                  frontend manifest, tool config, HTML entry, and embed.go
  src/app/            app wiring, API clients, and global state
  src/layouts/        page shell
  src/features/       features with colocated tests and stories
  src/components/     shared UI
  src/lib/            shared keyboard, storage, and URL helpers
  src/styles/         palettes, fonts, and shared keyframes
  src/test/           unit test setup
  tests/fixtures/     development and integration fixtures
  e2e/                browser tests, real-server fixtures, reviewed snapshots
  dist/               generated static assets
configs/              example and local configuration
docs/                 DESIGN, UI_SPEC, IMPLEMENTATION, ACCEPTANCE
bin/                  generated binaries
.cache/               rebuildable icon cache
coverage/             Go coverage reports (generated on demand)
```

Docs (Chinese): [Design and protocol](docs/DESIGN.md) · [UI spec](docs/UI_SPEC.md) · [Development and verification](docs/IMPLEMENTATION.md) · [Current acceptance](docs/ACCEPTANCE.md). Completed plans and outdated acceptance records are kept in Git history and are not current references.

### Layout exceptions

| Rule / standard path | Actual path or behavior | Reason and basis | Scope | Revisit when |
| --- | --- | --- | --- | --- |
| §7.1: without a config file, paths default to the working directory | Without an implicit main config, built-in paths resolve from the directory of the expected `configs/config.local.yaml` | Existing Load/finishConfig protocol in `internal/config/config.go`; keeps paths consistent with or without the implicit file | Default startup of the root Go service | The config protocol is deliberately changed |
| §7.1: select config explicitly via `CONFIG_FILE` | Also supports `-c PATH` / `--config PATH`, with the flag taking precedence | Navi is an executable service; standard CLI config flags were explicitly requested, while the environment variable remains for container deployments | Config selection in `cmd/navi` | The CLI or config protocol is deliberately changed |

## Contributing

Issues and pull requests are welcome. Before submitting:

1. Read [目录规范.md](目录规范.md) and [AGENTS.md](AGENTS.md), and place files according to the existing layout;
2. Pass the default checks in [Tests and checks](#tests-and-checks) locally;
3. Update visual baselines for UI changes and mention it in the PR.

## License

Navi is licensed under the [Apache License 2.0](LICENSE).
