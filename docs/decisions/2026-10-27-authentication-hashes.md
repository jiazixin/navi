# Authentication credential storage

The earlier standards alignment replaced plaintext server password configuration with bcrypt hashes and stores only SHA-256 session-token digests. The login wire protocol uses username/password. Plaintext server configuration is rejected explicitly; README documents interactive hash generation. The earlier task recorded a local configuration migration; the later unreleased-project recheck does not modify local credentials or retain a migration adapter.

`golang.org/x/crypto/bcrypt` is now a direct dependency at v0.57.0, already present in the resolved dependency graph. Its BSD-style license is compatible with this project. bcrypt is a maintained Go cryptography package; using it avoids writing a password KDF. Cost is bounded to 10–14 to reject weak or unexpectedly expensive configuration; recommended generation cost is 12. The 72-byte bcrypt limit is documented.

The current govulncheck scan reports no reachable or imported-package vulnerabilities. GO-2026-5932 concerns x/crypto/openpgp, which this application does not import; it has no fixed version and is not suppressed.

The frontend test dependency jsdom resolves undici. Full npm audit found advisories in undici 8.11.2; its compatible lockfile resolution was updated to 8.12.3, and the full audit then reported no vulnerabilities. No unrelated direct dependency was upgraded.
