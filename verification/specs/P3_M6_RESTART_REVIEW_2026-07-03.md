# P3-M6 Restart Review

date: 2026-07-03
status: reviewed-core

## Basis

P3-M6 must follow `docs/phase3/IMPORT_DXF_DWG_PLAN.md` and `docs/phase3/P3_M6_M9_REBUILD_ORDER.md`.

The correct restart point is P3-M6, not P3-M14. Existing P3-M5 geometry and M6 import code should be reviewed and strengthened rather than deleted.

## Checked Scope

| Plan item | Current evidence |
| --- | --- |
| ASCII group-code parser | `parseDxf()` reads HEADER, TABLES, BLOCKS, and ENTITIES |
| Wireframe mapping | `importDxfToCandidate()` maps DXF segments to `ImportCandidate` |
| Unit scaling | `$INSUNITS` and normalization audit are tested |
| Layer coverage audit | mapped/unmapped layers and layer usage are exposed |
| Unsupported entity audit | ignored details preserve type, layer, and reason |
| Supported entity audit | LINE, polyline, POINT, TEXT, INSERT/BLOCK, and CIRCLE counts are covered |
| Model follow-up | DXF candidate converts to an analyzable model |

## 2026-07-03 Update

The P3-M6 test now explicitly locks CIRCLE parsing and audit output because the original plan lists CIRCLE as a supported v1 entity. This prevents later DXF parser changes from silently dropping circular column candidates from import review evidence.

## Remaining Limits

P3-M6 is still a core import gate, not real-office DWG validation. More office DXF variants and viewer usability review remain required before production import claims.
