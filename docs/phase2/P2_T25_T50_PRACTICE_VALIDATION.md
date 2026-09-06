# P2 T25-T50 Practice Validation

## Scope

This document records the Phase 2 validation layer added after the elastic practice platform baseline.

The goal is not final certified design approval. The goal is to prove that a model can produce a traceable practice review package:

- T25-T26: P-Delta method, settings, convergence, amplification status, and load-step curve availability.
- T30-T31: story result rows, member station rows, foundation reaction rows, and governing member result availability.
- T41-T42: calculation-package readiness, member design trace coverage, missing load-derivation warning, and result-table linkage.
- T43: issue registry for validation messages, QA warnings, and member design review items.
- T50: 10 representative building pilot gate that confirms analysis and review data generation.

## API Contract

Primary exports:

- `buildPracticeValidationReport(model, analysis, options)`
- `buildPilotProjectValidation(options)`
- `buildIssueRegistry(model, analysis, options)`

Browser and agent read APIs:

- `getPracticeValidationReport(options)`
- `getPilotProjectValidation(options)`

The report keeps design NG/WARN items as review issues. T50 only fails when representative building analysis cannot run.

## Output Placement

The validation result is attached to:

- detailed HTML report data as `practiceValidation`
- calculation package data as `detailed.practiceValidation`
- agent capability manifest modules, read APIs, and data contracts

## Tests

Run the focused tests with:

```text
npm run test:m66
npm run test:m67
```

Run the milestone range with:

```text
npm test -- --from=66 --to=67
```
