# Owner Sign-Off Checklist

status: pending-owner-review

This checklist records the manual decisions that remain after the automated Phase 3 launch gate passes.

## Required Before Public Release

| Item | Status | Evidence owner must attach |
| --- | --- | --- |
| License policy | Pending | Chosen open-source or private distribution license |
| Deployment target | Pending | Local-only, office LAN, hosted server, or packaged desktop decision |
| Real DWG conversion | Pending | Converter path and one real drawing conversion record |
| Real point-cloud validation | Pending | At least one field scan import/extraction note |
| Field pilot feedback | Pending | User feedback from the ten pilot scenarios |
| Backup restore rehearsal | Pending | Actual backup and restore timestamp and operator |
| Security sign-off | Pending | Owner review of auth, upload, path, and data storage posture |

## Automated Evidence Already Available

- `npm.cmd test`
- `tests/p3-launch-gate.mjs`
- `reports/launch-readiness/performance-security.md`
- `reports/launch-readiness/backup-restore.md`
- `reports/launch-readiness/pilot-01.md` to `pilot-10.md`
- `docs/phase3/P3_COMPLETION_AUDIT_2026-07-02.md`

## Rule

Do not treat this checklist as a final approval. It is the handoff record that separates repository readiness from owner deployment approval.
