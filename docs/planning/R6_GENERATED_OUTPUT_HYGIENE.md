# R6 Generated Output Hygiene

## Scope

R6 keeps review artifacts and temporary render files separated.

Preserved outputs:

- `reports/representative-buildings`
- `reports/representative-building-calculation-packages`
- `output/pdf/representative-buildings`
- `output/pdf/m42-representative-packages`

Temporary outputs:

- `tmp/pdfs/representative-building-plots`
- `tmp/pdfs/m42-representative-package-plots`
- `tmp/pdfs/m50-render-checks`

## Rules

- PDF export scripts may create temporary plot images under `tmp/pdfs`.
- Export scripts remove their own plot directory in a `finally` block.
- `npm run clean:generated-temp` removes only known temporary paths under `tmp`.
- The cleanup script refuses to remove anything outside workspace `tmp`.
- Review PDFs, JSON manifests, model reports, and calculation packages are never deleted by the cleanup script.

## Verification

Run these after report-generation changes:

```bash
npm run clean:generated-temp
npm test
```

The cleanup command should report the removed temporary targets and leave `reports` and `output/pdf` intact.
