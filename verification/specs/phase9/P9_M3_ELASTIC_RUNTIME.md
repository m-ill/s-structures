# P9-M3 Production Elastic Runtime Verification

## Decision

P9-M3 passes the focused production elastic gate. Release and design-transfer permissions remain closed. Existing Phase 8 nonlinear evidence is reused and no long nonlinear suite was rerun.

## Implemented Runtime

- `src/compute/elastic/factorGroups.js`: stiffness identity and settlement/unilateral/Direct P-Delta invalidation rules.
- `src/compute/elastic/factorSession.js`: persistent per-group component factors and ordered RHS channels.
- `src/compute/sparse/iccg.js`: fail-closed IC(0)-preconditioned CG for large SPD systems.
- `src/compute/adapters/elasticProductionAdapter.js`: staged combination execution, progress, cancellation, result slices and bounded storage.
- `src/compute/product/elasticAnalysisService.js`: Worker-only product API and on-demand detailed combination execution.
- `src/solver/linear3d*.js`: staged orchestration, stiffness cache, incremental envelope and unchanged recovery/design/audit transfer.
- `src/solver/domain/constraintSystem.js`: sparse-row contract for large uncoupled support systems.

## Verification Mapping

| IDs | Test | Coverage |
| --- | --- | --- |
| P9-ELA-01~04 | `tests/p9-m3-elastic-runtime.mjs` | group keys, one factor, ordered RHS and response parity |
| P9-ELA-05~08 | `tests/p9-m3-elastic-runtime.mjs` | envelope, governing, design and audit parity |
| P9-ELA-09~12 | `tests/p9-m3-elastic-runtime.mjs` | settlement reuse and unilateral/Direct P-Delta invalidation |
| P9-ELA-13~16 | `tests/p9-m3-worker-product.mjs` | progress, cancel, bounded partial state and sync restrictions |
| P9-API-04~06 | `tests/p9-m3-worker-product.mjs` | product Worker service, detailed rerun and physical result contract |
| P9-PERF-01~04 | `tools/run-p9-m3-evidence.mjs` | S regression, M total runtime, bounded memory and disposal |

## Performance Evidence

| Fixture | Result |
| --- | --- |
| S-tier | production 1,955.43 ms; reference 3,187.74 ms; ratio 0.613 |
| M-tier | 8,112 active DOF; 8,456 members; 30 combinations; 87,942.67 ms |
| M factor reuse | one IC(0) preparation, 30 solves, 29 reused RHS channels |
| M result storage | complete 8,456-member envelope plus 30 bounded slices |
| Factor memory | 1,090,976-byte peak; balanced after dispose |

The M-tier budget is the first executable production baseline and is set to 240 seconds. Future changes must not silently relax it.

## Numerical Evidence

- displacement absolute max: `5.09e-14 m`
- displacement relative L2: `8.78e-7`
- force/member absolute max: `0.7001 kN`
- force/member relative L2: `0.00644`
- design maximum-ratio difference: `0`
- analysis/design/audit statuses and envelope source IDs: equal

The force tolerance is a migration tolerance against the older `1e-6` CG reference, not a general GPU acceptance tolerance.

## Scope Boundary

M3 does not claim GPU execution. It does not migrate every current UI/Agent caller; that deletion and migration gate remains P9-M9. Direct P-Delta tangent systems and unilateral active sets are isolated rather than incorrectly sharing a linear-static factor.
