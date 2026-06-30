# M46 Stabilization Harness

## Purpose

M46 adds a repeatable stabilization harness for the current product path. The goal is to prove that different model entry paths reach the same core pipeline:

1. Model validation
2. 3D elastic analysis
3. Combination result summary
4. Result visualization data
5. HTML report
6. Calculation package
7. Saved review artifacts

This milestone is not a new design feature. It is a regression gate before adding drawing, MGT, nonlinear, and agent-driven workflows.

## Covered Entry Paths

| Entry path | Case count | Purpose |
| --- | ---: | --- |
| Structured JSON model | 1 | Future drawing/MGT/vision conversion target |
| Agent modeling actions | 1 | AI/computer-use generated model path |
| Generated design-basis loads | 1 | Load derivation and rule-based combination path |
| Braced frame generator | 1 | Lateral-system variant coverage |
| Solver benchmark | 1 | Small deterministic cantilever check |
| Representative building generator | 10 | Product-scale regular and irregular building coverage |

Total baseline cases: 15.

## Acceptance Rules

Each case must satisfy these checks:

- Model validation has no errors.
- Elastic analysis returns `ok: true`.
- Required load combinations exist.
- Required model loads exist.
- Every combination solves.
- Equilibrium residual is below `1e-8`.
- Result visuals include all nodes and members.
- Result visuals include nonzero displacement data.
- Basic HTML report is generated from the same result.
- Calculation package includes the standard sections.
- Member design trace rows are present.
- Generated design-basis case includes load derivation trace rows.
- Agent-action case records the modeling action path.

## Outputs

Run:

```powershell
npm.cmd run generate:stabilization-harness
```

Generated folder:

```text
reports/stabilization-harness/
```

Each case folder contains:

- `model.json`
- `analysis-summary.json`
- `case-summary.json`
- `report.html`
- `calculation-package.json`
- `calculation-package.html`
- `review.md`

The root folder contains:

- `index.json`
- `README.md`

## Test

Run:

```powershell
npm.cmd run test:m46
```

The full milestone suite also runs M46 through:

```powershell
npm.cmd test
```

## Review Notes

- The harness intentionally keeps generated artifacts deterministic with a fixed `generatedAt` value in the generation tool and test.
- Representative building PDFs remain covered by the later current-trace PDF test.
- This is a stability gate, not a certified engineering sign-off.
- Future drawing-image, MGT, and agentic vision importers should feed schema-versioned model JSON into this same harness before being considered stable.
