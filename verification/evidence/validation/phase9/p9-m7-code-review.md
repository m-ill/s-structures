# P9-M7 Code Review

## Scope

- `src/compute/nonlinear/*`
- `src/nonlinear/equilibrium/assembler.js`
- M7 tests, governance, evidence and status documents

## Findings

Critical: 0

High: 0

Medium: 0 open defects in the M7 scope.

The review found and corrected three issues before completion: batch integrity validation originally checked only hash format, property grouping originally relied mainly on material/section IDs, and an unfrozen caller-supplied committed state could be mutated before the post-evaluation hash rejected it. Validation now recomputes the bounded batch identity, property keys include bounded material and section data, and non-frozen state is exposed to kernels through a recursive read-only proxy without restoring deep clones.

## Architecture Review

- Element and fiber formulations remain under `src/nonlinear`; compute packaging, workspace, state arena and backend capability policy are under `src/compute/nonlinear`.
- `createEquilibriumAssembler` retains the existing output schema and uses the batch adapter internally.
- No backend-specific analysis result schema or design recovery path was introduced.
- Unsupported WebGPU element types and general matrix classes fail explicitly; there is no silent CPU fallback for an explicit GPU production request.
- Existing raw WebGPU kernels remain shadow-only and cannot be marked as physical energy or design-authoritative results.

## Residual Risk

- Full resident Pushover/NLTH state lifecycle, checkpoint restart and device-loss containment belong to P9-M8.
- JavaScript element formulations remain serial; M7 improves data ownership and allocation behavior but is not an end-to-end nonlinear GPU speed claim.
- The integrity hash is intentionally bounded for hot-loop cost. Canonical checkpoints continue to use full state integrity at accepted boundaries.
- External solver/vendor validation is not part of this local review.

## Verification

- `npm run test:p9 -- M7`
- `node tests/p8-m2-equilibrium.mjs`
- `node tests/p8-m4-hinged-frame.mjs`
- `node tests/p8-m6-distributed-fiber-frame.mjs`
- `node tests/p8-m8-fiber-dynamics.mjs`
- `node tests/p8-m9-support-recovery.mjs`
- syntax checks for all new and modified JavaScript modules
- `git diff --check`
