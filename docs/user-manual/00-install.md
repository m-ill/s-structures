# 00 Install

## Web Distribution

1. Install Node.js LTS.
2. Extract `s-structures-0.1.0.zip`.
3. Copy `config.sample.json` to `config.json` and set `port`, `host`, and `dataDir`.
4. Start with `node server/main.mjs`.
5. Open `http://127.0.0.1:5173/`.

Environment variables override `config.json`: `PORT`, `HOST`,
`S_STRUCTURES_DATA_DIR`, `S_STRUCTURES_CONFIG`, and
`S_STRUCTURES_ALLOW_REGISTRATION`.

## Desktop Scaffold

The desktop target is scaffolded under `desktop/`. It starts the same local
server and opens the app window. Installer generation is deferred until
Electron dependencies and a clean-machine smoke are approved.

## Backup

Run `node tools/backup-data.mjs --dataDir=./data --out=./backup --verify`.
The backup manifest records SHA256 hashes for every copied file.
