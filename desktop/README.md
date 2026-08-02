# Desktop Packaging Decision

Status: Phase 12 runtime path contract qualified; installer generation remains deferred.

The desktop target wraps the existing local server in an Electron main process:

1. Start `startServer()` on `127.0.0.1` with an available local port.
2. Use a user data directory outside the application install folder.
3. Open the local URL in a single application window.
4. Close the server when the desktop app exits.

Electron dependencies and installer generation are intentionally isolated under
`desktop/` so the core web distribution remains dependency-light.

Phase 12 uses sibling `data/` and `secrets/` directories below Electron's userData
location. The portable web release uses the same server contract. A portable ZIP is
qualified before any signed installer claim is made.
