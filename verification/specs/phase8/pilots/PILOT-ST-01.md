# PILOT-ST-01 - 2D steel portal frame

- Package hash: `936a564282a477982d52aeed`
- Input hash: `f4ed2e45227a46b5db4065bb`
- Engine: `p8-production-mdof-pushover`
- Execution: `completed` / `ARC_LENGTH_STEPS_COMPLETED`
- Reproducibility: `PASS`
- Qualification: `candidate`, design blocked: `true`
- Duration: `21621.068 ms`

| Case | Status | Termination | Result hash |
| --- | --- | --- | --- |
| 1 | ok | ARC_LENGTH_STEPS_COMPLETED | 0f4fc8d15699712aab41cfd7 |

## Workflow

1. gravity-preload
2. hinge-calibration
3. displacement-pushover
4. arc-length-continuation
5. capacity-and-hinge-report

## Qualification Boundary

This run proves deterministic production-solver input-to-report execution. Independent external comparison and owner sign-off are missing, so design transfer remains blocked.
