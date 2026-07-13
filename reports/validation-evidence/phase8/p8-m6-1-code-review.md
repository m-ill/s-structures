# P8-M6.1 Code Review

- Date: 2026-07-13
- Scope: PMM preprocessing performance, numerical parity, Worker execution, cache integrity, cancellation, stale-source handling, and production Pushover integration
- Final result: PASS
- Remaining P0/P1 findings: 0

## Review Outcome

The implementation preserves the P8-M6 PMM sampling and capacity criteria. The optimized stateless material/section envelope is limited to source-derived PMM preprocessing; committed/trial material history, energy, rollback, and actual nonlinear member analysis continue to use the full stateful evaluator.

An independent numerical review compared full-state and optimized steel, symmetric RC, and asymmetric RC section responses, axial roots, and PMM surfaces. All compared values and numerical surface hashes were identical. Memoization changed execution counts only.

## Findings Closed

1. Initial envelope criteria, pure-axial strength criteria, root initialization, and bracket behavior could diverge from the M6 path. The criteria were separated, continuation seeding was removed, the original `[-0.05, 0.05]` bracket was restored, and exact numerical parity tests were added.
2. Result-affecting root-expansion options were missing from cache identity. `initialBracket`, `bracketExpansion`, and `maxBracketExpansions` are now normalized into the key.
3. A valid interaction could be stored under another source key. Cache records now contain a cloned canonical identity; key, material, section, reinforcement, payload, source, and surface hashes are validated on write and read.
4. Cancellation could be observed after a cache write. Cancellation is checked immediately before and after the persistent commit, and a late cancellation removes the just-written memory and persistent entry.
5. Production browser options could disable the Worker requirement. Production now forces `requireWorker=true`; local execution is available only outside browser production or with `production:false`.
6. The legacy process interaction cache was unbounded. It now uses a 64-entry LRU bound.
7. Node/Electron PMM Workers could initialize the sparse WASM backend because the role query used browser `location`. Worker role selection now uses `import.meta.url`, and dedicated PMM Workers use `backend:null`.
8. A random Electron localhost port changed the IndexedDB origin on every restart. Desktop startup now uses a stable default port and a single-instance lock, with an environment override for deployment conflicts.

## Verification

- `node tests/p8-m6-pmm-runtime.mjs`: PASS, `NL-PMM-09..14`
- `node tests/p8-m6-pmm-runtime-artifacts.mjs`: PASS
- `node tests/p8-m6-fiber-mesh-materials.mjs`: PASS
- `node tests/p8-m6-section-response.mjs`: PASS
- `node tests/p8-m6-pmm-surface.mjs`: PASS
- `node tests/p8-m6-production-coupling.mjs`: PASS
- `node tests/p8-m5-production-pushover.mjs`: PASS
- `node tests/p8-m2-worker-runtime.mjs`: PASS
- `npm.cmd run test:p8`: PASS
- `node tools/check-agent-contract.mjs`: PASS after regeneration
- `git diff --check`: PASS

The final cold RC 400x600 default-mesh measurement used five isolated processes with cache disabled. PMM elapsed time was 412.752 ms median and 422.258 ms maximum; command wall time was 551.642 ms median. The earlier approximately 17-minute observation was not an isolated benchmark and is not used as a speedup denominator.

## Residual Scope

- Persistent cache GC, TTL, and reachability cleanup remain P8-M9 integration work.
- A general multi-analysis scheduler and cross-run in-flight Promise deduplication remain P8-M10 work. M6.1 deduplicates members inside one model and reuses validated memory/persistent artifacts.
- Cancellation of an externally injected shared Worker remains effective at its protocol boundary. The owned production PMM Worker is terminated immediately on AbortSignal.
- The performance result is a candidate component measurement, not P8-M11 reference-hardware or commercial qualification.
