# P2-MVP-S4 Member Release Contract

status: implemented for T09

## Scope

This slice hardens member end release handling for the current 3D frame solver. The supported release set is intentionally small: `rigid` and `pin`.

## Implemented Contract

| Item | Result |
| --- | --- |
| Release types | `rigid`, `pin` |
| Release ends | `i`, `j` |
| Pin meaning | Local end rotations `ry` and `rz` are released |
| Solver path | Solver release DOF mapping uses the shared core release contract |
| Validation | Unsupported release end keys and release values are validation errors |
| Agent/API | `getMemberReleaseSummary()` and `getMemberReleaseBenchmark()` are exposed |
| Regression | `test:p2s4-release` verifies validation, migration, API, and release moment recovery |

## Data Shape

```js
{
  releases: { i: 'rigid', j: 'pin' }
}
```

## Benchmark

`runMemberReleaseBenchmark()` checks i-end, j-end, and both-end pin release cases on a fixed-fixed UDL beam and requires released-end moments to recover as zero within tolerance.

## Current Limits

Semi-rigid springs, axial/shear releases, and rigid offsets are not implemented in this slice.

## Next S4 Work

1. T11 rigid diaphragm definition and solver constraint path: see `P2_MVP_S4_RIGID_DIAPHRAGM.md`.
2. Story result table linking diaphragm-ready story levels, drift, and lateral load traces.
