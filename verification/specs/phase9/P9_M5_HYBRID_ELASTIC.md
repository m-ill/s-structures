# P9-M5 Hybrid Elastic Verification

## Decision

The P9-M5 implementation is complete, but the milestone qualification gate is blocked. Static elastic and Direct P-Delta can run through an explicit WebGPU mixed-precision route, and the recorded local run passed original-system CPU f64 residual, result parity, design-status parity and resource-lifecycle checks. The measured end-to-end GPU route did not beat the CPU threshold, so qualification remains `G2` and `auto` GPU selection stays disabled.

## Implemented Scope

- SPD symmetry, scaling, conditioning and positive-definite eligibility checks
- resident WebGPU f32 Jacobi-PCG matrix sessions with fixed reduction order
- CPU f64 residual audit and bounded iterative correction against the original equation
- capture/replay of assembled elastic component systems without repeating model expansion
- factor-group reuse for multiple load-combination right-hand sides
- existing CPU recovery, envelope, equilibrium audit and design paths reused after correction
- Direct P-Delta asynchronous tangent solve with a fresh GPU session for every changed tangent matrix
- explicit GPU route with fail-closed behavior and no silent CPU replacement
- profile-gated `auto` route shared by execution planning and the production adapter

## Local Browser Evidence

| Item | Recorded result |
| --- | ---: |
| Browser adapter | NVIDIA Ampere |
| SPD fixture | 512 rows, 1,534 nonzeros |
| Maximum backward error | 1.8215e-11 |
| Maximum load-relative residual | 5.4591e-11 |
| Static displacement delta | 1.0797e-13 |
| Direct P-Delta amplification delta | 2.1316e-14 |
| Direct tangent sessions | 11 created, 0 reused |
| GPU resources | 38 created, 38 destroyed |
| Resident SPD median | 10.4 ms |

The frame matrix batch kernel remains a qualified shadow kernel. Production design values use canonical CPU f64 assembly, GPU f32 SPD solve, CPU f64 correction, and the existing CPU recovery/design path.

## Performance Decision

The 990-DOF diagnostic frame produced a CPU median of 684.10 ms and a GPU median of 1,131.70 ms, for a speedup of 0.604 against the required 1.2. Only three diagnostic samples were retained and an M-tier qualified profile was not completed. Therefore:

- `P9-GPU-ELA-15`: FAIL
- `P9-GPU-ELA-16`: BLOCKED
- `P9-PERF-08`: FAIL
- `P9-PERF-09`: PASS
- `P9-PERF-10`: FAIL
- global design transfer: blocked
- explicit GPU diagnostic route: available
- automatic GPU route: disabled

## Evidence

- raw browser run: `reports/validation-evidence/phase9/p9-m5-browser-raw.json`
- governed evidence: `reports/validation-evidence/phase9/p9-m5-hybrid-elastic.json`
- code review: `reports/validation-evidence/phase9/p9-m5-code-review.md`
- release manifest: `docs/verification/phase9/release-manifest.json`
- focused tests: `npm run test:p9 -- M5`
- evidence generation: `npm run evidence:p9:m5`

## Remaining Qualification Work

The GPU solver needs a stronger preconditioner and less setup/recovery overhead before rerunning five-sample S/M end-to-end qualification. Cross-vendor/browser evidence remains external. Until both close, no profile may set `elasticCandidateApproved: true` in production.
