# M32 Elastic 3D Import Workflow

## Purpose

M32 records a complete two-story 3D elastic analysis workflow that can be reused by future drawing-image, MGT, and structured-model import paths.

The intended long-term path is:

1. Source input: drawing image, MGT file, or structured JSON.
2. Extraction layer: parser or agentic vision AI identifies grid lines, story levels, member centerlines, supports, sections, and load tags.
3. Canonical model: extracted data is normalized into schema version 3 model data.
4. App entry: `SStructuresAgent.execute("setModel", { model })`.
5. Analysis: `SStructuresAgent.runAnalysis()`.
6. Review: result visuals, reactions, member forces, utilization, and report output.

This keeps the elastic engine independent from the file and vision layers.

## Reference Model

- Structure: two-story 3D steel frame
- Grid: 2 bays in X, 2 bays in Y
- Stories: 2
- Nodes: 27
- Members: 42
- Supports: fixed at base nodes
- Loads: 84
- Load cases: `D`, `L`, `WX`, `WY`
- Load combinations:
  - `EL-DL`: `1.0D + 1.0L`
  - `EL-WX`: `1.0D + 0.5L + 1.0WX`
  - `EL-WY`: `1.0D + 0.5L + 1.0WY`

The reference fixture is implemented by `createTwoStoryElasticFrameModel()`.

## Import Contract

Future drawing or MGT importers should produce the same final model shape as the reference fixture:

- `nodes[]`: id, x, y, z, support
- `members[]`: id, n1, n2, material id, section id, local axis, releases, design role
- `loads[]`: member UDL and nodal lateral loads with case ids
- `loadCases[]`: typed load case metadata
- `loadCombinations[]`: factor maps by case id
- `analysisSettings`: linear static 3D frame settings

The AI vision layer should not call the solver directly. It should build or edit model data, then use the existing agent API.

## Validation

`tests/m32-elastic-3d-import-workflow.mjs` verifies:

- direct elastic 3D analysis succeeds
- equilibrium residual is below `1e-8` for all combinations
- total loads and reactions balance for gravity and lateral combinations
- envelope displacement and utilization are finite
- the same model can enter through `SStructuresAgent.execute("setModel", { model })`
- `runAnalysis`, `getResultVisuals`, and `getReport` work after import

This test is the current acceptance gate for future drawing-image and MGT import work.

## Current Reference Result

Verified on 2026-06-26:

- Analysis status: OK
- Max envelope displacement: `0.013751356736879635`
- Max envelope utilization: `0.6810765954782244`
- Browser API flow: `setModel -> runAnalysis -> getResultVisuals -> getReport`
- Browser result visuals: 27 nodes, 42 members, 84 loads, 9 reactions
- Browser report output: 11,924 HTML characters
