# P9-M4 WebGPU Foundation Verification

## Decision

P9-M4 is implemented and qualifies the independent WebGPU kernel backend as `G2` on the recorded local primary profile. The backend remains non-production and cannot transfer values into analysis, envelope, design or report results. Cross-vendor/browser qualification `P9-GPU-PLT-12` is explicitly deferred to external validation.

## Implemented Scope

- adapter feature/limit discovery and fail-closed device creation
- error scopes, queue completion, cancellation, device-loss state and disposal
- bounded reusable GPU buffer pool, staging/readback and segmented vector storage
- vector scale/AXPY, fixed-order reduction, CSR SpMV and Jacobi kernels
- independent fiber sample and 12x12 frame matrix batch kernels
- one versioned shader catalog owned under `src/compute/backends/webgpu`
- operation-level memory preflight including inputs, outputs and readback buffers
- explicit GPU routing with no silent fallback; small `auto` workloads remain on CPU

## Browser Evidence

| Item | Recorded result |
| --- | --- |
| Browser | Chrome 149 on Windows |
| Adapter | NVIDIA, Ampere architecture |
| Kernels | 7/7 operations, 8 fixtures compile, dispatch and CPU f32 parity PASS |
| Reduction repeat | 5 runs, one result hash |
| Queue | 25 submitted, 25 completed |
| Pool | 35 buffers created, 35 destroyed |
| Peak pooled bytes | 952,320 |
| Design transfer | blocked |

The Euler–Bernoulli frame matrix comparison had `0.125` maximum absolute difference and `1.19e-7` maximum relative difference because large stiffness terms are represented in f32. The 9-wide Timoshenko frame matrix fixture also passed with `0.00390625` maximum absolute difference and `9.78e-8` maximum relative difference.

## Performance Evidence

The measurements include host writes, dispatch, queue completion, mapping and readback. They are kernel-foundation measurements, not an end-to-end acceleration claim.

| Operation | GPU median | CPU f32 median | GPU/CPU |
| --- | ---: | ---: | ---: |
| 65,536-value scale | 47.3 ms | 3.5 ms | 13.51 |
| 4,096-row CSR SpMV | 7.6 ms | 1.0 ms | 7.60 |

GPU is slower for these transfer-bound fixtures, so the current `auto` route correctly selects CPU. M5 must prove reuse and end-to-end benefit before any elastic analysis route can select GPU.

## Verification Mapping

| IDs | Evidence |
| --- | --- |
| P9-GPU-PLT-01~08 | `tests/p9-m4-platform.mjs` |
| P9-GPU-PLT-09~10 | `tests/p9-m4-routing-architecture.mjs` |
| P9-GPU-PLT-11 | `tests/browser/p9-m4-webgpu.html`, local NVIDIA profile |
| P9-GPU-PLT-12 | DEFERRED, external browser/vendor matrix |
| P9-GPU-NUM-01~12 | `tests/p9-m4-numeric.mjs` plus browser raw parity |
| P9-GPU-NUM-13~14 | browser device limits, working-set gate and lifecycle evidence |
| P9-PERF-05~07 | browser raw CPU/GPU samples including transfer |

## Artifacts

- raw browser run: `reports/validation-evidence/phase9/p9-m4-browser-raw.json`
- governed evidence: `reports/validation-evidence/phase9/p9-m4-webgpu-foundation.json`
- review: `reports/validation-evidence/phase9/p9-m4-code-review.md`
- manifest: `docs/verification/phase9/release-manifest.json`

## Scope Boundary

M4 does not connect WebGPU to the production analysis Worker. It does not produce design values, qualify mixed precision, or authorize GPU auto-selection for elastic/nonlinear analysis. Those gates start at M5 and remain fail-closed.
