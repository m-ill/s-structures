# M33 Representative Building Elastic Analysis Set

## Purpose

M33 creates a repeatable 10-building elastic analysis set for S-Structures. The goal is to verify that the program can generate common Korean building-design office model shapes, run the full elastic analysis path, and write reviewable model/report files without manual modeling.

This set also becomes a future comparison target for drawing-image, MGT, and agentic vision AI import workflows.

## Output

Generated files are saved under:

`reports/representative-buildings`

Each building folder contains:

- `model.json`: generated schema version 3 structural model
- `analysis-summary.json`: compact analysis summary
- `report.html`: HTML calculation report
- `review.md`: Korean review memo for manual checking

The set can be regenerated with:

`npm.cmd run generate:representative-buildings`

## Representative Shapes

| ID | Shape | Intent |
| --- | --- | --- |
| `01-regular-office-frame` | Regular office frame | Baseline regular moment frame |
| `02-l-shaped-neighborhood` | L-shaped neighborhood facility | Plan irregular low-rise frame |
| `03-u-shaped-school` | U-shaped school wing | Education building around an open court |
| `04-podium-tower-setback` | Podium tower setback | Mixed-use podium with upper setback |
| `05-long-span-warehouse` | Long-span warehouse | Single-story industrial long-span frame |
| `06-open-parking-frame` | Open parking frame | Repetitive open parking structure |
| `07-apartment-frame-equivalent` | Apartment frame equivalent | Elongated residential equivalent frame |
| `08-courtyard-hospital` | Courtyard hospital frame | Public building with central opening |
| `09-transfer-podium-frame` | Transfer podium frame | Narrow upper block over wider podium |
| `10-torsion-irregular-frame` | Torsion irregular corner frame | Missing-corner torsional irregularity |

## Modeling Contract

Each generated model uses:

- 3D frame elastic analysis
- fixed base supports
- `D`, `L`, `WX`, `WY` load cases
- `EL-DL`, `EL-WX`, `EL-WY` load combinations
- member UDL gravity loads on beams
- story-distributed nodal lateral loads
- equivalent box section sized to keep the representative set within preliminary elastic limits

The generated models are intentionally simplified. Wall, slab, mat, transfer plate, diaphragm, and foundation-soil behavior are not modeled as detailed finite elements in this milestone.

## Acceptance Checks

`tests/m33-representative-buildings.mjs` verifies:

- exactly 10 representative models are generated
- every model runs through `analyzeModel()`
- all combinations pass equilibrium residual checks below `1e-8`
- envelope displacement and utilization are finite
- preliminary design status is `OK`
- HTML report generation succeeds
- the agent manifest advertises the representative report set

## Import Readiness

Future importers should generate the same final schema version 3 model shape:

1. Drawing image, MGT file, or structured JSON is converted into nodes, members, supports, sections, loads, and combinations.
2. The generated model enters the app through `SStructuresAgent.execute("setModel", { model })`.
3. The elastic analysis path produces the same report and summary formats used by this M33 set.
4. Differences between imported models and these representative references can be checked through `model.json`, `analysis-summary.json`, and `report.html`.
