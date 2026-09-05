# P9-M1 Common Compute Contract Verification

## Decision

P9-M1 is complete as a `G1 Contract-Integrated` candidate. It establishes one versioned compute contract and asynchronous Worker lifecycle shared by elastic and nonlinear analysis adapters. It does not qualify GPU execution, permit design transfer, or close the Phase 9 release gate.

## Implemented Contract

The M1 compute layer is owned by `src/compute`:

- `contracts/domainBinary.js`: deterministic typed structural fields, canonical full-model payload, units, dictionary/source/domain hashes, transferables, and unpack validation.
- `contracts/sparsePattern.js`: typed CSR/CSC schema, deterministic topology, and member-local scatter map.
- `contracts/stateArena.js`: run-owned committed/trial state with alias-safe commit, rollback, and disposal.
- `contracts/resultChunk.js`: typed result ranges, extrema, provenance, and reproducible content hash.
- `backends/contract.js`: common backend descriptor, target policy, capability preflight, legacy adapter, and session lifecycle.
- `execution/executionPlan.js`: immutable operation route with settings bytes, backend build hash, audit policy, and forbidden runtime fallback.
- `runtime`: versioned Worker protocol, core, client, browser/Node entry, progress, cancellation, terminal state, and transferable ownership.
- `telemetry`: bounded telemetry and balanced resource ledger.
- `adapters/analysisAdapters.js`: current elastic, production pushover, and production NLTH bridges.
- `compatibility/syncFacade.js`: explicit, size-limited, non-UI synchronous compatibility route with P9-M9 expiry and P9-M10 deletion target.

## Parity Policy

`DomainBinary` is the authoritative adapter input. The adapter reconstructs the engine model from the canonical UTF-8 payload before invoking the current engine. Advanced loads, support settlement, custom section/material fields, analysis settings, and future JSON model extensions therefore remain available even when they do not yet have dedicated typed kernel columns.

Physical result parity excludes only explicit runtime measurement fields (`totalSolveMs`, `durationMs`, `elapsedMs`, and start/finish timestamps). The returned engine result itself is not stripped or rewritten.

## Verification Mapping

| IDs | Test | Coverage |
| --- | --- | --- |
| P9-CMP-01~04 | `tests/p9-m1-domain-pattern.mjs` | Binary pack/unpack, units/IDs/full payload, CSR/CSC, scatter parity |
| P9-CMP-05~06 | `tests/p9-m1-state-result.mjs` | Commit/rollback, owner isolation, alias containment |
| P9-CMP-07~08, P9-API-01 | `tests/p9-m1-plan-backend.mjs` | Immutable plan, settings bytes, backend build binding, fail-closed routing |
| P9-CMP-09~10, P9-API-02 | `tests/p9-m1-worker-runtime.mjs` | Progress/sequence, cancellation, original protocol errors, single terminal result |
| P9-CMP-11~12 | `tests/p9-m1-state-result.mjs` | Resource balance and ResultChunk hash/tamper detection |
| P9-API-03, P9-REF-02~03 | `tests/p9-m1-adapters-architecture.mjs` | Adapter parity, shared policy owner, dependency direction, compatibility expiry |

## Minimal Regression Run

The following checks were run:

```text
npm run test:p9 -- M1        PASS (5 focused test files)
node tests/p8-m2-worker-runtime.mjs  PASS
node tests/p8-m7-artifacts.mjs       PASS
npm run test:p9docs          PASS
```

Per the execution decision, long Phase 8 nonlinear solver suites were not rerun. Their previously qualified evidence remains referenced by the M0 baseline and M1 evidence policy.

## Open Gates

- M2 CPU/WASM sparse runtime is not implemented by M1.
- Current adapters still invoke existing engines after contract reconstruction; full elastic runtime migration belongs to M3.
- GPU backend implementation and qualification remain G0 with respect to actual GPU compute.
- Product UI/agent caller migration remains P9-M9.
- Release and design-transfer permissions remain false.
