# P2-M5 Direct Analysis Implementation Plan

status: implementation-ready draft
owner: solver / results / UI
related: `P2_M5_ADVANCED_ELASTIC_TRACE.md`, `P2_T25_T50_PRACTICE_VALIDATION.md`, `docs/verification/P2_M5_DIRECT_ANALYSIS_VERIFICATION.md`
workpackages: `P2_M5_DIRECT_ANALYSIS_WORKPACKAGES.md`

## Purpose

The current P-Delta implementation is an equivalent lateral-load iteration. It is useful for sway amplification review and transparent design summaries, but it is not the same as a geometric-stiffness direct analysis.

This document defines the missing direct analysis mode:

```text
Kt = Ke + Kg(N)
```

where:

- `Ke` is the elastic global stiffness matrix.
- `Kg(N)` is the geometric stiffness contribution assembled from member axial force.
- `N` follows `src/core/signConvention.js`: axial tension is positive and compression is negative.
- compression reduces tangent lateral stiffness.
- the final output is a second-order elastic result, not just a diagnostic P-Delta curve.

Literature that defines compression as positive often writes the same idea as `Kt = Ke - Kg(P)`. S-Structures must use the internal tension-positive convention and implement the signed form above.

The implementation must keep the current equivalent-load method available. The new mode is an additional selectable method for practical design review.

## Method Separation

| Method | Purpose | Output status |
| --- | --- | --- |
| Equivalent lateral-load iteration | Practical sway P-Delta visualization, story theta/B-delta, member contribution diagnostics | Keep as current `equivalent-load-iteration-design-combo-final` |
| Geometric-stiffness direct analysis | Elastic second-order frame analysis using `Kt = Ke + Kg(N)` with tension-positive axial force | New `geometric-stiffness-direct` mode |
| Full nonlinear geometry | Corotational/large displacement, load/displacement control, material hinge degradation | Phase 3 nonlinear engine, not this milestone |

Direct analysis must not reuse the equivalent-load result and simply relabel it. It must assemble a tangent stiffness using member axial force and solve with the tangent matrix.

## Non-Goals

This milestone does not implement:

- material nonlinearity.
- plastic hinge degradation.
- large-rotation corotational beam-column behavior.
- arc-length or displacement-control tracing.
- code-certified direct analysis automation without project-specific validation.

Those remain Phase 3 nonlinear engine responsibilities. This milestone is elastic small-displacement second-order analysis.

## User Workflow

1. User enables P-Delta.
2. User selects method:
   - `Equivalent Load`
   - `Direct Analysis`
3. User configures direct-analysis options:
   - maximum iterations.
   - displacement tolerance.
   - axial-force tolerance.
   - include tension geometric stiffness.
   - notional-load option.
   - stiffness-reduction factor.
4. Solver runs combinations with the selected method.
5. Results show:
   - design summary by combination and direction.
   - story stability table.
   - selected-member direct analysis force comparison.
   - convergence and tangent-stiffness warnings.
6. Reports and agent API state the exact method used.

## Settings Contract

Method selection remains under `analysisSettings` for backward compatibility. Numeric limits and design-code-dependent thresholds are resolved from Phase 6 `analysisCriteria`, with legacy `analysisSettings.*` keys used only as fallback.

```js
analysisSettings: {
  pDeltaEnabled: true,
  pDeltaMethod: 'equivalent-load' | 'direct-analysis'
},

analysisCriteria: {
  preset: 'kds' | 'asce' | 'eurocode' | 'custom',
  criteria: {
    pdelta: {
      eR: 1e-6,
      eU: 1e-6,
      eE: 1e-8,
      maxIter: 30,
      ampLimit: 2.5,
      includeTensionKg: true,
      notionalLoad: false,
      notionalRatio: 0.002,
      stiffnessReduction: 1.0,
      thetaCaution: 0.05,
      thetaRequire: 0.10,
      thetaStrong: 0.20
    }
  }
}
```

Default behavior must remain compatible with existing models. If `pDeltaMethod` is absent, use the current equivalent-load method.
If `analysisCriteria` is absent, resolve criteria from legacy settings such as `pDeltaTolerance`, `pDeltaMaxIterations`, `pDeltaThetaNegligible`, and `pDeltaThetaLimit`, then record the fallback in the trace.

## Result Contract

Keep `analysis.pDelta.design` as the common design-summary shape so UI and reports can read either method. Add a method-specific `direct` block.

```js
analysis.pDelta = {
  method: 'geometric-stiffness-direct',
  design: {
    version: 'pdelta-design-summary-v1',
    method: 'geometric-stiffness-direct',
    summary: {
      comboCount,
      rowCount,
      storyRowCount,
      memberForceRowCount,
      maxTheta,
      maxBDelta,
      maxPDeltaShear,
      maxPDeltaMoment,
      governing,
      status
    },
    rows: [],
    storyRows: [],
    memberForceRows: [],
    notes: []
  },
  direct: {
    version: 'pdelta-direct-analysis-v1',
    settings: {},
    combos: [
      {
        comboId,
        comboName,
        ok,
        status,
        converged,
        iterationCount,
        firstOrderDisplacementNorm,
        finalDisplacementNorm,
        maxDisplacementDeltaRatio,
        maxAxialDeltaRatio,
        minTangentPivot,
        maxCompressionRatio,
        warnings: [],
        iterations: [
          {
            iteration,
            displacementNorm,
            displacementDeltaRatio,
            axialDeltaRatio,
            residualRatio,
            maxCompression,
            maxKgToKeProxy
          }
        ]
      }
    ],
    limitations: []
  }
}
```

Required status values:

| Status | Meaning |
| --- | --- |
| `OK` | Direct analysis converged and stability limits are inside configured thresholds |
| `REVIEW` | Converged but theta/B-delta/compression/tangent metrics require engineer review |
| `NOT_CONVERGED` | Iteration limit reached |
| `TANGENT_SINGULAR` | Tangent matrix is singular or nearly singular |
| `UNSUPPORTED_MODEL` | Releases/constraints/load state cannot be safely handled by direct mode yet |
| `NOT_RUN` | P-Delta disabled or no eligible combinations |

Reports must not collapse `NOT_CONVERGED`, `TANGENT_SINGULAR`, or `UNSUPPORTED_MODEL` into `OK`.

## Solver Algorithm

### Stage 1: First-Order Solve

For each load combination:

1. Assemble `Ke`.
2. Assemble external load vector `F`.
3. Apply support/constraint reduction.
4. Solve:

```text
Ke * u0 = F
```

5. Recover first-order member forces and axial force `N0`.

### Stage 2: Direct Geometric-Stiffness Iteration

Use total-displacement iteration for the first implementation.

```text
uPrev = u0
NPrev = recoverAxial(uPrev)

for i = 1..maxIterations:
  Kg = assembleGeometricStiffness(NPrev) // signed by tension-positive axial force
  Kt = stiffnessReductionFactor * Ke + Kg
  uNext = solve(Kt, F + Fnotional)
  NNext = recoverAxial(uNext)

  check:
    displacementDeltaRatio = norm(uNext - uPrev) / max(norm(uNext), eps)
    axialDeltaRatio = norm(NNext - NPrev) / max(norm(NNext), eps)
    residualRatio = proxyResidual(Kt, uNext, F)

  if all tolerances pass:
    converged = true
    break

  uPrev = uNext
  NPrev = NNext
```

The first version may use a residual proxy because the element force recovery is linear elastic. The trace must say it is a tangent-update direct elastic method, not full Newton-Raphson geometric nonlinearity.

### Stage 3: Final Recovery

After convergence:

1. Recover final displacements.
2. Recover final member end forces and station forces.
3. Compute second-order member-force comparison:
   - first-order `N`, `Vy`, `Vz`, `My`, `Mz`.
   - direct-analysis final `N`, `Vy`, `Vz`, `My`, `Mz`.
   - amplification ratios.
4. Compute story drift, theta, B-delta, P-Delta shear, and P-Delta moment from final direct-analysis displacements.
5. Populate the common `analysis.pDelta.design` contract.

## Geometric Stiffness Matrix

Local DOF order:

```text
[u1, v1, w1, rx1, ry1, rz1, u2, v2, w2, rx2, ry2, rz2]
```

Use member local axes already produced by the frame element.

For a prismatic member of length `L`, local geometric stiffness is assembled into the two bending planes. A standard 2D beam-column geometric stiffness block is often written with axial compression `P` as positive:

```text
P / (30L) *
[
  36    3L   -36    3L
  3L   4L2   -3L  -L2
 -36   -3L    36   -3L
  3L   -L2   -3L  4L2
]
```

Apply the block to:

| Local bending plane | DOFs |
| --- | --- |
| local `v-rz` plane | `v1, rz1, v2, rz2` |
| local `w-ry` plane | `w1, ry1, w2, ry2` |

Sign convention:

- Do not introduce a second internal convention for direct analysis.
- Use `SIGN_CONVENTION.memberForces`: axial tension is positive.
- Compression is therefore `N < 0`, and `Kt = Ke + Kg(N)` reduces lateral tangent stiffness.
- If `analysisCriteria.criteria.pdelta.includeTensionKg` is true, tension `N > 0` is assembled as stabilizing stiffness. If false, clamp member axial force to `min(N, 0)` before `Kg` assembly.

Matrix requirements:

- local `Kg` must be symmetric.
- global transformed `Kg` must be symmetric within tolerance.
- zero axial force must produce a zero matrix.
- member releases must be handled explicitly; unsupported release states must produce `UNSUPPORTED_MODEL`, not silent results.

## Notional Loads And Stiffness Reduction

Direct analysis may include optional practical-design modifiers:

| Option | Behavior |
| --- | --- |
| `criteria.pdelta.notionalLoad` | Add lateral notional load as a fraction of gravity load |
| `criteria.pdelta.notionalRatio` | Default `0.002` |
| `criteria.pdelta.stiffnessReduction` | Multiplies elastic stiffness before tangent solve |

Implementation rule:

- These modifiers must be visible in UI, report, and agent trace.
- If enabled, direct-analysis output must state that the result includes notional load and/or reduced stiffness.
- If disabled, output must state `notionalLoad: false` and `stiffnessReduction: 1.0`.

## UI Requirements

### P-Delta Control

Add a method control near the existing P-Delta controls:

```text
P-Delta: Off | Equivalent Load | Direct Analysis
```

Direct Analysis settings should be compact and not occupy the modeling canvas permanently:

- max iterations.
- tolerance.
- notional load toggle.
- stiffness reduction input.
- tension `Kg` toggle.

### Results

The main result panel must show method-specific labels:

| Method | Label |
| --- | --- |
| equivalent load | `P-Delta: Equivalent Load Iteration` |
| direct analysis | `P-Delta: Direct Analysis (Kt = Ke + Kg(N))` |

For direct analysis, the member click panel should show:

- selected combination.
- first-order force.
- direct-analysis final second-order force.
- amplification ratio.
- convergence status for that combination.

The old selected-member `Ndelta/L` panel remains diagnostic for equivalent-load mode. It should not be presented as the direct-analysis design value.

### Graphs

Direct analysis graphs must be separated from equivalent-load graphs:

| Graph | Direct mode meaning |
| --- | --- |
| Global response | combination-level first-order vs final second-order displacement |
| Story response | story drift/theta/B-delta from final direct result |
| Member response | selected member first-order vs final force and amplification |
| Iteration trace | convergence diagnostics only |

The UI must not show only two iteration points as the "P-Delta curve" unless it is explicitly labeled as an iteration trace.

## Report Requirements

Every report containing P-Delta output must include:

- method name.
- settings.
- convergence status.
- limitation note.
- design summary table.
- story stability table.
- governing combination/direction/story.
- selected member or governing member second-order force comparison.

For direct analysis, reports must include:

```text
Method: Geometric-stiffness direct analysis (Kt = Ke + Kg(N), tension-positive axial convention)
```

If validation is incomplete, reports must include:

```text
Direct Analysis is preliminary until the P2-M5 direct-analysis verification gate passes.
```

## Agent API Requirements

Agent-visible trace must expose:

- selected P-Delta method.
- direct-analysis settings.
- per-combination convergence.
- final design summary.
- warnings and limitations.
- benchmark gate status.

Existing automation must be able to distinguish:

```js
analysis.pDelta.method === 'equivalent-load-iteration-design-combo-final'
analysis.pDelta.method === 'geometric-stiffness-direct'
```

## Implementation Work Breakdown

Detailed execution tasks are tracked in `P2_M5_DIRECT_ANALYSIS_WORKPACKAGES.md`.

| ID | Work | Files |
| --- | --- | --- |
| D1 | settings/schema defaults and migration | `src/core/schema.js`, `src/core/model.js`, validation tests |
| D2 | local/global geometric stiffness matrix | `src/solver/linear3d.js` or `src/solver/geometricStiffness.js` |
| D3 | direct-analysis solver driver | `src/solver/linear3d.js`, solver result contract tests |
| D4 | design-summary reuse from direct final results | `src/solver/linear3d.js`, `src/results/pDeltaTrace.js` |
| D5 | UI method control and direct result panels | `src/ui/indexNativeResultControls.js`, `src/ui/indexResultsPanel.js` |
| D6 | reports and calculation package output | `src/report/detailedReport.js`, `src/report/calculationPackage.js`, `src/report/htmlReport.js` |
| D7 | agent API trace | `src/ui/indexAgentApi.js`, `src/ui/indexAgentActionCatalog.js` |
| D8 | verification fixtures and benchmarks | `tests/`, `src/examples/verification.js`, `docs/verification/P2_M5_DIRECT_ANALYSIS_VERIFICATION.md` |
| D9 | user-facing status/manual updates | `docs/user-manual/STATUS_AND_LIMITS.md`, `docs/user-manual/02-modeling-and-elastic-analysis.md` |

## Acceptance Criteria

Direct analysis is complete only when all conditions below pass:

1. UI allows selecting equivalent-load or direct-analysis P-Delta.
2. Equivalent-load behavior remains backward compatible.
3. Direct mode assembles a nonzero `Kg` from recovered member axial force.
4. Compression reduces lateral tangent stiffness in benchmark cases.
5. Tension sign handling is covered by tests.
6. Direct mode reports convergence per combination.
7. Tangent singularity or nonconvergence is visible as a blocking status.
8. `analysis.pDelta.design` is populated from final direct-analysis results.
9. Reports and agent API state `Kt = Ke + Kg(N)` and the tension-positive axial convention.
10. Verification gate in `P2_M5_DIRECT_ANALYSIS_VERIFICATION.md` passes.

## Rollout Order

1. Add result/settings contracts without UI exposure.
2. Implement `Kg` matrix and unit tests.
3. Implement direct solver driver behind a hidden setting.
4. Add benchmark fixtures.
5. Expose UI method selection.
6. Update result panels and reports.
7. Enable agent API and final status labels.

This order prevents the UI from presenting direct analysis before the solver and verification gate are ready.
