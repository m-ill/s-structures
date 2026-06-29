# M48 Load Derivation Trace

## Scope

M48 adds formula-level trace rows for generated design-basis loads.

- Adds `LOAD_DERIVATION_TRACE_VERSION`.
- Adds a trace table to `estimateModelLoads()` and `applyDesignBasisLoads()`.
- Tracks basis, gravity, wind, seismic, and load-distribution formulas.
- Carries each trace row with ID, group, story, case, formula, inputs, result, unit, and source.
- Links generated member and nodal loads back to distribution trace row IDs.
- Adds the trace table to detailed report HTML and calculation package HTML.
- Registers the trace as an agent manifest data contract.

## Trace Groups

- `basis`: occupancy preset, typical floor area, roof area.
- `gravity`: story dead/live load from area and intensity.
- `wind`: story equivalent wind force from pressure, width/depth, and story height.
- `seismic`: effective weight, base shear, and vertical story force distribution.
- `distribution`: story total to member UDL or nodal load share.

## Current Limits

- This is still a preliminary trace for generated equivalent loads.
- Distribution rows show the current equivalent-frame load path, not a slab/wall finite element load takedown.
- Full KDS wind/seismic procedural clauses, exposure, importance, site class, torsion, snow, rain, soil, crane, and construction loads remain later milestones.
- Trace rows are calculation-aid evidence, not sealed engineering certification.
