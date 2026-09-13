# Stage A Review And P3-M5 Preflight

date: 2026-07-02
status: ready-for-P3-M5

## Stage A Review Items Closed

1. Malformed URI handling
   - Server API route parameters now decode through `decodePathSegment`.
   - Invalid percent encoding returns the standard JSON error envelope with `BAD_URI`.
   - Static paths reject invalid percent encoding with HTTP 400 instead of throwing.
   - App hash routes return `null` for malformed encoded route params.

2. Agent capability manifest
   - Phase 3 Stage A module versions are now visible in `buildAgentManifest()`.
   - P3-M0 through P3-M4 are listed as available milestones.
   - Stage A data contracts are listed for server API, auth session, persistence envelope, app shell routes, and project browser.

3. P3-M5 readiness
   - Import folders exist as scaffolds: `src/import/dxf`, `src/import/dwg`, `src/import/pointcloud`.
   - Fixture folders exist as scaffolds: `tests/fixtures/dxf`, `tests/fixtures/pointcloud`.
   - Runtime project data remains excluded through `data/` in `.gitignore`.
   - Large raw import files remain excluded by extension rules.

## Remaining Notes Before P3-M5

- The Stage A modeler route is still a host placeholder. Native modeler integration remains a later app-shell task.
- The Phase 3 planning documents contain useful scope, but some terminal views show mojibake. Do not rewrite the whole plan during P3-M5 unless the content itself changes.
- P3-M5 should start with pure geometry utilities and an `ImportCandidate` contract before DXF parsing.

## Verification

Run before starting P3-M5:

```text
npm run test:m68
npm run test:m71
npm test -- --from=68 --to=72
```
