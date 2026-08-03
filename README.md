# Navi

Navi is a documentation-first personal navigation system built around one idea:
turn a human-readable YAML catalog into an exceptionally polished UI/UX experience.

The Go backend loads `urls.yaml`, exposes a read-only catalog, watches for valid
file changes, and resolves private/public destinations. The React frontend is
embedded into the Go binary and focuses on fast search, responsive layout,
accessibility, and polished monochrome presentation.

> Project status: the `0.1` frontend milestone is complete. The Go backend now loads real YAML,
> watches valid updates, caches derived favicons, resolves private/public destinations, exposes the
> read-only API, and embeds the production frontend into the `navi` binary.

[中文说明](README.zh-CN.md)

## Product Contract

- `urls.yaml` is the only source of truth for navigation content, grouping, and order.
- There is no login, database, drag-and-drop ordering, web editor, or write API.
- Entries are rendered in YAML order. Group order is determined by first appearance.
- Private URLs are preferred; Navi falls back to public URLs when private endpoints
  cannot be reached.
- Valid YAML changes are hot-reloaded and pushed to open pages.
- Favicons are discovered automatically and cached under the configured `datadir`.
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

Navi selects its main configuration in this order:

1. `-f /path/to/config.yaml`
2. the lowercase `configpath` environment variable
3. `./config.yaml`

Relative paths are resolved from the directory containing the selected main config.

```yaml
datadir: ./data

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
Validated images are stored under `datadir/favicons` and served locally. This
directory is a disposable derived cache; it never contains a second copy of the
navigation catalog.

## Documentation

- [Design](docs/DESIGN.md): product behavior, architecture, configuration, APIs, and UI rules.
- [UI specification](docs/UI_SPEC.md): component geometry, responsive behavior,
  viewport matrices, visual regression, and layout assertions.
- [Coding standards](docs/CODING_STANDARDS.md): production naming, organization,
  error handling, dependencies, and deprecation gates.
- [Implementation](docs/IMPLEMENTATION.md): ordered, test-first build plan.
- [Acceptance](docs/ACCEPTANCE.md): reproducible functional, UI, performance, and security gates.
- [Change log](docs/CHANGELOG.md): live requirements and design decision history.

All future implementation must follow these documents. Behavioral changes must update
the change log and every affected document in the same change.

UI/UX quality and production engineering quality are release gates. Correct functionality
alone is not enough when the experience feels unfinished or the code relies on deprecated,
weakly typed, poorly owned, or unbounded behavior.

Unexpected overflow, overlap, clipping, inconsistent spacing, or different component
geometry between supported display modes also blocks release.

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
```

The development server uses the deterministic read-only fixture in `web/vite.config.ts` to emulate
the backend contract. It exists only for frontend development and acceptance, is not a second catalog
source of truth, and is excluded from the production bundle.

## Single-Binary Build

```bash
make verify
make build
./navi -f ./config.yaml
./navi --version
```

`make build` generates the frontend bundle, embeds it into `navi`, and injects the version, commit, and
build time. Production does not require Node; Node is only used to produce the embedded frontend assets.

## Container Build

```bash
docker build -t navi:local .
docker run --rm -p 8080:8080 \
  -v "$(pwd)/config.yaml:/app/config.yaml:ro" \
  -v "$(pwd)/urls.yaml:/app/urls.yaml:ro" \
  -v navi-data:/data \
  navi:local -f /app/config.yaml
```

The container runs as a non-root user. Mount `config.yaml` and `urls.yaml` read-only; keep `datadir` on the
separate writable volume by setting `datadir: /data` in the mounted configuration.

## Deployment Note

The example binds to `127.0.0.1` because Navi has no built-in authentication.
When binding to `0.0.0.0`, place it behind appropriate network access controls or
an authenticated reverse proxy.
