# P9-M1 Code Review

## Scope

Reviewed the P9-M1 compute contracts, backend policy, execution plan, Worker lifecycle, engine adapters, compatibility facade, public exports, evidence generator, and changes to Phase 8 backend/Worker ownership.

## Findings Resolved

### High: DomainBinary did not preserve the complete analysis model

The initial typed schema covered common nodal/member loads but could lose advanced fields such as trapezoidal/thermal loads, settlements, and future model extensions. The contract now contains a deterministic UTF-8 full-model payload in addition to typed kernel fields. The current engine adapter reconstructs its input from this payload, and tests cover an advanced load and support settlement.

### High: StateArena could expose committed storage through a retained trial reference

The initial commit swapped trial and committed buffers. A caller retaining the trial array could mutate committed state after commit. Commit now copies trial data into dedicated committed storage, and committed/trial getters return copies. Owner mismatch and retained-reference tests pass.

### Medium: Pre-run Worker errors could be masked as sequence errors

Protocol validation errors have no run event sequence. The client previously applied sequence validation first and could report `COMPUTE_EVENT_SEQUENCE_INVALID` instead of `COMPUTE_PLAN_INVALID`. The client now accepts only the active request ID and preserves pre-run protocol errors before sequence handling.

### Medium: Common transferable traversal lacked its ArrayBuffer predicate

The initial common utility referenced an undefined helper. This broke the existing Phase 8 Worker smoke test after delegation. The helper was restored in the common owner, and `p8-m2-worker-runtime.mjs` passes.

### Medium: Result parity included volatile solver timing

Repeated elastic solves differed only in `solver.sparse.totalSolveMs`. A shared physical-result parity hash now excludes a small explicit allowlist of runtime measurement fields while preserving and returning the complete solver result.

## Refactor Gates

- Backend policy ownership: PASS. Nonlinear `referenceBackends.js` delegates target policy and matrix capability checks to `src/compute/backends/contract.js`.
- Worker transferable ownership: PASS. Phase 8 protocol delegates to `src/compute/runtime/transferables.js`.
- Old protocol growth gate: PASS. Architecture test allowlists the single Phase 8 protocol declaration and blocks compute-core dependencies on UI/solver layers.
- Sync compatibility containment: PASS. Product UI is forbidden, model size is bounded, owner is required, and expiry/deletion milestones are recorded.

## Residual Risk

- M1 establishes contracts and adapters; it does not yet replace the existing sparse solver or move elastic production execution fully into the common runtime.
- Browser Worker integration and UI latency evidence belong to later milestones.
- Long nonlinear suites were intentionally not rerun; regression confidence uses existing Phase 8 evidence plus short Worker/backend compatibility tests.

## Review Decision

No open Critical or High findings remain in the P9-M1 scope. M1 is acceptable as a `G1 Contract-Integrated` candidate with release and design-transfer gates closed.
