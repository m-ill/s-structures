# M50 Representative Current Trace PDFs

## Scope

M50 refreshes the ten representative building calculation packages and PDF review set so the exported files include the current design-trace layers.

- Regenerates all ten representative building HTML/JSON packages.
- Re-exports the 11-file PDF set: one index plus ten building reports.
- Adds M48 load-derivation trace and M49 serviceability drift summaries to each representative package.
- Keeps M44 load-standard audit and M45 member design trace checks visible in the package index and PDF README.
- Updates the M46 regression test so future package refreshes can supersede the original PDF label without dropping M44/M45 content.
- Adds a dedicated M50 regression test for current trace presence in representative reports and PDF metadata.

## Outputs

- `reports/representative-building-calculation-packages/`
- `output/pdf/m42-representative-packages/`

## Review Notes

- The package is still a preliminary engineering trace for review, not a sealed final design document.
- Generated HTML is normalized to remove trailing line whitespace before writing report files.
- PDF export still emits non-fatal font subset warnings from the PDF backend.

## Verification

- `npm.cmd run generate:m42-representative-packages`
- `npm.cmd run export:m42-representative-pdfs`
- `npm.cmd run test:m46`
- `npm.cmd run test:m50`
- `npm.cmd test`
- `git diff --check`
- Forbidden legacy acronym scan across `src`, `tests`, `tools`, `package.json`, `index.html`, and `docs`
