# P3-M20 Launch Readiness Verification

date: 2026-07-02
status: preliminary core locked

## Scope

This note verifies P3-M20 against `docs/phase3/QA_RELEASE_PLAN.md` and `docs/phase3/IMPLEMENTATION_BACKLOG.md` tickets P3-T63 to P3-T67.

## Verified Items

| Ticket | Plan item | Evidence |
| --- | --- | --- |
| P3-T63 | Packaging smoke for web/server launch path | `buildPackagingReadiness()` and `tests/p3-launch-gate.mjs` |
| P3-T64 | License policy record | `buildLicenseReadiness()` and `LICENSE.txt` evidence |
| P3-T65 | Onboarding sample and manual refresh | `docs/user-manual/PHASE3_LAUNCH_MANUAL.md`, `agent-contract.json` |
| P3-T66 | Performance/security launch gate | `buildLaunchReadinessReport()` G1 to G14 |
| P3-T67 | Ten beta pilot scenario reports | `reports/launch-readiness/pilot-01.md` to `pilot-10.md` |
| Agent trace | `getLaunchReadinessReport()` includes `releaseGate` |

## Added Review Finding

P3-M20 had a launch readiness report, but it did not expose a milestone-level gate for AI agents. P3-M20 now exposes `LAUNCH_READINESS_GATE_VERSION` through `releaseGate`.

The gate records:

1. P3-T63 to P3-T67 ticket coverage
2. required launch gates G1 to G14
3. packaging, license, manual, QA, pilot-report, and backup/restore coverage
4. manual sign-off items that still require owner review

2026-07-02 review update: `releaseGate.ticketCoverage` now maps P3-T63, P3-T64, P3-T65, P3-T66, and P3-T67 to explicit evidence rows. The rows expose packaging smoke, license record, manual/agent-contract freshness, performance/security/backup gate state, and ten-pilot coverage for reviewer and AI-agent inspection.

2026-07-02 ticket coverage review update: `releaseGate` now exposes a formal P3-M20 contract, feature-to-ticket map, and `summary.ticketCoverage` alias. This matches the P3-M17 to P3-M19 gate shape so reviewers and AI agents can inspect launch-readiness scope without relying on UI-only labels.

2026-07-02 release maturity review update: `releaseGate` now exposes `contract.maturity` and `releaseReview`. The review records owner-review readiness separately from production deployment approval, open-source policy finalization, deployment target finalization, pilot feedback acceptance, and backup/restore owner acceptance. A clean gate returns `ready-for-owner-release-signoff`, not final release approval.

2026-07-02 production-readiness review update: the launch report now also exposes top-level `productionReadiness` and summary fields. `status: OK` means launch evidence gates are green; `productionReadiness.status` remains `OWNER_REVIEW_REQUIRED` until owner sign-off and production deployment approval are explicitly recorded.

## Current Test Gate

`tests/p3-launch-gate.mjs` verifies launch report status, G1 to G14 pass count, release-gate ticket coverage, top-level production-readiness separation, packaging smoke evidence, license evidence, manual/agent-contract evidence, ten pilot reports, agent API exposure, and manifest data-contract exposure.

## Remaining Limits

P3-M20 remains preliminary. It proves repository-level launch readiness evidence, not final production deployment sign-off. Owner review is still required for license policy, deployment target, real DWG conversion, real point-cloud validation, field pilot feedback, backup/restore rehearsal evidence, and security sign-off.

2026-07-03 productization milestone contract update: P3-M20 now participates in `getPhase3ProductizationMilestoneReview`. The review contract maps packaging smoke, license policy record, onboarding/manual/agent contract, performance/security launch gate, and beta pilot scenarios to `releaseGate.releaseReview` while keeping `productionDeploymentApproved` owner-controlled.

2026-07-03 executable review update: `node tests/p3-productization-milestone-review.mjs` now locks the P3-M19 to P3-M20 productization milestone review contract. The Phase 3 runner includes this check in the P3-M20 group so integrated-result readiness, launch readiness, gate paths, `finalStructuralSignoff`, and `productionDeploymentApproved` remain agent-readable and owner-controlled.

2026-07-03 owner sign-off contract update: `getPhase3OwnerSignoffReview()` now exposes the seven manual owner checklist rows from `reports/launch-readiness/owner-signoff-checklist.md`. A clean checklist can return `owner-signoff-ready-for-final-deployment-decision`, but `productionDeploymentApproved` remains false until the owner explicitly records final deployment approval outside the automated gate.
