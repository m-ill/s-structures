# PILOT-ST-03 - Steel braced frame unsupported-scope gate

- Package hash: `59994da4355da6d87a124a7f`
- Input hash: `edd2ea36f8a44df82d4acdea`
- Engine: `p8-production-mdof-pushover`
- Execution: `blocked` / `NONLINEAR_UNILATERAL_ACTIVE_SET_UNSUPPORTED`
- Reproducibility: `PASS`
- Qualification: `candidate`, design blocked: `true`
- Duration: `24.738 ms`

| Case | Status | Termination | Result hash |
| --- | --- | --- | --- |
| 1 | blocked | NONLINEAR_UNILATERAL_ACTIVE_SET_UNSUPPORTED | - |

## Workflow

1. gravity-preload
2. unilateral-brace-detection
3. fail-closed-preflight
4. blocked-report

## Qualification Boundary

This run proves deterministic production-solver input-to-report execution. Independent external comparison and owner sign-off are missing, so design transfer remains blocked.
