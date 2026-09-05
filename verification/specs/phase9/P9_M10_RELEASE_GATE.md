# P9-M10 Qualification, Cleanup and Release Gate

## Decision

P9-M10 implementation is complete. Phase 9 release qualification is `BLOCKED` and the compute grade remains `G2`.

The final gate validates the compatibility registry, compute dependency graph, product-layer dependency rules, public legacy export coverage, evidence hashes, debt ownership, dependency/license inventory, focused CPU/product regression and release package generation. Missing external or full-regression evidence is never converted to PASS.

Automatic GPU routing, production GPU selection, Phase 9 release and design transfer remain disabled.

## Verification

| Verification | Scope | Result |
| --- | --- | --- |
| `P9-REF-11~14` | compatibility/export cleanup, graph and evidence hygiene | PASS |
| `P9-PERF-19~20` | bounded result pipeline and resource lifecycle regression | PASS |
| `P9-REL-01`, `03` | evidence registry and focused CPU/product regression | PASS |
| `P9-REL-07~12` | review, ownership, dependency/license, fail-closed manifest and build | PASS |
| `P9-PERF-16~18` | multi-vendor/browser performance matrix | BLOCKED |
| `P9-REL-02`, `04~06` | complete qualification coverage, full regression and hardware matrix | BLOCKED |

The focused regression intentionally excludes the long full nonlinear suite. It covers baseline static analysis, combinations, Analysis Center, static/eigen Worker products, the shared M9 product service, nonlinear product UI and nonlinear Agent job lifecycle.

## Cleanup Result

- approved compatibility callers: 5
- expired production compatibility callers: 0
- unexpected compatibility callers: 0
- unregistered retained public legacy exports: 0
- compute dependency cycles: 0
- dependency-direction violations: 0
- ownerless debt: 0
- stale or hash-invalid M0~M9 evidence: 0
- unapproved runtime/development dependencies: 0
- open Critical/High code-review findings: 0

Eleven implementation debts are closed. `P9-DEBT-10` is mitigated and retained in the explicit compatibility registry because removing the public synchronous analysis/Pushover surfaces requires separate approval. Those routes are not the product default, cannot use GPU, and cannot permit design transfer.

## Missing Qualification Evidence

1. CPU-only full regression under the approved final test policy
2. integrated/discrete multi-vendor browser and hardware matrix
3. M-tier Pushover/NLTH runtime, memory, UI and cancellation budgets
4. elastic GPU end-to-end speed threshold and S/M profile matrix

The next gate is `external-qualification`; there is no P9-M11 implementation milestone.
