# P3 Plan Alignment Verification

date: 2026-07-02
status: preliminary trace locked

## Scope

This note verifies that the current Phase 3 implementation remains tied to the existing planning documents instead of a newly invented roadmap. The source document set is the 14 core files under `docs/phase3/`, including `PRODUCT_REQUIREMENTS.md`, `ROADMAP.md`, `IMPLEMENTATION_BACKLOG.md`, `ARCHITECTURE.md`, import plans, nonlinear plan, QA plan, and file map.

## Added Review Finding

Phase 3 milestones had local verification notes and tests, but AI agents did not have one stable read API that mapped the plan documents, milestone IDs, ticket IDs, and test evidence. This made it harder to confirm whether later work was following the existing plan.

## Implemented Contract

`buildPhase3PlanAlignmentReport()` now exposes:

| Item | Evidence |
| --- | --- |
| 14 core planning documents | `sourceDocs`, `sourceDocCount` |
| PRD scenarios | `scenarios` for S1 to S5 |
| Functional requirements | `requirements.functional` for FR-01 to FR-32 |
| Non-functional requirements | `requirements.nonFunctional` for NFR-01 to NFR-08 |
| Success criteria and release gates | `requirements.successCriteria`, `requirements.launchGates` |
| Architecture decisions | `architecture.decisions` for D1 to D10 |
| Module boundaries and file routing | `architecture.moduleBoundaries`, `architecture.fileRouting` |
| Server/API/auth/persistence | `serverApi.endpoints`, `errorEnvelope`, `auth`, `persistence`, project library endpoints |
| Frontend and import contracts | `frontend.routes`, `frontend.modules`, `importPipeline` |
| Material and section library | `materialLibrary` fields, registry rules, agent actions, module list |
| Nonlinear engine | `nonlinearEngine` scope ladder N1 to N6, convergence, benchmark, result contracts |
| Agent review gates | `reviewGates` rows for P3-M14 to P3-M20 review paths and final approval fields |
| Milestone maturity | `maturity` records available/preliminary Phase 3 milestone counts from `getCapabilities().milestones` |
| Production readiness separation | `productionReadiness.status` remains `PRELIMINARY_REVIEW_REQUIRED` while any Phase 3 milestone is preliminary |
| P3-M0 to P3-M20 milestone rows | `milestones` |
| Stage A to Stage F grouping | `stages` |
| P3 ticket evidence mapping | each milestone row `tickets`, `docs`, `tests` |
| Absorbed backlog tickets | `absorbedTickets` for P3-T57 and P3-T60 |
| Ticket completion summary | `ticketSummary` records 95 planned, 93 active, 2 absorbed, and 0 unresolved tickets |
| Agent readability | `getPhase3PlanAlignment()` and `phase3PlanAlignment` data contract |
| Phase 3 runner | `tools/run-milestone-tests.mjs --phase3` and `tests/p3-runner-contract.mjs` |
| QA command contract | `qaCommands` in `buildAgentManifest()` and `docs/user-manual/agent-contract.json` |
| Documentation references | `tests/p3-doc-reference-integrity.mjs` verifies local file references and wildcard path references |
| Server route contract | `tests/p3-server-route-contract.mjs` compares declared server routes with the plan-alignment endpoint table |

## Current Test Gate

`tests/p3-plan-alignment.mjs` verifies the report version, 14-document source set, 21 milestone rows, PRD requirement coverage, architecture decision coverage, server endpoint/error/auth/persistence contracts, frontend/import contracts, material/section library contracts, nonlinear engine contracts, zero-dependency package state, server/import boundary guard, manifest module exposure, read API exposure, data contract exposure, and browser-agent API access.

2026-07-02 M6-M20 audit update: the plan-alignment report now separates historical backlog count from effective execution count. The backlog has 95 planned ticket IDs, 93 active milestone tickets, 2 absorbed tickets, and 0 unresolved tickets. P3-T57 is absorbed by the active wind/seismic v2 ticket group, and P3-T60 is absorbed by the active seismic Ax ticket. This prevents the audit from treating explicitly retired backlog rows as missing implementation work.

2026-07-02 runner update: the milestone runner now has a Phase 3 mode. `npm run test:p3` runs the P3-M0 to P3-M20 gate set, while `npm run test:p3:list` prints the exact milestone/test mapping. This makes the QA release plan executable without relying on the older sequential M0 to M91 script numbering.

2026-07-02 agent QA command update: `buildAgentManifest()` and `docs/user-manual/agent-contract.json` now expose `qaCommands` for the full Phase 3 gate, list mode, P3-M6-to-M20 scoped gate, runner contract, and plan-alignment check. This gives AI agents a stable place to discover verification commands instead of inferring them from package scripts.

2026-07-02 document-reference review update: the architecture document now references the actual `server/main.mjs` and `server/router.mjs` server entry/routing split. `tests/p3-doc-reference-integrity.mjs` was added to prevent stale local file references in Phase 3, verification, and user-manual documents.

2026-07-02 server API review update: the actual server already exposed project library routes for M10 material/section storage through `server/routes/libraries.mjs`, but the Phase 3 API plan and plan-alignment contract did not list them. The API plan, alignment endpoint table, and `tests/p3-server-api.mjs` now cover list/read/upsert project library endpoints and role gating.

2026-07-02 frontend route review update: `src/app/routes.js` listed revision and report routes, but `src/app/shell.js` did not mount matching views. Minimal `src/app/views/revisions.js` and `src/app/views/report.js` shell views now make the P3-M4 route contract executable, and `tests/p3-app-shell.mjs` verifies those routes.

2026-07-03 frontend viewer-agent update: `FRONTEND_PLAN.md` listed `getViewerState` and `setViewerSlice` for agent-controlled viewer workflows. `src/viewer/viewerState.js`, `createIndexAgentApi()`, `buildAgentManifest()`, and `docs/user-manual/agent-contract.json` now expose that read/write contract. `tests/p3-viewer-core.mjs`, `tests/m16-agent-capabilities.mjs`, `tests/p3-app-shell.mjs`, and `tests/p3-plan-alignment.mjs` verify the state shape, slice normalization, manifest exposure, and written-plan alignment.

2026-07-03 WebGL viewer contract update: `FRONTEND_PLAN.md` named `modelLayer.js`, `sliceControl.js`, and `picking.js`, but only camera math and point-cloud buffers existed. The viewer folder now includes pure data contracts for model node/member layer rows, z-slice filtering, and color-id picking tables. This does not claim a complete polished WebGL renderer; it gives UI code and AI agents stable data shapes before browser rendering is expanded.

2026-07-02 server route contract update: `tests/p3-server-route-contract.mjs` now scans `server/main.mjs` and `server/routes/*.mjs` route declarations and compares them with `buildPhase3PlanAlignmentReport().serverApi.endpoints`. This prevents Phase 3 API documentation from passing while the implemented server exposes a different route set.

2026-07-03 upload filename hardening: `server/routes/files.mjs` now validates `x-file-name` before saving uploaded drawing or point-cloud files. Invalid percent encoding returns `BAD_URI`, and path-like, control-character, empty, or overlong names return `VALIDATION`, while storage still uses `<fileId>.<ext>` to preserve the traversal block required by `SERVER_API_PLAN.md`.

2026-07-03 server text input hardening: `AUTH_ACCOUNT_PLAN.md` requires JSON validation and string length limits. Project create/update routes now trim and limit project names/descriptions before persistence, and revision saves now reject non-string or overlong notes. `tests/p3-server-api.mjs` covers blank project names, overlong project names/descriptions, and invalid revision notes.

2026-07-02 review-gate alignment update: `buildPhase3PlanAlignmentReport()` now exposes `reviewGates` for P3-M14 to P3-M20. The rows verify that each agent review path is present and that final approval fields remain separate from next-step readiness decisions.

2026-07-03 productization contract update: agent contracts now expose `getPhase3ProductizationMilestoneReview` and `phase3ProductizationMilestoneReview` for P3-M19 to P3-M20. This mirrors the import, elastic, nonlinear, and design milestone review APIs and keeps Stage F owner approval fields explicit.

2026-07-02 maturity separation update: the plan-alignment report now keeps `status: OK` limited to written-plan alignment and exposes `productionReadiness.status` separately. AI agents must treat `PRELIMINARY_REVIEW_REQUIRED` as a hard signal that final engineering/owner review is still required, even when all documented paths and tests are aligned.

For the P3-M6 restart point, the practical order is:

1. Reconfirm drawing input pipeline evidence for P3-M6 to P3-M7.
2. Keep point-cloud work at the planned scaffold level unless owner files are supplied.
3. Lock P3-M10 material/section trace before extending elastic completeness.
4. Treat P3-M14 to P3-M16 nonlinear work as staged engine contracts with benchmark gates, not as a single UI feature.

## Remaining Limits

This is a traceability gate. It proves the implementation has an inspectable plan-to-evidence map, not that every preliminary engineering feature is production-certified. The individual milestone verification notes still define the engineering limits and required owner review.
