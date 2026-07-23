# P10-M11 Code Review

Date: 2026-07-22
Decision: **IMPLEMENTATION COMPLETE / RELEASE BLOCKED**

## 2026-07-23 independent-verification remediation

The 2026-07-22 review remains as the historical implementation-gate record. Independent verification subsequently found that
the original M9 plate/flat-shell CPU path was not numerically qualified. That finding was reproduced, fail-closed in M11, and
then remediated with QM6-EAS, MITC4, a Hughes–Brezzi curl-compatible drilling penalty, warped-reference-plane rigid arms, and
Q4 consistent pressure loads.

The expanded CPU f64 contract contains 35 records covering distorted membrane patches, rectangular aspect/thickness and mesh
convergence, raw rigid and curvature invariants, modal response, drilling compatibility, warped rigid modes, and consistent
pressure equilibrium. All 35 must pass. The `shell-numerical-qualification` check is therefore green for the remediated CPU
path; the regenerated M9 artifact hash is `45389db66c1633dc99e11566`.

This does not qualify the WebGPU shell formulation. The implemented GPU scope reconstructs CPU-precomputed f32 matrices,
performs fixed-order gather, and applies generic recovery operators. It does not generate QM6-EAS, MITC4, or drilling
stiffness from material and geometry. Native formulation generation and device qualification remain release blockers. Under
the strict external-source policy only XV-01 is currently green: XV-02 is a hand calculation and is source-ineligible, while
XV-03~10 still require eligible external references.

## Scope reviewed

- Product integration contract across model, Analysis Center, results, reports, calculation packages, and Agent API.
- Feature catalog/manual entry and `resolveFeatureEnabled` toggle.
- 120-shell performance measurement with CPU f64 and precomputed-transport GPU f32 shadow parity.
- Fail-closed gate for exact milestone case IDs, versions, source/artifact hashes, recomputed metrics, duplicate evidence,
  regression, docs, Agent contract, XV-01~10, performance evidence, and native WebGPU.

## Findings

No critical or high CPU formulation finding remains after remediation. Release is blocked by missing qualification evidence:

1. XV-02 is source-ineligible because its hand calculation is not an independent external reference.
2. XV-03~08 external solver references and XV-09~10 independent references are pending.
3. Formulation-native WebGPU shell stiffness generation is not implemented or qualified. Precomputed matrix
   reconstruction/gather/generic recovery parity is narrower and cannot satisfy this gate.
4. Native WebGPU multi-device/browser qualification is missing; CPU fallback remains the production route.

The gate must not emit `externally-cross-validated` or enable automatic native WebGPU routing until these items close.
CPU f64 element qualification does not certify a user-model mesh. Shell design transfer therefore remains blocked by
`SHELL_MODEL_MESH_CONVERGENCE_REQUIRED`; warning-warped elements additionally require engineering review. Phase 10 release
as a whole remains blocked.

> **Precedence:** this remediation closes the temporary internal `shell-numerical-qualification` blocker. It does not close
> external XV or formulation-native WebGPU blockers.

The v5 evidence-integrity gate validates all 11 M0~M10 milestone artifacts, the exact 35-record M9 contract, the complete
performance measurement, and the XVAL artifact. It recomputes each supported relative error from `computed`, `reference`, and
`scale` instead of trusting a reported PASS or hash alone. The committed M11 artifact hash is
`913eb882ff87cbc58d7ecc58`; `shellModelDesignTransfer.status=LIMITED` remains separate from the green CPU element/kernel
qualification.

## Verification

- `node tools/run-phase10-tests.mjs M11`
- `node tests/p10-m9a-membrane-qualification.mjs`
- `node tests/p10-m9b-plate-qualification.mjs`
- `node tests/p10-m9b-shell-invariants.mjs`
- `node tests/p10-m9c-flat-shell-qualification.mjs`
- `npm.cmd run test:p4manual`
- `npm.cmd run test:p4guide`
- `npm.cmd run check:agent-contract`
- `npm.cmd run test:p3docs`
- `npm.cmd test`

Evidence: `reports/validation-evidence/phase10/p10-m11-release-gate.json`.
