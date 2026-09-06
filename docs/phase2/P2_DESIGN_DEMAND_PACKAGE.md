# P2 Design Demand Package

status: preliminary

## Scope

The design demand package is a shared contract between analysis
postprocessing and design modules. It records the member force and support
reaction demand source used by preliminary steel, RC, connection, and
foundation reports.

## Contracts

| Contract | Output |
| --- | --- |
| Member demand | trace ID, governing N/V/M peak, station count |
| Foundation demand | support reaction envelope, uplift flag |
| Design result link | `demandTrace` on member design checks |
| Agent API | `getDesignDemandPackage()` |

## Limits

1. The package records demands. It does not replace detailed design checks.
2. Governing demand is selected by absolute recovered force magnitude.
3. Final connection and foundation design still require project criteria.

## Verification

Run `npm run test:p2demand`.
