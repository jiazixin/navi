# Navi

Navi is a documentation-first personal navigation system built around one idea:
turn a human-readable YAML catalog into an exceptionally polished UI/UX experience.

The Go backend loads `urls.yaml`, exposes a read-only catalog, watches for valid
file changes, and resolves private/public destinations. The React frontend is
embedded into the Go binary and focuses on fast search, responsive layout,
accessibility, and polished monochrome presentation.

> The Go backend loads YAML, watches catalog updates, caches favicons and resolves links.
> The production frontend is embedded in the binary. See [development and verification](docs/IMPLEMENTATION.md) for current checks and limitations.

[中文说明](README.zh-CN.md)


## Repository Layout and First Run

See [the reusable directory standard](目录规范.md). This project uses:

```text
cmd/navi/       Go executable entry point
internal/       Backend and configuration loading code, with colocated tests
web/            Frontend sources, tooling, tests, and Go embedding entry point
  src/app/      API, providers, application assembly
  src/layouts/  Application shell
  src/features/ Domain components and logic
  src/components/ Reusable UI
  src/styles/   Global styles and motion tokens
  src/test/     Unit-test setup
  tests/        Shared fixtures and contract tests
  e2e/          Browser tests, production fixtures and snapshots
  dist/         Generated static bundle (ignored)
configs/        Runtime and catalog YAML; only example files are committed
bin/            Generated executable (ignored)
.cache/         Local favicon cache (ignored)
docs/           Design, development notes, and plans
```

Initialize configuration once from the repository root; existing files are preserved:

```sh
cp -n configs/config.example.yaml configs/config.local.yaml
cp -n configs/urls.example.yaml configs/urls.yaml
```

Run commands from the repository root. `CONFIG_FILE` explicitly selects a file relative to the process working directory (use an absolute path in deployment). Otherwise only `configs/config.local.yaml` is checked; an absent file uses built-in defaults. An explicitly empty or missing path fails. Catalog YAML is still required. Relative paths inside the configuration resolve from its directory; the default `storage: ../.cache` keeps favicon caches at the application root.

## Product Contract

- `urls.yaml` is the only source of truth for navigation content, grouping, and order.
- Account/password login is optional. Navigation remains read-only; there is no database, drag-and-drop ordering, web editor, or catalog write API.
- Entries are rendered in YAML order. Group order is determined by first appearance.
- Private URLs are preferred; Navi falls back to public URLs when private endpoints
  cannot be reached.
- Valid YAML changes are hot-reloaded and pushed to open pages.
- Favicons are discovered automatically and cached under the configured `storage`.
- An open search workbench launches Baidu, Google, Yandex, Bing International, GitHub,
  ChatGPT, Claude, or Gemini from an expanding pill and icon menu. On desktop, a pointer visit holds the
  pill open for eight seconds before it retracts, while the first navigation group remains visible.
- The default UI is black, white, and neutral gray; optional contrast themes keep a calm canvas
  and reserve color for group markers, icons, focus, selection, and hover feedback.
- Natural motion connects page entry, card feedback, search reflow, favicon arrival,
  hot reload, and theme changes.
- Animation follows the browser and display's native refresh rate, including 165Hz;
  Navi does not impose a 60fps or other artificial maximum.
- Eight deterministic line patterns have distinct ambient motion, including lower-left long-exposure
  star trails. Motion stops automatically when the system requests reduced motion.
- Production code follows an explicit naming, package ownership, strict typing,
  lifecycle, and zero-deprecated-API standard.
- Responsive behavior is specified for phones, tablets, desktops, ultrawide displays,
  orientation changes, zoom, high DPI, touch, and keyboard/mouse input.
- Shared components have fixed geometry contracts, Storybook state coverage,
  cross-browser visual tests, and automated overlap/alignment assertions.

## Configuration

Configuration priority is environment variables > selected file > built-in defaults. Set fields with `NAVI_<FIELD>` or `NAVI_<SECTION>_<FIELD>`, for example `NAVI_SERVER_PORT=8081`, `NAVI_CATALOG_WATCH=false`, or `NAVI_FAVICON_FETCH_TIMEOUT=3s`. Strings are preserved literally; booleans, numbers and durations are validated. Set `CONFIG_FILE=/absolute/path/config.local.yaml` to select a file. Relative field paths resolve from the selected file's directory (the default is `configs/`).

```yaml
auth:
  username: ""
  password: ""
  secure_cookie: false

storage: ../.cache

# Themes: default, navy-blossom, mint-tide, moss-court, tea-mist,
# amber-tide, sunny-coast, violet-lime.
theme: default

# Background patterns: none, meridian-grid, orbital-rings, pisces,
# sagittarius, roman-meander, rose-window, eight-point-star, star-trails.
background_pattern: meridian-grid

# Default web search: baidu, google, yandex, bing, github, chatgpt, claude, gemini.
web_search: baidu

server:
  listen: 127.0.0.1
  port: 8080
  read_header_timeout: 5s
  read_timeout: 20s
  write_timeout: 30s
  idle_timeout: 90s
  shutdown_timeout: 10s

health:
  uri: /health

logging:
  level: info
  format: json
  access_log: true
  log_health_checks: false

catalog:
  path: ./urls.yaml
  watch: true
  reload_debounce: 250ms

navigation:
  private_probe_timeout: 800ms
  public_probe_timeout: 1200ms
  probe_cache_ttl: 30s
  max_concurrent_probes: 32

favicon:
  fetch_timeout: 3s
  refresh_interval: 168h
  max_file_bytes: 1048576
  workers: 4
```

## URL Catalog

```yaml
version: 1

pages:
  - id: page1
    title: My Navigator
    subtitle: Work, services, and frequently used resources
    urls:
      - name: Grafana
        group: Infrastructure
        description: Metrics and dashboards
        private_url: http://grafana.lan:3000
        public_url: https://grafana.example.com
        tags: [monitoring, metrics]

  - id: page2
    title: Reading and Inspiration
    urls:
      - name: Are.na
        group: Inspiration
        public_url: https://www.are.na
        tags: [research]
```

At least one of `private_url` and `public_url` is required. Only HTTP and HTTPS
destinations are accepted. Page and link order follow the `pages` and `urls`
arrays exactly. The bottom icon pagination switches between pages.

Navi discovers `link rel="icon"` declarations and falls back to `/favicon.ico`.
Validated images are stored under `.cache/favicons` and served locally. This
directory is a disposable derived cache; it never contains a second copy of the
navigation catalog.

## Documentation

- [Design and protocol](docs/DESIGN.md): configuration, data model, API, lifecycle and deployment boundaries.
- [UI specification](docs/UI_SPEC.md): visual and interaction contracts.
- [Development and verification](docs/IMPLEMENTATION.md): commands, release checks and known limitations.

Update the affected contract and regression tests when behavior changes. Historical plans and verification records remain available in Git history.

## Login

Leave both `auth.username` and `auth.password` empty (or omit `auth`) to open the home page directly without login. Set both to enable authentication; setting only one is a configuration error. Values are compared exactly; quote passwords containing YAML punctuation. Whitespace-only credentials are invalid. Changes require a restart. The example leaves authentication disabled; choose your own account and password to enable it.

When authentication is enabled, unauthenticated visits redirect to `/login`; successful login opens `/`. Catalog, status, events, icons and `/go/` destinations require a server-validated session. Use the top-bar logout button to end it. Sessions last 24 hours, use HttpOnly/SameSite=Strict cookies, and are invalidated on logout or process restart. Open pages recheck sessions every 30 seconds and on focus. No password or token is stored in browser localStorage.

Login attempts are limited to five per minute per direct peer IP (a reverse proxy shares this quota); successful login resets that peer's counter. HTTPS proxy deployments must set `auth.secure_cookie: true`; forwarded headers are not trusted. The login shell, bundled assets and configured health endpoint remain public. Health returns only coarse service health.

## Frontend Development

```bash
npm --prefix web ci
npm --prefix web run dev
```

Production frontend build and full frontend gates:

```bash
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run test
npm --prefix web run build
npm --prefix web run storybook:test
npm --prefix web run test:visual
npm --prefix web run test:e2e
npm --prefix web run test:production
```

The development server uses the deterministic read-only fixture in `web/vite.config.ts` to emulate
the backend contract with a pre-authenticated session. Actual login is verified by `test:production`. It exists only for frontend development and acceptance, is not a second catalog
source of truth, and is excluded from the production bundle.

## Single-Binary Build

```bash
npm --prefix web run build
VERSION=${VERSION:-dev}
COMMIT=${COMMIT:-$(git rev-parse --short HEAD)}
BUILD_TIME=${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
CGO_ENABLED=0 go build -trimpath -buildvcs=false \
  -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT} -X main.buildTime=${BUILD_TIME}" \
  -o bin/navi ./cmd/navi
CONFIG_FILE=./configs/config.local.yaml ./bin/navi
./bin/navi --version
```

These commands generate the frontend bundle, embed it into `bin/navi`, and inject the version, commit, and
build time. Production does not require Node; Node is only used to produce the embedded frontend assets.

## Container Build

Prepare the `configs` directory containing `config.local.yaml` and `urls.yaml`. Set `server.listen: 0.0.0.0`, `catalog.path: ./urls.yaml`, and `storage: /app/.cache`. Mount the directory so atomic file replacements remain visible.

```bash
docker build -t navi:local .
docker run --rm -p 8080:8080 \
  -v "$(pwd)/configs:/app/configs:ro" \
  -v navi-cache:/app/.cache \
  -e CONFIG_FILE=/app/configs/config.local.yaml \
  navi:local
```

The container runs as a non-root user. Mount `config.local.yaml` and `urls.yaml` read-only; keep `storage` on the
separate writable volume by setting `storage: /app/.cache` in the mounted configuration.

## Deployment Note

Navi requires login only when an account and password are configured in `auth`. Empty credentials allow public access. For remote access, use HTTPS (directly through a TLS reverse proxy) and set `auth.secure_cookie: true`. The example binds to `127.0.0.1`; containers may use `0.0.0.0`. Keep configuration files private and do not place credentials in destination URLs.

## Development Commands and Runtime State

CI/CD invokes Go and npm commands directly. See [development and verification](docs/IMPLEMENTATION.md) for the full check sequence.

```sh
go mod download
npm --prefix web ci
npm --prefix web run dev

npm --prefix web run build
go run ./cmd/navi
```

Install browser binaries before browser tests: `cd web && npx playwright install`. Direct Go compilation requires `npm --prefix web run build` first. Storybook: `npm --prefix web run storybook:test`. Optional audits: `staticcheck ./internal/... ./cmd/... ./web`, `govulncheck ./internal/... ./cmd/... ./web`, and `npm --prefix web audit --omit=dev`.

There is no persistent business database or upload state. Back up `configs/config.local.yaml` and `configs/urls.yaml`; protect credentials with restrictive read permissions. `.cache/favicons/` is rebuildable and does not require backup; mount `/app/.cache` writable by container UID 65532. Sessions live in memory and reset on restart. No empty `data/` directory is needed. Remove only generated outputs when cleaning; preserve configuration and runtime data.
