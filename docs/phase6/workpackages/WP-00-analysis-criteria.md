# WP-00 — Analysis Criteria Registry

```yaml
milestone: P6-M0
priority: 0 (all WP prerequisite)
depends: —
```

## Problem

Phase 6 makes solver tolerance, RSA coefficients, P-Delta thresholds, shell-equivalent tolerances, and serviceability limits configurable. The existing code still reads many values directly from `model.analysisSettings.*` or uses hardcoded defaults. If every WP solves this locally, criteria will diverge.

## Goal

Create one criteria resolution path before WP-01 starts:

```text
model.analysisCriteria
  -> standard preset
  -> project overrides
  -> legacy analysisSettings fallback
  -> traceable resolved criteria object
```

## Existing Assets

- `model.analysisSettings.*` legacy values.
- `src/core/schema.js`, `src/core/model.js`, `src/core/validation.js`.
- Phase 6 canonical keys in `FORMULAS_AND_CRITERIA.md#config-registry`.

## Deliverables

- `src/core/analysisCriteria.js` — default criteria, preset merge, override merge, and `resolveCriterion(model, key)`.
- schema/migration support for `model.analysisCriteria`.
- validation warnings for unknown criteria keys, wrong value type, and out-of-range values.
- trace helper that records the resolved criteria source: `preset`, `override`, `legacyFallback`, or `default`.
- tests for all Phase 6 criteria keys listed in `FORMULAS_AND_CRITERIA.md`.

## Compatibility

Legacy keys stay readable:

- `pDeltaTolerance`
- `pDeltaMaxIterations`
- `pDeltaMaxAmplification`
- `pDeltaThetaNegligible`
- `pDeltaThetaLimit`

Legacy values must be copied into the resolved criteria trace, not silently hidden.

## Acceptance Gate

1. All keys in `FORMULAS_AND_CRITERIA.md` resolve through one accessor.
2. Existing models without `analysisCriteria` still run.
3. Reports and agent traces can show the resolved preset and project overrides.
4. No Phase 6 WP reads hardcoded thresholds directly.

## Review Log

| Date | Finding | Action | Status |
| --- | --- | --- | --- |
| | | | |
