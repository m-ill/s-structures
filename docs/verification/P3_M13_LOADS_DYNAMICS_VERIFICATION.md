# P3-M13 Loads And Dynamics Verification

date: 2026-07-02
status: preliminary core locked

## Scope

This note verifies P3-M13 against `docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md` tickets P3-T76 to P3-T82.

## Verified Items

| Ticket | Plan item | Evidence |
| --- | --- | --- |
| P3-T76 | Wind load v2 trace | `buildLoadsV2Trace()` wind rows |
| P3-T77 | Seismic v2, RSA scaling, torsion Ax | seismic distribution, `scaleRsaBaseShear()`, `computeTorsionAmplificationAx()` |
| P3-T78 | Snow, soil, water, uplift loads | `generateEnvironmentalLoadsV2()` |
| P3-T79 | CQC modal combination | `combineModalCqc()`, `buildCqcCombinationReport()`, RSA CQC test |
| P3-T80 | Buckling trace | `estimateGlobalBucklingTrace()`, `estimateModelBucklingTrace()` global eigenvalue trace plus member Euler screening |
| P3-T81 | Linear time history | `runLinearSdofTha()`, `runModalSuperpositionTha()` |
| P3-T82 | Mass source from loads | `buildMassSourceTrace()`, nodal/member point/member UDL load conversion, `analyzeDynamics()` mass source consumption, and story-mass single-source test |

## Added Review Finding

The previous M13 implementation covered loads, CQC, buckling, and THA helpers, but did not expose the load-to-mass-source contract required by P3-T82. P3-M13 now includes `MASS_SOURCE_TRACE_VERSION`, and the trace is consumed by modal/RSA mass assembly and story-mass summaries when `analysisSettings.massSource` is present. It records:

1. source combinations such as `D + 0.25L`
2. existing node mass inclusion
3. vertical nodal/member point and member uniform-load conversion to mass
4. ignored non-vertical loads
5. explicit limitations

2026-07-02 review update: Wind and seismic v2 rows now preserve the input terms needed to reproduce report formulas. Wind rows include pressure, importance factor, exposure factor, height, tributary width, qz, force, and formula. Seismic distribution rows include base shear, story weight, height, wi-hi, and sum(wi-hi). This keeps P3-T76/T77 trace rows usable by reports and AI agents without re-reading the original basis object.

2026-07-02 contract review update: `buildLoadsV2Trace()` now exposes a top-level `contract` and `summary`. The contract identifies the P3-M13 load tickets covered by the trace, the intended report/API use, and the current limitations. The summary exposes story count, total wind/seismic force, environmental case list, and mass-source totals. `buildMassSourceTrace()` also exposes its own contract so downstream dynamics, reports, and automation can distinguish accepted vertical load sources from ignored loads.

## Current Test Gate

`tests/p3-m13-loads-dynamics.mjs` verifies wind/seismic/environmental loads, RSA scaling, torsion Ax, CQC, linear THA, modal THA, global buckling trace, member Euler screening, mass source trace, member UDL-to-mass conversion, dynamic mass assembly, and story-mass single-source behavior.

## Remaining Limits

P3-M13 remains preliminary. Buckling now includes a small-displacement global frame eigenvalue trace based on member axial reference compression and geometric stiffness, but shell buckling, follower loads, construction sequence, and material nonlinearity remain outside this elastic contract. Loads v2 is a traceable preliminary KDS-style implementation, not a full project-specific code automation engine.
