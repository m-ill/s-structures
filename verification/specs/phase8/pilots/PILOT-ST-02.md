# PILOT-ST-02 - 3D steel moment frame

- Package hash: `39f8e88e8ebaca44094fcd16`
- Input hash: `fd6bb21b3273cf8182218670`
- Engine: `p8-production-mdof-pushover`
- Execution: `completed` / `TARGET_REACHED`
- Reproducibility: `PASS`
- Qualification: `candidate`, design blocked: `true`
- Duration: `50619.816 ms`

| Case | Status | Termination | Result hash |
| --- | --- | --- | --- |
| 1 | ok | TARGET_REACHED | 1392b2466a04a1fc09e0601c |
| 2 | ok | TARGET_REACHED | 036ce50cff8371ea6460baaf |

## Workflow

1. gravity-preload
2. rigid-diaphragm
3. bidirectional-pushover
4. story-member-origin-recovery
5. calculation-report

## Qualification Boundary

This run proves deterministic production-solver input-to-report execution. Independent external comparison and owner sign-off are missing, so design transfer remains blocked.
