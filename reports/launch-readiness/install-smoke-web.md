# Install Smoke - Web Distribution

status: recorded-local
date: 2026-07-03

Scope: Phase 4 WP-08 target A, web distribution.

Evidence:

- `npm run test:m108` created `output/release/s-structures-0.1.0/`.
- `npm run test:m108` created `output/release/s-structures-0.1.0.zip`.
- SHA256 sidecar file was created next to the zip.
- Release manifest includes `index.html`, `app.html`, `src`, `server`, `docs/user-manual`, `CHANGELOG.md`, and `config.sample.json`.
- Release manifest excludes `tests`, `reports`, `data`, and `.git`.
- `npm run test:m17` verifies `/` and `/index.html` serve the desired entry point.
- `npm run test:m111` expands the release zip into a fresh temporary folder,
  starts `server/main.mjs` from that unpacked folder, and verifies `/`,
  `/index.html`, and `/api/health`.

Decision:

This is an automated local install smoke from a freshly unpacked release zip,
not an external clean-machine installation. A separate machine smoke remains
required for a GA gate, but Phase 4 pre-beta packaging mechanics are present,
independently unpackable, and reproducible.
