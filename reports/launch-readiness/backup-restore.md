# Backup Restore Rehearsal

status: recorded

The Phase 3 persistence contract keeps three layers:

- browser/local autosave
- exported native book files
- server project/revision data

Rehearsal checklist:

1. Export a native book from the UI.
2. Save one server project revision.
3. Restore the native book.
4. Read the project revision back through the server API.
5. Re-run analysis and open the calculation package.

Automated supporting tests:

- `tests/m27-native-persistence.mjs`
- `tests/p3-persistence.mjs`
- `tests/p3-server-api.mjs`
- `tests/p4-backup-tool.mjs`

Phase 4 backup tool:

- `tools/backup-data.mjs --verify` copies a data directory into a backup folder.
- `backup-manifest.json` records file paths and SHA256 hashes.
- Verification re-hashes copied files and fails on mismatch.
