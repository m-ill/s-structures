# P8-M5 Code Review

- Review date: 2026-07-13
- Scope: gravity preload, case dependency, augmented displacement control, Pushover recovery, routing and contracts
- Outcome: PASS with later-milestone limitations

## Resolved Findings

| Severity | Finding | Resolution |
| --- | --- | --- |
| P0 | Lateral load vector was used without a derivative contract | Assembler now exposes `dResidualDlambdaReduced`; M5 permits nodal translations only and fails closed otherwise |
| P0 | One-sided augmented scaling could reject valid weakly scaled systems | Added row and column equilibration, physical solution recovery, and unscaled residual verification |
| P0 | Gauge modes could be controlled through artificial stabilization | Control and reference projections onto approved gauge modes are blocked |
| P0 | Gravity record/checkpoint/state were not mutually bound | Replaced private record with standard analysis run record and linked all integrity hashes |
| P0 | Base shear used applied load rather than gravity-relative reactions | Canonical curve now uses support-reaction increments and retains applied shear as an audit field |
| P1 | Large-array spread and invalid Phase 7 load audit were accepted | Replaced spread minimum and block load-audit errors before domain execution |
| P1 | Equilibrium moment audit used reference coordinates | Nonlinear six-resultant audit now uses the current configuration |
| P1 | Missing target, short direction vectors, and minimum event step were ambiguous | Added explicit validation and bounded event-cutback behavior |

## Reviewed Boundaries

- Legacy `runPushover` remains explicitly preliminary and is not a fallback for the production engine.
- M5 capacity points include accepted states only; rejected attempts stay in solver diagnostics.
- Gravity, pattern, control, hinge assignment, backend, and solver hashes are present in result provenance.
- Control coordinates are data-serializable; the local evaluator is non-enumerable and excluded from structured result contracts.

## Deferred By Design

- Coupled PMM/fiber behavior is P8-M6.
- Arc-length continuation and cyclic static behavior are P8-M7.
- External solver comparison, large-model budgets, and pilot qualification are P8-M11.
- These limits keep the M5 engine at `candidate` and block design transfer.
