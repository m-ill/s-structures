# P3-M6 Import Verification

date: 2026-07-02
status: preliminary core locked

## Scope

This note verifies P3-M6 against `docs/phase3/IMPORT_DXF_DWG_PLAN.md` and `docs/phase3/IMPLEMENTATION_BACKLOG.md` tickets P3-T26 to P3-T31.

## Verified Items

| Ticket | Plan target | Evidence |
| --- | --- | --- |
| P3-T26 | ASCII DXF group-code parser | `src/import/dxf/parser.js`, `tests/p3-m6-dxf-import.mjs` |
| P3-T27 | DXF entity to geometry | `src/import/dxf/entities.js`, LINE/LWPOLYLINE/POLYLINE/POINT/TEXT/INSERT fixture coverage |
| P3-T28 | unit and origin normalization audit | `$INSUNITS` scaling, missing-unit suspicion, optional bbox-min origin shift, and source bbox trace in `src/import/dxf/importDxf.js` |
| P3-T29 | wireframe to candidate mapping | `wireframeToImportCandidate()` and DXF candidate validation |
| P3-T30 | layer mapping and coverage audit | layer map application plus mapped/unmapped layer audit |
| P3-T31 | import audit report | DXF candidates expose `counts`, `units`, `normalization`, `bbox.sizeM`, `merge`, `mapping`, `orphans`, and `warnings` |

## Added Review Finding

The common `importCandidateToModel()` path previously used point-cloud-specific load labels. It now records generic import metadata and uses source-specific load trace text, so DXF, DWG, and point-cloud candidates can share the same candidate-to-analysis conversion path.

## Current Test Gate

`tests/p3-m6-dxf-import.mjs` now verifies:

1. DXF parser version and header/layer extraction.
2. Entity geometry extraction and unsupported entity audit.
3. Layer map and unit scaling.
4. Valid `ImportCandidate`.
5. Candidate conversion to a model.
6. Successful elastic analysis from the imported DXF candidate.
7. Import audit report fields for counts, units, bbox, merge, mapping, orphans, and warnings.
8. Large-coordinate DXF origin normalization through `normalizeOrigin: 'bbox-min'`.

## Review Update

2026-07-02: P3-M6 DXF import now records unsupported entity details, not only counts. `ignoredDetails` keeps the entity type, source layer, and reason so the import review UI and AI agents can explain why drawing content was not converted.

2026-07-02 follow-up: P3-T31 is now explicitly covered. `importDxfToCandidate()` exposes the full import audit contract required by `IMPORT_DXF_DWG_PLAN.md`, including merge counts and orphan/unknown member lists for AI-agent review.

2026-07-02 layer-audit review: P3-T30/P3-T31 now record DXF layer usage across supported and unsupported entities, not only generated member segments. The audit separates mapped layers, unmapped entity count, unmapped segment count, ignored layers, supported entity count, and unsupported entity count so import review UI and AI agents can explain POINT/TEXT/reference geometry that was not converted into analysis members.

2026-07-02 origin-normalization review: P3-T28 now covers large-coordinate drawing imports. `importDxfToCandidate()` can shift DXF geometry by bbox minimum through `normalizeOrigin: 'bbox-min'`, records the original meter-space bbox in `audit.normalization.sourceBbox`, stores the applied origin in `source.transform.origin`, and adds `bbox.sizeM` for agent-readable scale checks.

## Remaining Limits

P3-M6 remains a preliminary core. It needs more real office DXF fixtures, richer unsupported entity cases, and visual import-review evidence before it can be treated as production-grade drawing import.

2026-07-03 practice-validation update: `getPhase3DrawingImportValidationReview` now records real-office DXF fixture evidence, unit/layer audit presence, analysis readiness, and visual overlay evidence. `tests/p3-drawing-import-validation-review.mjs` uses the existing DXF fixture path as a harness sample while keeping production readiness blocked until owner-reviewed office files are supplied.
