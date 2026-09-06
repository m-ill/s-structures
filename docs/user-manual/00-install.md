# 00 Install

## Web Distribution

1. Install Node.js LTS.
2. Extract `s-structures-0.1.0.zip`.
3. Optionally copy `config.sample.json` to `config.json`. The package automatically serves only `public/`.
4. Start with `node server/main.mjs`.
5. Open `http://127.0.0.1:5173/`.

Environment variables override `config.json`: `PORT`, `HOST`,
`S_STRUCTURES_STATE_DIR`, `S_STRUCTURES_DATA_DIR`, `S_STRUCTURES_SECRETS_DIR`,
`S_STRUCTURES_STATIC_ROOT`, `S_STRUCTURES_CONFIG`,
`S_STRUCTURES_ALLOW_REGISTRATION`, and `S_STRUCTURES_ALLOW_NETWORK_BIND`.

By default data and session secrets are stored in separate directories under the
operating-system user state location, outside the installation folder. A non-loopback
host requires `S_STRUCTURES_ALLOW_NETWORK_BIND=true` and a separately qualified LAN profile.
Registration is disabled by default.

If a previous installation has `data/secret.key`, stop the server and run:

    node tools/migrate-state.mjs --source=OLD_DATA --data=NEW_DATA --secrets=NEW_SECRETS --dry-run
    node tools/migrate-state.mjs --source=OLD_DATA --data=NEW_DATA --secrets=NEW_SECRETS --rotate-secret

The migration never merges into a non-empty target. Secret rotation invalidates all old sessions.

## Desktop Scaffold

The desktop target is scaffolded under `desktop/`. It starts the same local
server and opens the app window. Installer generation is deferred until
Electron dependencies and a clean-machine smoke are approved.

## Backup

Run `node tools/backup-data.mjs --dataDir=DATA --out=BACKUP --verify`.
The backup manifest records SHA256 hashes for every copied file and excludes session secrets by default.
Restore only to an empty location:

    node tools/restore-data.mjs --backup=BACKUP --dataDir=RESTORED_DATA
