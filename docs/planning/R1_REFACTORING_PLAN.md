# R1 Refactoring Plan

## Purpose

The project has reached the point where feature milestones are producing large bridge, UI, report, and solver modules. R1 starts a dedicated refactoring track before adding more analysis or import features.

## Module Size Policy

- Target ordinary feature modules at 500-600 lines or less.
- Treat 600 lines as a review threshold.
- Treat 700 lines as a split threshold unless the file is a tightly coupled numerical kernel under active verification.
- Keep public APIs stable while splitting modules.
- Do not combine behavior changes with structural moves unless a failing test proves the behavior needs correction.

## Current Hotspots

| Area | Current issue | Refactoring direction |
| --- | --- | --- |
| `src/ui/indexBridge.js` | Engine bridge, agent API, result normalization, report hooks, and native UI dispatch are in one large file. | Split into bridge install, agent API, result compatibility, native command dispatch, and report hooks. |
| `src/ui/indexNativeRibbon.js` | Ribbon configuration, DOM rendering, load-basis controls, and pushover controls are mixed. | Split into ribbon config, renderer, load-basis ribbon, pushover ribbon, and mode state. |
| `src/solver/linear3d.js` | Assembly, load conversion, solve, recovery, envelope, and P-Delta logic are in one numerical file. | Split only after report/UI refactors are stable: assembly, loads, recovery, envelope, and P-Delta. |
| `src/report/*` | HTML primitives and numeric formatters are repeated. | Extract report formatting and HTML primitives. |
| `package.json` | The full test command is a long chained script. | Add a milestone test runner and keep package scripts small. |
| `src/design/loadEstimation.js` | Input schema, generated loads, application, and formula trace are mixed. | Split into design basis input, load generation, and derivation trace. |

## R1 Scope

R1 is deliberately low risk:

1. Add a milestone test runner so future refactors can run the complete suite without editing a long shell chain.
2. Extract shared report formatting helpers.
3. Bring `detailedReport.js` below the module-size review threshold where practical.
4. Keep report output semantically equivalent.
5. Run the full M0-M50 suite and forbidden legacy acronym scan.

## Later Refactor Milestones

### R2 - Agent Bridge Split

- Move agent read APIs and execute dispatch out of `indexBridge.js`.
- Move native UI command adapters into a dedicated dispatch module.
- Keep `window.SStructuresAgent` behavior unchanged.

### R3 - Native Ribbon Split

- Move ribbon labels/configuration to a data-only module.
- Move load-basis and pushover ribbon controls to focused modules.
- Keep top mode tabs and original UI integration unchanged.

### R4 - Solver Internal Split

- Extract load vector and fixed-end-force handling.
- Extract stiffness assembly and boundary condition helpers.
- Extract member result recovery.
- Extract envelope/P-Delta helpers after solver regression tests are stable.

### R5 - Design Basis Split

- Separate design-basis input state from generated load application.
- Separate formula trace rows from load generation internals.

### R6 - Generated Output Hygiene

- Keep generated representative reports reproducible.
- Avoid committing temporary render/cache files.
- Keep package output generation commands documented and repeatable.

## Acceptance Checks

- `npm.cmd test`
- `git diff --check`
- Forbidden legacy acronym scan across source, tests, tools, package metadata, HTML entrypoint, and docs
- No user-facing behavior change unless documented in the refactor note
