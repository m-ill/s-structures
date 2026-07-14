# P8-M10 Code Review

Reviewed: 2026-07-14

## Scope

- Production nonlinear case, preflight, job, result, report, and stale contracts
- Pushover and MDOF NLTH Worker dispatch and lifecycle controls
- Seven-stage setup workflow and movable/resizable result popup
- Index bridge, Agent API, command bridge, manifest, and generated contract
- M10 regression, documentation references, and browser viewport behavior

## Findings Resolved

1. **Self-stale run records**: mutable case status and `lastRun` metadata were
   included in model identity. Product hashing now removes runtime-only fields,
   and the service evaluates immutable model snapshots.
2. **Settings/report mismatch**: reports could reconstruct settings instead of
   preserving the exact dispatched bytes. The job and report contracts now
   retain byte-equivalent settings and hashes.
3. **Legacy hosted model rejected by the new UI**: the default index model did
   not carry every schema-v5 collection. The bridge now performs the canonical
   additive migration before product preflight and writes the migrated model
   back through the host replacement contract.
4. **Result command had no visible empty state**: opening results before a
   completed run was a no-op. The popup now opens with a clear empty-history
   state.
5. **Agent manifest and runtime API drift**: `getNonlinearResult` and the
   production validation alias were advertised but not exposed consistently.
   Agent API, action catalog, command bridge, fixture, and generated contract
   now agree.
6. **Large result duplicated in every job snapshot**: publication metadata
   embedded the complete result object. The bridge now publishes the result to
   the shared result store and retains only bounded publication identifiers and
   qualification metadata in job history.
7. **Default hinge setup was ambiguous**: production preflight now reports
   explicit assumed steel hinge rules and their provenance instead of silently
   inventing assignments.
8. **Result selection drift**: popup tabs and shared active-result state could
   diverge. Selection is now synchronized when jobs or historical runs change.
9. **M8 artifact regression was over-constrained**: a test required an exact
   old shared Worker/runner version. It now verifies the minimum milestone
   version so later compatible protocol revisions remain valid.
10. **Entrypoint regression pinned a Phase 7 cache key**: the end-to-end entry
    test rejected the valid M10 bridge query. It now checks the M10 cache-key
    family and the exported bridge version together.
11. **Human feature manual lagged the executable contract**: all 17 new actions
    and 11 direct APIs are now attached to the nonlinear feature catalog, and
    the generated integrated help is rebuilt from the M10 source manual.

No unresolved P8-M10 blocking finding remains.

## Verification

| Area | Evidence |
| --- | --- |
| M10 contract suites | `npm.cmd run test:p8 -- M10` |
| Shared M8 compatibility | `npm.cmd run test:p8 -- M8` |
| Legacy and Phase 7 regression | M0-M113 segmented full pass; `npm.cmd run test:p7` |
| Phase 8 regression | `npm.cmd run test:p8` (M0-M10 single run) |
| Agent contract | `node tools/check-agent-contract.mjs` |
| Documentation references | `npm.cmd run test:p3docs` |
| Syntax and whitespace | repository syntax checks and `git diff --check` |

Browser checks used the actual index application at 1920x1080, 2560x1440,
1024x768, 768x1024, and 744x1133. The workflow remained contained with zero
control overflow and no page-level horizontal overflow. Drag, resize,
double-click reset, migrated default-model preflight, and result-empty state
were exercised. Browser console errors and warnings were empty.

## Residual Risk and M11 Handoff

- Pushover and NLTH remain `candidate` with `designBlocked: true` until P8-M11.
- Independent reference solutions, external-program comparison, long-duration
  cancellation/restart, representative memory/performance loads, and a real
  project pilot remain M11 work.
- Browser verification did not execute a long full-scale nonlinear solve; Worker
  dispatch and numerical behavior are covered by automated solver fixtures.
- Pushover pause/restart begins from the deterministic initial state. NLTH
  checkpoint resume is available only at committed boundaries.
- The runtime exposes a GPU backend boundary, but no GPU implementation or
  CPU/GPU numerical parity claim is made.
