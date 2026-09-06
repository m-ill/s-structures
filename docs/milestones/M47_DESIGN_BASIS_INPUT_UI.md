# M47 Design-Basis Load Input UI

## Scope

M47 adds a shared design-basis load input contract for the native ribbon UI and the agent/API surface.

- Adds a structured input state for occupancy, floor/roof area, gravity load intensities, wind pressure, seismic coefficients, and seismic live-load participation.
- Exposes `getDesignBasisInput()` for AI agents, browser automation, and report workflows.
- Exposes `setDesignBasisInput` so agents can preview/store load basis values without creating model loads.
- Keeps `applyDesignBasisLoads` as the explicit action that generates load cases and loads.
- Adds a compact elastic-analysis ribbon group with occupancy, A/Ar, D/L/Lr, WX/WY, EX/EY, psiE, Preview, Apply, and status controls.
- Adds command-bridge response summaries for design-basis input state.

## API

Read:

- `getDesignBasisInput(options)`
- `getDesignBasisLoadEstimation(options)`

Execute:

- `setDesignBasisInput({ designBasis })`
- `applyDesignBasisLoads({ designBasis })`

## UI Contract

Stable controls:

- `native-load-basis-occupancy`
- `native-load-basis-floorArea`
- `native-load-basis-roofArea`
- `native-load-basis-deadLoad`
- `native-load-basis-liveLoad`
- `native-load-basis-roofLiveLoad`
- `native-load-basis-windPressureX`
- `native-load-basis-windPressureY`
- `native-load-basis-seismicCoefficientX`
- `native-load-basis-seismicCoefficientY`
- `native-load-basis-seismicLiveLoadFactor`
- `native-preview-design-basis-loads`
- `native-apply-design-basis-loads`
- `native-load-basis-status`

## Current Limits

- The current inputs are still preliminary KDS-style coefficients, not a complete wind or seismic procedure.
- Detailed exposure, importance, site class, live-load reduction, snow, earth pressure, crane, thermal, and construction loads remain later milestones.
- Preview stores `model.designBasis`; Apply is required to create generated load entities.
