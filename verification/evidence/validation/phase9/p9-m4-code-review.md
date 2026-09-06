# P9-M4 Code Review

## Decision

Critical findings: 0. High findings: 0. The focused M4 implementation is acceptable for independent raw-kernel qualification with design transfer disabled.

## Findings Resolved During Review

1. **Memory preflight undercounted JavaScript arrays.** The first implementation counted typed arrays only, allowing ordinary arrays to report zero estimated bytes. `backend.js` now computes an operation-specific working set for inputs, outputs and readback, and never accepts a caller estimate lower than the computed value. A regression test verifies rejection before dispatch.
2. **Queue completion failures lacked a stable reason code.** `platform.js` now translates submit/completion failures to `WEBGPU_QUEUE_SUBMISSION_FAILED` and retains `WEBGPU_DEVICE_LOST` when loss state is known. Error-scope and queue-failure tests verify balanced disposal.
3. **The architecture ownership regex missed optional chaining.** The routing test now detects both `navigator.gpu` and `navigator?.gpu`, plus WebGPU constants and shader/device entry points outside the compute backend owner.
4. **Backend provenance omitted kernel/platform versions.** The profile-specific backend build hash now includes backend, kernel runtime, platform, shader catalog and capability hashes.

## Reviewed Boundaries

- WebGPU API usage is confined to `src/compute/backends/webgpu`.
- Shader source has one catalog owner and fixed version/hash provenance.
- Pipeline cache is bounded by the seven-operation catalog.
- Buffer cache has byte and per-key limits; normal, failure, cancellation and loss disposal are balanced.
- Raw f32 results carry `designTransferAllowed: false`.
- `analysisWorker.js` has no WebGPU dependency; M4 cannot alter committed model or design state.
- Explicit GPU requests fail when no qualified GPU backend exists; no silent CPU fallback is introduced.
- No licensed numerical package or external solver dependency was added.

## Residual Risks

- `P9-GPU-PLT-12` remains deferred: integrated GPU, software adapter, second discrete vendor and secondary browser evidence are not yet recorded.
- Local raw kernels are transfer-bound and slower than CPU on the measured fixtures. Production GPU routing remains prohibited until M5 demonstrates resident-buffer reuse and end-to-end benefit.
- Actual device-loss behavior is covered by deterministic injection; physical driver-reset validation remains part of the external hardware matrix.
- M4 reduction is deliberately single-invocation and deterministic, not throughput optimized. A future parallel reduction must preserve tie order and receive a new qualification artifact.

## Regression Policy

Focused Phase 9 tests and nearby M1-M3 compute contracts are required. Long Phase 8 nonlinear suites are not rerun; their qualified evidence is reused as directed.
