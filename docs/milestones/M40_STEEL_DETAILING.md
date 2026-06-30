# M40 Steel Member Review Schedule

## Scope

M40 adds a steel member review schedule on top of the existing preliminary steel checks.

- Reads `analysis.design.steel.memberResults`.
- Summarizes axial, flexure, shear, interaction, slenderness, and deflection checks.
- Adds review actions for governing failures or warning states.
- Adds `getSteelDetailingReport()` for agent/browser API use.
- Adds a steel member review section to the detailed HTML report.

## Current Limits

- Compactness, lateral torsional buckling, connection design, welds, bolts, base plates, and fabrication details remain future work.
- The schedule is a traceable preliminary design aid, not a final steel calculation package.
