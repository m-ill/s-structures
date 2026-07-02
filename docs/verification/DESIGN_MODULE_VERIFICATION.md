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

2026-07-02 contract review update: P3-M17 RC beam, column, wall, and slab rows now expose ticket-specific contracts and compact summaries. The RC detailed-design report exposes a top-level P3-M17 contract, and `rcDesignGate.summary` now reports agent-readiness, role coverage, issue count, formula count, and role-by-role status counts.

2026-07-02 ticket coverage review update: `rcDesignGate` now exposes a formal P3-M17 contract, feature-to-ticket map, and `summary.ticketCoverage`/`ticketCoverage` rows for P3-T87 to P3-T90. The rows preserve partial-coverage cases, so agents can distinguish a valid beam/wall/slab report from a complete beam/column/wall/slab RC package.

2026-07-02 RC maturity review update: `rcDesignGate` now exposes `contract.maturity` and `rcReview`. The review records complete role coverage, missing roles, issue count, formula count, unregistered formula count, covered tickets, and an `agentDecision`. This keeps partial RC schedules usable for review without implying final permit design approval.

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

2026-07-02 review update: `designGate.coverage` now reports ticket-level coverage for steel, connection, foundation, issue/formula linking, and serviceability. Integrated issue rows preserve `formulaIds`, so AI agents can navigate from WARN/NG items to the governing formula references instead of re-scanning every module.

2026-07-02 registry update: Steel, connection, base-plate, and foundation formula traces now resolve to registered standard/clause/title metadata. The integrated gate records `unregisteredFormulaCount`, which must stay zero for the current trace set.

2026-07-02 contract review update: P3-M18 steel, connection, bolt, weld, base-plate, and foundation rows now expose ticket-specific contracts and compact summaries. The integrated detailed-design report exposes a top-level P3-M18 contract, and `designGate.summary` reports agent-readiness, complete ticket coverage, issue count, formula count, unregistered formula count, serviceability hook, and module status counts.

2026-07-02 ticket coverage review update: `designGate` now exposes a formal P3-M18 contract, feature-to-ticket map, and `summary.ticketCoverage`/`ticketCoverage` rows for P3-T91 to P3-T95. Coverage rows include evidence strings for steel, connection, foundation, formula/issue linking, and serviceability hooks so reports and AI agents can use the same gate pattern as M17.

2026-07-02 integrated maturity review update: `designGate` now exposes `contract.maturity` and `designReview`. The review records complete coverage, issue count, formula count, unregistered formula count, module statuses, and explicit false flags for final permit design, fabrication readiness, and geotechnical certification. Agents can now tell when M18 is ready for M19 result integration without treating it as a sealed construction package.

2026-07-03 design milestone contract update: P3-M17 to P3-M18 now expose `getPhase3DesignMilestoneReview`. The review contract maps RC, steel, connection, foundation, report/formula, and serviceability scopes to the existing `rcDesignGate` and `designGate` paths while keeping `finalPermitDesign` separate from trace readiness.

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

2026-07-02 review update: `integratedGate.ticketCoverage` now maps P3-T58, P3-T59, P3-T61, and P3-T62 to explicit evidence rows. Detailed report and calculation package HTML render this ticket coverage table so reviewers and AI agents can verify integrated result, report, workflow, and benchmark coverage without reconstructing it from nested traces.

2026-07-02 contract review update: P3-M19 now exposes top-level `contract` and `summary.readyForReviewer` fields in `phase3IntegratedResults`. The gate summary records complete ticket coverage, covered ticket count, benchmark status, method limitation count, nonlinear step rows, capacity points, design issue rows, and workflow approval state. Detailed report and calculation-package HTML also surface ready-for-review and ticket-coverage status.

2026-07-02 ticket coverage review update: `integratedGate` now exposes a formal P3-M19 contract, feature-to-ticket map, and `summary.ticketCoverage` alias for P3-T58, P3-T59, P3-T61, and P3-T62. This keeps integrated result readiness consistent with the M17 and M18 gate contracts used by reports and AI agents.

2026-07-02 integrated result maturity review update: `integratedGate` now exposes `contract.maturity` and `integratedReview`. The review records complete ticket coverage, benchmark evidence, method limitation count, detailed-design review status, and explicit false flags for final structural sign-off and launch readiness. Agents can now move M19 evidence into M20 launch review without treating the integrated result as an approved design.

2026-07-03 productization milestone contract update: P3-M19 now participates in `getPhase3ProductizationMilestoneReview`. The review contract maps integrated result postprocessing, calculation report limitations, workflow lock, and benchmark regression to `integratedGate.integratedReview` while keeping `finalStructuralSignoff` separate from trace readiness.

2026-07-03 engineering-validation update: `getPhase3EngineeringValidationReview` now records the remaining professional validation evidence shared by nonlinear analysis and detailed design. It keeps final KDS clause selection, nonlinear solver certification, detailing/constructability, fabrication, and geotechnical approval separate from automated trace readiness.

2026-07-03 executable review update: `node tests/p3-design-milestone-review.mjs` now locks the P3-M17 to P3-M18 design milestone review contract. The Phase 3 runner includes this check in the P3-M18 group so RC, steel, connection, foundation, formula/issue, serviceability scope, gate paths, and `finalPermitDesign` ownership remain agent-readable.
