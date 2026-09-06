# P3-M5 Input Pipeline

date: 2026-07-02
status: implemented

## Scope

P3-M5 adds the shared geometry core used by drawing and point-cloud imports before file-specific parsers are attached.

## Implemented

- Tolerance point merge, short segment filtering, and duplicate segment removal.
- Story and grid inference from normalized 3D nodes.
- Member axis classification into column, beam, brace, or unknown.
- `ImportCandidate` contract for later DXF, DWG, and point-cloud review workflows.
- Point-cloud pipeline shell so real files can attach later without changing the import contract.

## Next

- P3-M6 should add the DXF group-code parser and map line/polyline entities into the P3-M5 wireframe path.
- P3-M7 can add DWG conversion and 2D plan/story assembly.
- P3-M8/M9 should wait for representative point-cloud files, while keeping synthetic fixtures for automated tests.
