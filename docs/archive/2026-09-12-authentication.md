> 历史计划，仅供追溯；现行路径和命令以 README 为准。

# Account authentication implementation plan

**Goal:** Require login when config.yaml specifies both credentials; otherwise open the home page directly.
**Architecture:** Optional auth configuration, opaque in-memory sessions in HttpOnly cookies, server-side protection for catalog/status/events/icons/navigation. Public login shell and health endpoint. React login gate mounts the catalog only after session verification.
**Tech Stack:** Go net/http and crypto/rand; React, existing theme tokens and Lucide icons.

1. Add strict auth configuration and update both YAML files; both empty disables authentication; partial credentials fail startup. Credentials have no built-in defaults.
2. Implement login/session/logout endpoints, bounded sessions, expiry, login throttling, same-origin mutation checks and protected routes. Test invalid credentials, unauthorized requests, expiration, logout and CSRF.
3. Add responsive themed login form, loading/error feedback, password visibility and logout. Verify frontend types, lint and real browser login flows.
4. Synchronize both READMEs, design, UI and development documentation. Update test fixtures for authentication and run Go and frontend regression suites.

Session lifetime: 24 hours, invalidated on logout or process restart. Main configuration including credentials requires restart. With authentication enabled, only login assets and health remain public. HTTPS deployments set auth.secure_cookie; reverse-proxy forwarding headers are not trusted.

Completed: configuration, server enforcement, responsive login/logout, documentation and regression checks. Final verification details are maintained in ../DEVELOPMENT.md. No repository commit was created; existing workspace changes were preserved.
