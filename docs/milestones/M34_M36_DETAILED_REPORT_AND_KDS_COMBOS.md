# M34-M36 Detailed Report And KDS-Style Combination Plan

## Scope

M34-M36 adds a detailed report path on top of the current S-Structures elastic analysis engine.

- M34: detailed report data contract for model, load, combination, analysis, and member-check traceability.
- M35: KDS-style load combination preset generator and coverage API.
- M36: native `index.html` report menu hook and agent action for opening the detailed report.

## What Works Now

- The browser engine can analyze the current 3D frame model and keep per-combination results.
- The result object already contains total load, total reaction, equilibrium residual, displacement, member force envelope, and preliminary design utilization.
- `createDetailedHtmlReport(model, analysis)` turns those values into a structured report with trace sections.
- `createKdsLoadCombinations(model)` generates a conservative KDS-style preset set from available load cases.
- `window.SStructuresAgent.getDetailedReport()` returns the same report through the AI/browser control API.
- `window.SStructuresAgent.execute('applyKdsLoadCombinations')` replaces or appends generated combinations.
- Clicking the native design report menu fills the existing report modal with the detailed report.

## Current Limits

This is not yet a certified final structural calculation package.

- Load derivation sheets are not yet implemented.
- KDS clauses are represented as preset metadata, not a full code-rule engine.
- RC reinforcement detailing is still preliminary.
- Steel compactness, lateral torsional buckling, connection, base plate, weld, and bolt checks are still separate future work.
- Foundation design and geotechnical checks are not implemented.
- CAD/image/MGT import audit trails are planned but not part of this milestone.

## Browser And Agent API

Read APIs:

- `getDetailedReport(options)`
- `getKdsLoadCombinationCoverage(options)`

Execute actions:

- `applyKdsLoadCombinations({ replace: true })`
- `applyKdsLoadCombinations({ append: true })`
- `openNativeDetailedReport(options)`

## Review Notes

The existing summary report remains available as `getReport()`. The detailed report is a separate path so old report tests and original UI behavior stay compatible while the new report grows into a formal calculation package.
