# PILOT-RC-01 - RC moment frame with fiber-generated PMM hinges

- Package hash: `8ad1d8d16bdc5092022254cb`
- Input hash: `3b5beaff8d51e68a7eb83287`
- Engine: `p8-production-mdof-pushover`
- Execution: `completed` / `TARGET_REACHED`
- Reproducibility: `PASS`
- Qualification: `candidate`, design blocked: `true`
- Duration: `12728.152 ms`

| Case | Status | Termination | Result hash |
| --- | --- | --- | --- |
| 1 | ok | TARGET_REACHED | effed6ec11a2eec7d38071b1 |

## Workflow

1. gravity-preload
2. reinforcement-snapshot
3. fiber-pmm-preprocess
4. displacement-pushover
5. story-drift-report

## Qualification Boundary

This run proves deterministic production-solver input-to-report execution. Independent external comparison and owner sign-off are missing, so design transfer remains blocked.
