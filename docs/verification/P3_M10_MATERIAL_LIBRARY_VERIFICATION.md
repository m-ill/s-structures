# P3-M10 Material Library Verification

date: 2026-07-02
status: preliminary core locked

## Scope

This note verifies P3-M10 against `docs/phase3/MATERIAL_SECTION_LIBRARY_PLAN.md`.

## Verified Items

| Plan item | Evidence |
| --- | --- |
| Material schema | `src/materials/materialSchema.js`, `tests/p3-m10-materials.mjs` |
| Section schema | `src/materials/sectionSchema.js`, `tests/p3-m10-materials.mjs` |
| Direct section physical consistency warning | `validateSectionRecord()` and `buildLibraryAudit().sectionWarnings` report inconsistent `ry/rz` values |
| Parametric section properties | `src/materials/sectionProperties.js`, `tests/p3-section-properties.mjs` |
| KS H seed table | `src/materials/db/ksH.js`, `tests/p3-section-properties.mjs` |
| `id@version` resolver | `src/materials/registry.js` |
| Legacy unversioned reference warning | `buildLibraryAudit()` migration warnings |
| Registry policy trace | `buildLibraryAudit()` exposes reference format, append-only, scope priority, soft-delete, and legacy migration rules |
| Soft-delete and append-only audit | `softDeletedItems` and `appendOnlyWarnings` expose deleted rows and duplicate version conflicts |
| Agent-readable library report | `buildMaterialLibraryReport()` includes nonlinear and section property summaries |
| Calculation source trace | report rows expose `sourceTrace` with `id@version`, scope, standard/db, and note fields |
| Library edit agent actions | `listLibrary`, `getLibraryItem`, `upsertMaterial`, `upsertSection` in `tests/p3-m10-materials.mjs` |
| Server-backed project library storage | `/api/projects/:id/library/:kind/:itemId` round-trip in `tests/p3-m10-materials.mjs` |

## Added Review Finding

The registry already resolved versioned references, but legacy unversioned references were not clearly exposed in the audit. P3-M10 now records:

1. `unversionedReferences`
2. `migrationWarnings`
3. `resolvedReferences.materials`
4. `resolvedReferences.sections`

The material library report also exposes nonlinear backbone metadata so the later nonlinear milestones can read material readiness without reparsing raw records.

2026-07-02 update: P3-T49 now has an executable library-edit contract. Agent calls can list, fetch, and upsert material/section records with immutable `id@version` behavior. Server routes persist project-scoped library records under the project storage tree and use the same validation path.

2026-07-02 review update: Direct-input section records now keep passing when required positive properties exist, but inconsistent radius values such as `ry != sqrt(Iy/A)` and `rz != sqrt(Iz/A)` are surfaced as audit warnings. This matches the plan requirement for physical-consistency review without blocking legacy direct-input records.

2026-07-02 follow-up: The registry audit now exposes the plan-level policy contract directly. AI agents can inspect `registryPolicy`, `scopeSummary`, `softDeletedItems`, and `appendOnlyWarnings` to verify project/global/built-in priority, append-only versioning, and soft-delete behavior without reimplementing resolver logic.

2026-07-02 report-contract update: `buildMaterialLibraryReport()` now exposes a P3-M10 `contract`, reference/error/warning summary counts, and registry audit summary. Calculation reports and AI agents can verify P3-T46 through P3-T49, `id@version` usage, append-only warnings, soft-delete rows, and migration warnings from the report object without separately rebuilding the registry audit.

2026-07-02 source-trace update: material and section report rows now expose `sourceTrace` with the original reference, resolved `id@version` label, scope, standard, db, and note fields. This makes the plan requirement for calculation-package `id@version` plus source display directly readable by reports and AI agents.

## Current Test Gate

P3-M10 is covered by:

| Test | Coverage |
| --- | --- |
| `tests/p3-m10-materials.mjs` | schema validation, registry resolution, legacy reference migration warning, registry policy trace, soft-delete audit, nonlinear report summary, library edit actions, server storage round-trip |
| `tests/p3-section-properties.mjs` | parametric H-section property comparison with KS seed data |

## Remaining Limits

P3-M10 remains preliminary. A full office-grade KS section database, a polished visual library panel, and owner-approved material catalog policy still remain future hardening items.
