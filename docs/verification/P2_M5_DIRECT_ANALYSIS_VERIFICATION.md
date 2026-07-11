# P2-M5 Direct Analysis Verification

status: required before direct-analysis mode can be marked practical
related: `docs/phase2/P2_M5_DIRECT_ANALYSIS_IMPLEMENTATION_PLAN.md`

## Purpose

This document defines the verification gate for the geometric-stiffness direct-analysis P-Delta mode.

The gate exists because the current equivalent-load iteration is not the same as a direct tangent-stiffness solve. Direct analysis must prove that it:

- assembles geometric stiffness correctly.
- reduces stiffness under compression.
- handles tension sign convention deliberately.
- reports nonconvergence and tangent singularity.
- produces final second-order design results from the direct solve.

The internal sign convention follows `src/core/signConvention.js`: axial tension is positive and compression is negative. Direct analysis therefore uses `Kt = Ke + Kg(N)`. Compression-positive textbook notation `Kt = Ke - Kg(P)` is equivalent only after sign conversion.

## Verification Scope

| Area | Required evidence |
| --- | --- |
| Matrix assembly | local/global `Kg` symmetry, zero-axial zero matrix, compression/tension sign behavior |
| Solver behavior | first-order baseline, tangent update, convergence trace, singular tangent detection |
| Result contract | `analysis.pDelta.method`, `analysis.pDelta.direct`, common design summary |
| Practical outputs | story theta/B-delta, P-Delta shear/moment, member force amplification |
| UI/report/API | method label, settings, convergence, limitations visible everywhere |

## Required Test Files

| Test | Purpose |
| --- | --- |
| `tests/p6-pdelta-tangent.mjs` | local/global `Kg` sign, tangent assembly, direct-solver contract |
| `tests/p7-m8-beam-column-stability.mjs` | closed-form beam-column amplification and stability gate |
| `tests/p7-m8-direct-parity.mjs` | zero-axial first/second-order result and recovery parity |
| `tests/p7-m8-routing-combo.mjs` | combination routing, result provenance, design eligibility, legacy isolation |

The existing P-Delta tests must continue to pass. Direct-analysis tests must not replace equivalent-load tests.

## Matrix Assembly Tests

### VG-01 Zero Axial Force

Input:

- one 3D frame member.
- axial force `N = 0`.

Expected:

- local `Kg` is all zeros.
- global `Kg` is all zeros.
- matrix dimensions match the element 12-DOF stiffness.

### VG-02 Symmetry

Input:

- one inclined 3D member.
- nonzero compression axial force (`N < 0` in the project sign convention).

Expected:

- local `Kg` is symmetric.
- transformed global `Kg` is symmetric within `1e-10`.

### VG-03 Compression Reduces Lateral Stiffness

Input:

- vertical cantilever column.
- top lateral load.
- increasing compression `P`.

Expected:

- lateral displacement increases as compression increases.
- tangent stiffness proxy decreases.
- no result is reported as `OK` when tangent stiffness becomes singular or near singular.

### VG-04 Tension Behavior

Input:

- same cantilever column.
- axial tension.
- run with `criteria.pdelta.includeTensionKg` true and false.

Expected:

- if true, lateral stiffness increases or displacement decreases compared with zero axial.
- if false, result matches zero-axial `Kg` behavior for tension-only cases.
- report states the selected tension `Kg` option and the tension-positive convention.

## Solver Benchmark Tests

### VS-01 One-Story Shear Building Closed Form

Model:

- one lateral story with equivalent lateral elastic stiffness `k`.
- total gravity load `P`.
- story height `h`.
- lateral load `H`.

Reference:

```text
Delta1 = H / k
keff = k - P / h
Delta2 = H / keff
theta = P * Delta2 / (H * h)
```

Expected:

- direct-analysis top displacement is within tolerance of `Delta2`.
- `Delta2 > Delta1` for compression.
- theta and B-delta match the reference within tolerance.

### VS-02 Cantilever Beam-Column Amplification

Model:

- fixed-base column.
- top lateral load.
- constant axial compression.

Reference:

- compare against a hand-calculation approximation or a locked reference value generated from an independent beam-column solution.

Expected:

- direct result amplifies first-order drift and base moment.
- amplification increases monotonically as compression increases.

### VS-03 Portal Frame Small-Theta Agreement

Model:

- one-bay portal frame.
- gravity load and lateral load.
- small stability coefficient, for example `theta < 0.05`.

Expected:

- direct-analysis story drift and equivalent-load P-Delta final result are close.
- report still labels the two methods separately.

### VS-04 Near-Critical Compression

Model:

- column/frame configured so `Kt` approaches singularity.

Expected:

- solver returns `TANGENT_SINGULAR` or `REVIEW`, depending on threshold.
- reports and agent trace include the warning.
- design summary is not silently marked `OK`.

### VS-05 Nonconvergence

Model:

- use a low `criteria.pdelta.maxIter` or a deliberately unstable case.

Expected:

- solver returns `NOT_CONVERGED`.
- iteration trace is preserved.
- final result is excluded from governing OK design values or marked review/blocking.

## Result Contract Tests

### VR-01 Method Identity

Expected:

```js
analysis.pDelta.method === 'geometric-stiffness-direct'
analysis.pDelta.direct.version === 'pdelta-direct-analysis-v1'
analysis.pDelta.design.method === 'geometric-stiffness-direct'
```

### VR-02 Common Design Summary

Expected:

- `analysis.pDelta.design.summary.comboCount > 0`
- `storyRows` include story drift, height, gravity load, story shear, theta, B-delta, P-Delta shear, P-Delta moment.
- `memberForceRows` include first-order and second-order force values.

### VR-03 Status Propagation

Expected:

- any nonconverged combination is visible in:
  - `analysis.pDelta.direct.combos`.
  - `analysis.pDelta.design.rows`.
  - report warnings.
  - agent API trace.

## UI And Report Tests

### VU-01 Method Control

Expected:

- UI exposes `Equivalent Load` and `Direct Analysis`.
- switching method updates `analysisSettings.pDeltaMethod`; numeric thresholds resolve through `analysisCriteria`.
- existing equivalent-load workflow still works.

### VU-02 Direct Result Labels

Expected UI text:

```text
P-Delta: Direct Analysis (Kt = Ke + Kg(N))
```

Expected report text:

```text
Method: Geometric-stiffness direct analysis (Kt = Ke + Kg(N), tension-positive axial convention)
```

### VU-03 Graph Separation

Expected:

- iteration trace graph is labeled as convergence diagnostics.
- direct-analysis story/member graphs use final direct-analysis results.
- equivalent-load member contribution panel is not shown as direct-analysis design output.

### VU-04 Agent Trace

Expected:

- agent API exposes method, settings, convergence status, limitations, and design summary.
- direct-analysis preliminary status is visible until this verification document's tests pass.

## Tolerances

| Quantity | Tolerance |
| --- | --- |
| matrix symmetry | `1e-10` absolute |
| zero-axial `Kg` | `1e-12` absolute |
| closed-form displacement | `2%` relative for initial implementation |
| story theta/B-delta | `2%` relative |
| monotonic amplification | strict monotonic for benchmark series |
| report/API method label | exact string match |

Tolerances can be tightened after independent benchmark coverage improves.

## Pass Criteria

Direct-analysis mode may be exposed as practical only when:

1. all direct-analysis tests pass.
2. existing equivalent-load P-Delta tests pass.
3. reports identify the selected method.
4. nonconverged and singular cases are blocking or review statuses.
5. no UI or report labels the equivalent-load diagnostic curve as direct-analysis design output.

Until then, the feature must be labeled preliminary.
