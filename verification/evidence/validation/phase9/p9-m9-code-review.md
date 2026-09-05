# P9-M9 Code Review

## Scope

- shared elastic/nonlinear product service and case engine
- Analysis Center, elastic ribbon and nonlinear workflow migration
- Agent action catalog, manifest and execution parity
- capability, provenance, report, telemetry and compatibility boundaries
- P9-M9 governance, evidence and release manifest

## Findings

No critical or high-severity findings remain after review.

Medium findings resolved during the milestone:

1. Concurrent batch submission could contend for one resident Worker. Product execution is now serialized and bridge batch execution is sequential.
2. Retry could retain the prior job identifier. Retried jobs now receive a fresh identity while preserving the original request and audit lineage.
3. Nonlinear preflight normalization dropped source/stage metadata. Normalization now retains the originating validation stage.
4. Production UI still imported numerical cores through compatibility paths. Direct core calls are isolated in `legacyUiCompatibility.js` with a P9-M10 expiry.
5. Unsupported GPU remediation was available only as a disabled-button tooltip. Elastic and nonlinear panels now render the reason and alternative route visibly.

## Residual Risk

- Synchronous compatibility APIs remain available for old tests and legacy hosts, with explicit deprecation metadata and no product GPU permission.
- Production GPU remains unqualified and cannot be selected; `Auto` remains CPU f64.
- P9-M5 and P9-M8 qualification debt is unchanged.
- The mobile nonlinear tab transition is computationally heavy in the local browser harness, but completed without console errors; focused product UI tests pass.
- External independent comparison and the full browser/vendor matrix remain outside this local milestone.

## Test Scope

The P9-M9 suite, elastic/eigen Worker product tests, Analysis Center regression, native advanced-analysis regression and focused P8 nonlinear product UI/Agent tests passed. Long-running full nonlinear suites were intentionally not repeated.

Review decision: product workflow accepted; qualification blocked; G2 retained.
