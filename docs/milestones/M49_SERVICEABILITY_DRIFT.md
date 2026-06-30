# M49 Serviceability Drift Review

## Scope

M49 adds a preliminary story-drift and serviceability review for elastic analysis results.

- Computes story drift from paired vertical nodes at each story.
- Reports combo, story, height, drift X/Y, resultant drift, drift ratio, demand/limit, and status.
- Uses a default drift limit of `H/200` with a warning threshold at 80% of the limit.
- Adds the review to detailed report HTML and calculation package HTML.
- Exposes `getServiceabilityDriftReport()` for agent/API workflows.

## API

Read:

- `buildServiceabilityDriftReport(model, analysis, options)`
- `window.SStructuresAgent.getServiceabilityDriftReport(options)`

Options:

- `driftLimitRatio`: default `1 / 200`
- `warnRatio`: default `0.8`

## Current Limits

- This is an elastic-analysis serviceability table, not a full code procedure.
- Wind/seismic serviceability combinations and project-specific allowable drift categories remain later milestones.
- It uses matched vertical node pairs, so irregular models may need additional diaphragm/story mapping controls.
