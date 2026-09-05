# P9-M8 Hybrid Pushover and MDOF NLTH

## Decision

P9-M8 implementation is complete. Qualification remains blocked and the Phase 9 grade remains G2.

Production Pushover and MDOF NLTH now use one versioned resident-session contract for committed element state, accepted-step callbacks, rejected-trial rollback, canonical checkpoints, bounded history transfer, CPU f64 residual/energy audit, and failure recovery. This contract does not replace or alter the Phase 8 formulations.

Existing engineering result fields are unchanged. A backward-compatible top-level `compute` provenance object is added for route, state, transfer, audit, failure and qualification disclosure.

Production nonlinear GPU execution is not enabled. Corotational, hinge-history, and distributed-fiber element kernels remain CPU f64. Existing WebGPU nonlinear kernels remain G2 shadow candidates and cannot feed design results.

## Verification

| Verification | Scope | Result |
| --- | --- | --- |
| `P9-GPU-NL-11~12` | gravity state/checkpoint session parity | PASS |
| `P9-GPU-NL-13~14` | Pushover step, control and recovered-result regression | PASS |
| `P9-GPU-NL-15~16` | hinge transition, event and committed-state parity | PASS |
| `P9-GPU-NL-17~18` | NLTH selected history, envelope and chunk parity | PASS |
| `P9-GPU-NL-19~20` | CPU f64 energy/equilibrium audit | PASS |
| `P9-GPU-NL-21~22` | checkpoint/restart and rejected-trial parity | PASS |
| `P9-FAIL-05~10` | loss/OOM/cancel/corruption containment contracts | PASS |
| `P9-GPU-NL-23~24` | M-tier end-to-end performance/memory/UI | BLOCKED |
| `P9-PERF-13~15` | M-tier Pushover/NLTH budgets | BLOCKED |

The focused fixture completed 4 displacement-control steps, 3 arc-length steps, and 2 NLTH internal steps. The NLTH history emitted 2 bounded chunks and its final relative energy residual was below `1e-3`.

## Failure Policy

- Accepted solver boundaries are the only state-arena commit points.
- Cutback and rejected substeps discard trial bytes and retain the previous committed hash.
- Device loss, OOM, cancel, and callback failures create a recovery checkpoint from the last accepted CPU state.
- Corrupted checkpoint integrity or history chunk hashes stop the run.
- Explicit production GPU requests fail closed; automatic GPU routing remains disabled.

## Open Qualification Work

M-tier Pushover/NLTH time, memory, cancellation latency, and browser UI latency were not run under the user-requested minimal nonlinear test policy. These are qualification blockers, not implementation gaps. G4 `Nonlinear-Candidate` must not be claimed until those runs and production GPU kernel qualification are complete.
