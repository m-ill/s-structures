# Design Module Verification

## P3-M17 RC Detailed Design

Scope follows `docs/phase3/DESIGN_MODULES_PLAN.md`.

| Ticket | Module | Verification |
| --- | --- | --- |
| P3-T87 | RC beam flexure, shear, torsion warning, serviceability, bar schedule, development and splice trace | `tests/p3-design-rc.mjs` released beam case |
| P3-T88 | RC column PM curve, slenderness, tie schedule, column schedule | `tests/p3-design-rc.mjs` vertical column case |
| P3-T89 | RC wall pier PM, in-plane shear, reinforcement ratios, boundary flag | `tests/p3-design-rc.mjs` wall schedule case |
| P3-T90 | RC slab one-way/two-way mode, punching shear, slab reinforcement schedule | `tests/p3-design-rc.mjs` slab schedule case |

Current status is preliminary. The module produces traceable schedules and registered formula references with standard/clause/title metadata for agent/report consumption, but final clause selection, seismic detailing, constructability, and drawing production remain review items.

2026-07-02 review update: P3-M17 now exposes `rcDesignGate`, flat `rows`, and module-level `issueRows`. The integrated detailed-design report also reads RC schedule rows, so RC WARN/NG items are visible to AI agents through the unified issue list.

2026-07-02 registry update: P3-M17 formula traces now resolve through `src/standards/designFormulaRegistry.js`, so AI agents can inspect `formulaId`, `standard`, `clause`, and `title` instead of parsing opaque formula strings.

2026-07-02 review update: `rcDesignGate` now exposes role coverage rows, `missingRoles`, and `completeRoleCoverage`. RC issue rows also carry formula IDs, so AI agents can tell whether beam, column, wall, and slab checks are present and can jump from WARN/NG rows to the governing formula trace.

## P3-M18 Steel / Connection / Foundation Detailed Design

Scope follows `docs/phase3/DESIGN_MODULES_PLAN.md`.

| Ticket | Module | Verification |
| --- | --- | --- |
| P3-T91 | Steel classification, compression/slenderness, flexure LTB, shear and H1 interaction trace | `tests/p3-design-steel-foundation.mjs` cantilever and frame cases |
| P3-T92 | Brace/connection demand, bolt group, weld, base plate sizing trace | `tests/p3-design-steel-foundation.mjs` frame connection case |
| P3-T93 | Spread footing, combined footing, mat v1, pile group v1 trace | `tests/p3-design-steel-foundation.mjs` frame support reaction case |
| P3-T94 | Integrated detailed design report, formula trace, issue-row bridge | `tests/p3-design-steel-foundation.mjs` integrated report case |
| P3-T95 | Serviceability hook remains available through existing drift/deflection reports and steel deflection trace | Full milestone runner plus M40/M49 coverage |

Current status is preliminary. M18 adds traceable steel, connection, base-plate, and foundation schedules for agent/report consumption. Final local buckling table selection, fabrication detailing, geotechnical settlement, and construction drawings remain review items.

2026-07-02 review update: P3-M18 now exposes `designGate` with P3-T91 to P3-T95 coverage, module versions, formula count, issue count, formula registry version, and a serviceability hook marker. Foundation detailed reports now also expose flat `rows`, so spread, pile, combined, and mat checks are all available to the integrated issue scanner.

2026-07-02 registry update: Steel, connection, base-plate, and foundation formula traces now resolve to registered standard/clause/title metadata. The integrated gate records `unregisteredFormulaCount`, which must stay zero for the current trace set.

## P3-M19 Integrated Results And Report

Scope follows `docs/phase3/ROADMAP.md` Stage F and `docs/phase3/IMPLEMENTATION_BACKLOG.md` P3-T58, P3-T59, P3-T61, and P3-T62.

| Ticket | Module | Verification |
| --- | --- | --- |
| P3-T58 | Integrated result postprocessing, nonlinear trace, and capacity/design package contract | `tests/p3-m19-integrated-report.mjs` integrated result case |
| P3-T59 | Calculation report method and limitation integration | `tests/p3-m19-integrated-report.mjs` detailed report and calculation package HTML case |
| P3-T61 | Approval workflow lock/revoke contract | `tests/p3-m19-integrated-report.mjs` workflow lock case |
| P3-T62 | Full benchmark and representative regression remains green | Full milestone runner |

Current status is preliminary. M19 connects nonlinear trace, detailed-design trace, result postprocessing, and workflow lock state into the report/API contract.

2026-07-02 review update: P3-M19 now exposes `integratedGate` with P3-T58, P3-T59, P3-T61, and P3-T62 coverage. The gate records result postprocessing coverage, nonlinear capacity/step rows, detailed-design issue rows, workflow lock state, method limitations, and benchmark evidence. Detailed HTML and calculation-package HTML now render the gate summary for agent and reviewer inspection.
