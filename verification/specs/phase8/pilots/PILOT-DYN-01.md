# PILOT-DYN-01 - Gravity-preloaded 3D frame MDOF NLTH

- Package hash: `a4ba0175ec6e051bcf0822b2`
- Input hash: `65a3bf95023350c023755f14`
- Engine: `p8-production-mdof-nlth`
- Execution: `completed` / `DYNAMIC_TIME_RANGE_COMPLETED`
- Reproducibility: `PASS`
- Qualification: `candidate`, design blocked: `true`
- Duration: `4235.611 ms`

| Case | Status | Termination | Result hash |
| --- | --- | --- | --- |
| 1 | completed | DYNAMIC_TIME_RANGE_COMPLETED | 464e6fda8afbf7cb49d504cf |

## Workflow

1. gravity-preload
2. mass-and-damping
3. ground-motion-input
4. mdof-newmark
5. history-energy-peak-report

## Qualification Boundary

This run proves deterministic production-solver input-to-report execution. Independent external comparison and owner sign-off are missing, so design transfer remains blocked.
