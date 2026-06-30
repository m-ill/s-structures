# P2-MVP-S4 Rigid Diaphragm Contract

status: implemented for T11

## Scope

This slice adds explicit rigid diaphragm definitions and a linear static solver constraint path for story-level in-plane floor action.

## Implemented Contract

| Item | Result |
| --- | --- |
| Diaphragm collection | `model.diaphragms` stores explicit diaphragm definitions |
| Supported type | `rigid` |
| Node selection | Explicit `nodeIds`, `storyId`, or `z` elevation |
| Solver behavior | Diaphragm nodes share reduced in-plane `ux`, `uy`, and `rz` rigid-body DOFs |
| Component grouping | Diaphragm-linked nodes are solved in the same structural component |
| Agent/API | `getDiaphragmSummary()` and `getRigidDiaphragmBenchmark()` are exposed |
| Regression | `test:p2s4-diaphragm` verifies validation, summary, API, and solver constraint behavior |

## Data Shape

```js
{
  diaphragms: [
    { id: 'DIA1', type: 'rigid', z: 3.0 }
  ]
}
```

## Benchmark

`runRigidDiaphragmBenchmark()` ties two independent column tops at one story level and checks that their in-plane displacement difference is zero within tolerance.

## Current Limits

Semi-rigid diaphragm, shell/slab mesh behavior, and dynamic diaphragm coupling are not implemented in this slice. Story mass-center eccentricity is tracked in `P2_MVP_S5_STORY_MASS_CENTER.md`.
