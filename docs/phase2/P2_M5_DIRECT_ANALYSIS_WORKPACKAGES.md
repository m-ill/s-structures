# P2-M5 Direct Analysis Work Packages

status: implementation checklist
parent: `P2_M5_DIRECT_ANALYSIS_IMPLEMENTATION_PLAN.md`
verification: `verification/specs/P2_M5_DIRECT_ANALYSIS_VERIFICATION.md`

## Goal

Implement P-Delta Direct Analysis as a complete workflow, not only as a solver experiment.

Direct Analysis is complete only when solver, result contract, UI, reports, agent API, and verification gate all agree on the same method:

```text
Geometric-stiffness direct analysis: Kt = Ke + Kg(N)
```

`N` follows the project-wide sign convention: axial tension is positive and compression is negative.

## Delivery Order

| WP | Name | Dependency | Done when |
| --- | --- | --- | --- |
| DA-01 | Settings and result contract | none | model defaults, migration, validation, and result shape exist |
| DA-02 | Geometric stiffness matrix | DA-01 | local/global `Kg` matrix tests pass |
| DA-03 | Direct solver driver | DA-02 | direct tangent solve converges on benchmark fixtures |
| DA-04 | Design summary and trace | DA-03 | story/member design rows come from final direct result |
| DA-05 | UI controls and graphs | DA-04 | method switch, direct graphs, and member panel are visible and labeled |
| DA-06 | Reports and calculation package | DA-04 | reports include method, settings, convergence, limitations |
| DA-07 | Agent API and automation | DA-04, DA-06 | agent trace can distinguish equivalent vs direct mode |
| DA-08 | Verification gate and status update | all | tests pass and status/manual labels are updated |

## DA-01 Settings And Result Contract

### Scope

- Add `analysisSettings.pDeltaMethod`.
- Add direct-analysis numeric settings through Phase 6 `analysisCriteria`, with legacy `analysisSettings.*` fallback.
- Preserve current equivalent-load behavior when settings are absent.
- Add `analysis.pDelta.direct` result block.

### Files

- `src/core/schema.js`
- `src/core/model.js`
- `src/core/validation.js`
- `src/solver/linear3d.js`
- `tests/`

### Acceptance

- old saved models run without migration breakage.
- default method remains equivalent-load.
- direct settings survive save/load.
- `analysis.pDelta.method` can be `geometric-stiffness-direct`.

## DA-02 Geometric Stiffness Matrix

### Scope

- Implement local 12-DOF `Kg` assembly.
- Transform local `Kg` to global axes.
- Reduce global matrix by active DOFs consistently with `Ke`.
- Handle compression/tension sign convention.

### Files

- `src/solver/linear3d.js`
- optional split: `src/solver/geometricStiffness.js`
- `tests/p2-m5-direct-geometric-stiffness.mjs`

### Acceptance

- zero axial force produces zero `Kg`.
- local and global `Kg` are symmetric.
- compression reduces lateral tangent stiffness.
- tension behavior follows `criteria.pdelta.includeTensionKg`.
- unsupported releases produce explicit unsupported status.

## DA-03 Direct Solver Driver

### Scope

- Solve first-order baseline.
- Recover axial force.
- Iterate tangent stiffness:

```text
Kt = stiffnessReductionFactor * Ke + Kg(N)
```

`Kg(N)` is signed by the tension-positive axial convention. For compression `N < 0`, tangent lateral stiffness is reduced.

- Detect nonconvergence and tangent singularity.
- Preserve iteration trace.

### Files

- `src/solver/linear3d.js`
- `src/examples/verification.js`
- `tests/p2-m5-direct-solver.mjs`

### Acceptance

- direct result differs from first-order result when compression exists.
- direct result differs from equivalent-load internals; it is not relabeled data.
- one-story closed-form benchmark passes.
- near-critical case is not marked `OK`.

## DA-04 Design Summary And Trace

### Scope

- Reuse `analysis.pDelta.design` for common UI/report consumption.
- Populate story rows from final direct displacements.
- Populate member force rows from first-order vs final direct forces.
- Add convergence and limitation notes.

### Files

- `src/solver/linear3d.js`
- `src/results/pDeltaTrace.js`
- `src/platform/pDeltaPracticeValidation.js`
- `tests/p2-m5-direct-results.mjs`

### Acceptance

- `design.method === 'geometric-stiffness-direct'`.
- story rows include theta/B-delta/P-Delta shear/P-Delta moment.
- member rows include first-order and direct-analysis final forces.
- failed combinations propagate status into design rows.

## DA-05 UI Controls And Graphs

### Scope

- Add method control:

```text
P-Delta: Off | Equivalent Load | Direct Analysis
```

- Add compact direct settings.
- Separate convergence iteration trace from final response graphs.
- Show direct member force comparison when a member is selected.

### Files

- `src/ui/indexNativeResultControls.js`
- `src/ui/indexResultsPanel.js`
- native canvas/result modules touched by current P-Delta panel
- `tests/p2-m5-direct-ui-report.mjs`

### Acceptance

- direct mode is labeled `P-Delta: Direct Analysis (Kt = Ke + Kg(N))`.
- equivalent-load diagnostic member panel is not presented as direct-analysis design output.
- selected member panel can filter combinations.
- graph title states whether it is final response or iteration diagnostics.

## DA-06 Reports And Calculation Package

### Scope

- Add direct-analysis method and settings to all report paths.
- Include convergence table.
- Include story/member design summary.
- Include preliminary/verification note until gate passes.

### Files

- `src/report/detailedReport.js`
- `src/report/calculationPackage.js`
- `src/report/htmlReport.js`
- report tests already covering P-Delta sections

### Acceptance

- report contains `Method: Geometric-stiffness direct analysis (Kt = Ke + Kg(N), tension-positive axial convention)`.
- nonconvergence and tangent singularity appear as warnings/blocking rows.
- equivalent-load reports keep their own method label.

## DA-07 Agent API And Automation

### Scope

- Expose method, settings, direct trace, and design summary.
- Add action/contract documentation if a new UI action is introduced.
- Ensure AI automation can reject preliminary or failed direct-analysis output.

### Files

- `src/ui/indexAgentApi.js`
- `src/ui/indexAgentActionCatalog.js`
- `docs/user-manual/AI_AGENT_GUIDE.md`
- `docs/user-manual/agent-contract.json`

### Acceptance

- agent trace includes `analysis.pDelta.method`.
- agent trace includes per-combination direct convergence.
- automation can distinguish `OK`, `REVIEW`, `NOT_CONVERGED`, and `TANGENT_SINGULAR`.

## DA-08 Verification Gate And Status Update

### Scope

- Add verification tests listed in `P2_M5_DIRECT_ANALYSIS_VERIFICATION.md`.
- Update status/manual only after test coverage exists.
- Keep direct mode preliminary until gate passes.

### Files

- `tests/p2-m5-direct-*.mjs`
- `verification/specs/P2_M5_DIRECT_ANALYSIS_VERIFICATION.md`
- `docs/user-manual/STATUS_AND_LIMITS.md`
- `docs/user-manual/02-modeling-and-elastic-analysis.md`

### Acceptance

- direct-analysis tests pass.
- existing equivalent-load P-Delta tests pass.
- `git diff --check` passes.
- user manual does not claim final practical status before verification.

## Implementation Guardrails

1. Do not remove equivalent-load P-Delta.
2. Do not label iteration diagnostics as a design curve.
3. Do not return `OK` for singular, unsupported, or nonconverged direct-analysis cases.
4. Do not hide direct-analysis settings in reports.
5. Do not reuse equivalent-load second-order forces as direct-analysis final forces.
6. Do not expose direct-analysis as final-use evidence until the verification gate passes.
