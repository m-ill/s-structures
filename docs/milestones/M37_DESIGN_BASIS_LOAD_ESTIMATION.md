# M37 Design-Basis Load Estimation

## Scope

M37 introduces a preliminary load estimation engine for the browser model.

- Reads model geometry: bounds, story levels, horizontal framing length.
- Builds a design basis from occupancy and load intensity inputs.
- Generates derived load cases: `D`, `L`, `WX`, `WY`, `EX`, `EY`.
- Converts area gravity loads to equivalent member UDLs.
- Converts wind and seismic story forces to equivalent nodal loads.
- Stores trace data in `model.designBasis` and `model.loadEstimation`.
- Adds detailed report output for the load derivation summary.

## API

Read:

- `estimateModelLoads(model, designBasis, options)`
- `window.SStructuresAgent.getDesignBasisLoadEstimation()`

Execute:

- `applyDesignBasisLoads(model, designBasis, options)`
- `window.SStructuresAgent.execute('applyDesignBasisLoads', { designBasis })`

## Current Limits

- This is a project scaffold for traceable loading, not a complete KDS load calculation engine.
- Wind/seismic coefficients are user or preset inputs.
- Area loads are distributed to horizontal members by length share.
- Lateral loads are equivalent story nodal loads.
- Load reduction, exposure, importance, site class, accidental torsion, and detailed seismic/wind procedures remain future milestones.
