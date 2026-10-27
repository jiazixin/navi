# Standards alignment implementation plan

**Scope:** Audit the complete Go backend and React frontend against all applicable repository standards, including tests, dependencies, configuration, directory boundaries and CI. Preserve pre-existing work and user configuration. The original eight findings are included; the task is not limited to those findings or two session functions.

**Architecture:** Retain the single Go service with embedded React SPA. Keep domain boundaries, one request module, Context providers in app, TanStack Query data ownership and documented configuration behavior.

## Completed work

1. Read the directory baseline, README, language standards and build configurations; inspect existing changes. Build a clause-indexed audit in [STANDARDS_AUDIT.md](../STANDARDS_AUDIT.md).
2. Review all production/test function signatures, error handling, comments, naming and ownership. Refactor parameter groups, propagate contexts, bound caches/subscriptions, confine filesystem operations and inject test clocks.
3. Align frontend boundaries, URL state, lazy routing, request/error/stream handling, field validation, design variables, component contracts and formatting. Preserve server protocol names and existing SPA fallback behavior.
4. Add regression tests for demonstrated boundary failures and shared API fixtures. Validate types, lint, unit/race/fuzz tests, cross-platform builds, browser interactions, production integration and unchanged Linux visual baselines.
5. Validate fresh installation/build, GoReleaser archives/checksums and a nonroot container with synthetic configuration. Record exact outcomes and unexecuted external checks in [ACCEPTANCE.md](../ACCEPTANCE.md).

All phases are complete. The mandatory Go version-test templates and the existing README exceptions are explicitly recorded, not silently waived. No standards were weakened and no user work was reset. No commit, push, deployment or production restart was performed.
