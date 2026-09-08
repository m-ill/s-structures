# M46 Stabilization Harness

This folder contains repeatable verification output for the current S-Structures modeling, elastic analysis, result visualization, and report pipeline.

## Coverage

- Structured JSON import-ready model
- Agent-action generated model
- Design-basis generated load model
- Braced frame model
- Solver benchmark model
- Ten representative building models

## Summary

- Version: m46-stabilization-harness
- Generated: 2026-06-29T00:00:00.000Z
- Cases: 15
- Failed: 0
- Max node count: 126
- Max member count: 270
- Max load count: 540

| ID | Category | Input path | Nodes | Members | Loads | Combos | Max displacement | Max utilization | Design | Harness |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| structured-two-story-elastic-frame | structured-json | structured-json | 27 | 42 | 84 | 3 | 0.013751 | 1.008806 | Review | OK |
| agent-grid-frame | agent-api | agent-modeling-actions | 18 | 26 | 38 | 3 | 0.057336 | 4.212236 | Review | OK |
| design-basis-two-story | design-basis | generated-design-basis-loads | 27 | 42 | 120 | 28 | 0.014763 | 1.079667 | Review | OK |
| braced-two-story-frame | braced-frame | programmatic-model-generator | 27 | 50 | 84 | 3 | 0.013726 | 1.046379 | Review | OK |
| solver-cantilever-tip-load | solver-benchmark | benchmark-model-generator | 2 | 1 | 1 | 1 | 0.0128 | 0.8 | OK | OK |
| representative-01-regular-office-frame | representative-building | representative-building-generator | 45 | 84 | 168 | 3 | 0.002408 | 0.164956 | OK | OK |
| representative-02-l-shaped-neighborhood | representative-building | representative-building-generator | 48 | 84 | 168 | 3 | 7.258e-4 | 0.111315 | OK | OK |
| representative-03-u-shaped-school | representative-building | representative-building-generator | 40 | 57 | 114 | 3 | 0.007404 | 0.500273 | OK | OK |
| representative-04-podium-tower-setback | representative-building | representative-building-generator | 84 | 154 | 308 | 3 | 0.002069 | 0.147336 | OK | OK |
| representative-05-long-span-warehouse | representative-building | representative-building-generator | 30 | 37 | 74 | 3 | 0.002312 | 0.254434 | OK | OK |
| representative-06-open-parking-frame | representative-building | representative-building-generator | 72 | 145 | 290 | 3 | 0.001752 | 0.149063 | OK | OK |
| representative-07-apartment-frame-equivalent | representative-building | representative-building-generator | 126 | 270 | 540 | 3 | 8.802e-4 | 0.092232 | OK | OK |
| representative-08-courtyard-hospital | representative-building | representative-building-generator | 120 | 240 | 480 | 3 | 8.237e-4 | 0.120856 | OK | OK |
| representative-09-transfer-podium-frame | representative-building | representative-building-generator | 81 | 158 | 316 | 3 | 0.002442 | 0.168875 | OK | OK |
| representative-10-torsion-irregular-frame | representative-building | representative-building-generator | 88 | 179 | 358 | 3 | 0.001118 | 0.108135 | OK | OK |

Each case folder contains `model.json`, `analysis-summary.json`, `case-summary.json`, `report.html`, `calculation-package.json`, `calculation-package.html`, and `review.md`.
