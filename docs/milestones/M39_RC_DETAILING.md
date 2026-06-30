# M39 RC Detailing Schedule

## Scope

M39 adds a reinforcement schedule layer on top of the existing preliminary RC checks.

- Reads `analysis.design.concrete.memberResults`.
- Selects preliminary longitudinal bars for strong/weak axes and total column steel.
- Selects preliminary stirrup bar/spacing.
- Adds `getRcDetailingReport()` for agent/browser API use.
- Adds an RC reinforcement schedule section to the detailed HTML report.

## Current Limits

- This is a preliminary schedule, not a final reinforcement drawing.
- Bar spacing, development length, lap splice, anchorage, confinement, joint shear, and constructability checks remain future work.
- Final reinforcement must be reviewed by a qualified structural engineer.
