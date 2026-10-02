> 历史计划，仅供追溯；现行路径和命令以 README 为准。

# Directory Layout Implementation Plan

**Goal:** Consolidate frontend ownership, separate runtime configuration and generated binaries, and publish a reusable directory baseline.
**Architecture:** Keep Go's cmd/internal layout and feature-oriented frontend modules. Own frontend sources and embedded output in web; keep runtime YAML in configs and executable output in bin. Preserve config-relative path semantics and existing local data.
**Tech Stack:** Go, React, TypeScript, Vite, Docker, Playwright.

## Decisions

- Merge ui/embed.go into web/embed.go and build web/dist in place. This removes a redundant top-level directory while keeping Go embed assets below their owning package.
- Use configs/config.yaml as the default; explicit -f and configpath retain precedence. Do not silently fall back to obsolete root files.
- Keep generic storage defaults relative to the supplied config; repository example explicitly uses ../storage to retain root storage.
- Track example YAML, ignore actual local YAML; filesystem migration preserves current values. Previously committed secrets require separate history handling; ignore rules do not erase history.
- Keep tool-discovered files at their required roots, Go tests beside code, browser tests in web/tests, and visual baselines versioned. Do not invent empty directories.

## Implementation

1. Move embedding source, runtime YAML, and binary; update package imports, Vite and Dockerfile.
2. Update configuration lookup, examples, path regression tests, Git and Docker ignore rules.
3. Update both READMEs and developer/design docs; add language-neutral DIRECTORY_STRUCTURE.md at repository root.
4. Build and run Go tests/race/vet, frontend lint/typecheck/unit/Storybook/browser/production suites and available static/security checks. Verify local path preservation, default startup and remaining stale references.

## Verification outcome

Recorded after execution in docs/DEVELOPMENT.md.
