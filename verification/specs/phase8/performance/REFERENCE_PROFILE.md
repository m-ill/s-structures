# Phase 8 M11 Reference Performance Profile

- Status: `BLOCKED`
- Measurement hash: `7d30faac7a8416a1c533c12a`
- Qualification hash: `56e37a98063f8c546ded569d`
- Backend: `p8-wasm-sparse-v1`, `f64`, deterministic `true`
- Sparse kernel: 10000 DOF, 500 solves, median 3014.186 ms
- Streaming: 20000 outputs, 0 retained bytes
- Parallel Worker: `PASS`, 2 workers

| ID | Status | Blocker | Scope |
| --- | --- | --- | --- |
| NL-PERF-01 | PASS | - | Small dense/separate-reference versus WASM sparse cross-check and timing recorded. |
| NL-PERF-02 | BLOCKED | M_TIER_PUSHOVER_END_TO_END_REQUIRED | Medium 3D frame Pushover with 100 accepted/output steps measured end to end. |
| NL-PERF-03 | PASS | - | Target-size sparse memory estimate and measured kernel stay within the fixed budget. |
| NL-PERF-04 | PASS | - | Long NLTH output history is streamed with zero retained chunk payload bytes. |
| NL-PERF-05 | PASS | - | Cancellation preserves the committed boundary and a fresh run can restart. |
| NL-PERF-06 | PASS | - | Production backend diagnostics report no dense allocation or fallback. |
| NL-PERF-07 | BLOCKED | BROWSER_UI_LATENCY_EVIDENCE_REQUIRED | Browser main-thread input acknowledgement p95 stays within 100 ms during an M-tier Worker run. |
| NL-PERF-08 | PASS | - | Cancellation acknowledgement is returned within two seconds. |
| NL-PERF-09 | PASS | - | Missing production WASM backend blocks execution without reference fallback. |
| NL-PERF-10 | PASS | - | Unchanged topology reuses the symbolic pattern and ordering. |
| NL-PERF-11 | PASS | - | Trial/output buffers and restart state remain bounded by explicit retention contracts. |
| NL-PERF-12 | BLOCKED | M_TIER_PUSHOVER_END_TO_END_REQUIRED | Reference-hardware M-tier production-frame Pushover satisfies time and memory budgets. |
| NL-PERF-13 | BLOCKED | M_TIER_NLTH_END_TO_END_REQUIRED | Reference-hardware M-tier production-frame NLTH satisfies time and memory budgets. |
| NL-PERF-14 | PASS | - | Result streaming keeps analysis-retained history bounded as output count grows. |
| NL-PERF-15 | PASS | - | Chunk and checkpoint hashes validate and restart reproduces the committed state. |
| NL-PERF-16 | PASS | - | Independent Worker runs preserve result norms and event ordering. |

Kernel timing is not an end-to-end frame timing. M-tier Pushover/NLTH and browser input-latency evidence remain blocked until measured with the approved fixtures.
