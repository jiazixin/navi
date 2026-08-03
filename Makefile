.PHONY: test build-ui build lint verify version

VERSION ?= dev
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
BUILD_TIME ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS = -s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.buildTime=$(BUILD_TIME)

test:
	go test ./...

build-ui:
	npm --prefix web run build

build: build-ui
	CGO_ENABLED=0 go build -trimpath -buildvcs=false -ldflags "$(LDFLAGS)" -o navi ./cmd/navi

lint:
	go vet ./...
	npm --prefix web run lint

verify:
	$(MAKE) build-ui
	go test ./...
	go test -race ./...
	go vet ./...
	staticcheck ./...
	govulncheck ./...
	npm --prefix web run lint
	npm --prefix web run typecheck
	npm --prefix web run test
	npm --prefix web run build
	npm --prefix web run storybook:test
	npm --prefix web run test:visual
	npm --prefix web run test:e2e
	npm --prefix web audit --omit=dev
