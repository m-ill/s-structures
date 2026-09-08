# Install Smoke - Desktop Scaffold

status: owner-decision-scaffold
date: 2026-07-03

Scope: Phase 4 WP-08 target B, desktop distribution.

Decision:

Desktop packaging is scaffolded but not promoted to the required v1.0 installer
gate in this environment. The repository now contains:

- `desktop/package.json`
- `desktop/main.mjs`
- `desktop/README.md`

The desktop entry imports `startServer()` directly, starts a local server on
`127.0.0.1`, stores data under the application user-data directory, and closes
the server on app quit.

Reason for deferral:

Electron and installer dependencies are intentionally isolated under
`desktop/`. Dependency installation and NSIS installer generation require a
separate dependency approval and clean-machine smoke. That is outside the
current pre-beta implementation pass.
