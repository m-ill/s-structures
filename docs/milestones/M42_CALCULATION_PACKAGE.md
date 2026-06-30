# M42 Print-Ready Calculation Package

## Scope

M42 adds a print-ready calculation package HTML output.

- Cover page.
- Table of contents.
- Design basis and load summary.
- Elastic analysis summary.
- Member design summary.
- RC, steel, connection, and foundation summary.
- Appendix with remaining design scope and limitations.
- Print CSS for browser PDF output.

## API

Read:

- `createCalculationPackageHtml(model, analysis, options)`
- `window.SStructuresAgent.getCalculationPackage(options)`

## Current Limits

- Output is print-ready HTML intended for browser PDF export.
- It does not yet create a binary PDF file directly in the engine.
- Final sealed calculation packages still require project-specific engineering review and unsupported-check closure.
