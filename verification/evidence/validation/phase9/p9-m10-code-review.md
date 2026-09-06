# P9-M10 Final Code Review

## Scope

- compatibility and public export retention policy
- Phase 9 dependency direction and compute cycle audit
- M0~M10 evidence/manifest integrity and final debt status
- focused CPU/product regression and release package generation
- user and Agent documentation

## Findings

No open Critical or High findings remain.

Medium findings resolved during P9-M10:

1. M9 compatibility metadata expired at P9-M10 while public callers still existed. The paths are now versioned, owner-bound, explicitly retained pending public API approval, and forbidden as default product/GPU/design-transfer routes.
2. Prior milestone manifest validators required the exact historical next milestone and failed after legitimate advancement. M6~M9 validators now use one shared milestone-rank policy that accepts later Phase 9 and external-qualification states while continuing to verify their immutable evidence hashes and qualification fields.
3. The release gate initially summarized ownerless debt without a final row-level artifact. `p9-m10-final-debt.json` now records 11 closed implementation debts, one approved retained compatibility debt and four owned qualification blockers.
4. Missing external evidence could previously be inferred only from blocker strings. The release manifest now carries a typed BLOCKED decision and explicit `missingEvidence` list.
5. Disabled legacy/GPU paths were documented inconsistently between UI and Agent surfaces. The Agent manifest and user manuals now name the shared product path and compatibility limits.
6. The initial legacy export audit only rechecked symbols already present in the registry. It now extracts direct legacy nonlinear run exports from `src/index.js`, so a newly exposed unregistered legacy entry point fails the cleanup gate.

## Residual Risk

- The external hardware/browser matrix has not been run.
- Full CPU-only regression is not claimed; the user-requested focused policy excludes long nonlinear suites.
- M-tier Pushover/NLTH and elastic GPU performance gates remain open.
- Public synchronous preview and preliminary Pushover APIs remain for compatibility. Removing them is a future breaking change requiring explicit approval.
- External independent structural-program comparison remains a separate user-run gate.

Review decision: P9-M10 implementation accepted; Phase 9 release blocked; G2 retained.
