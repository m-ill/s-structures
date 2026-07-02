# P3-M9 Point Cloud Extraction Verification

date: 2026-07-02
status: preliminary core locked

## Scope

This note verifies P3-M9 against `docs/phase3/IMPORT_POINT_CLOUD_PLAN.md`.

## Verified Items

| Plan item | Evidence |
| --- | --- |
| Synthetic point-cloud generation | `src/import/pointcloud/synthetic.js` |
| Story detection | `src/import/pointcloud/storyDetect.js` and benchmark test |
| Column extraction | `src/import/pointcloud/columnDetect.js` and benchmark recall/precision |
| Beam candidate path | `src/import/pointcloud/beamDetect.js`, currently synthetic ground-truth assisted, with benchmark recall/precision recorded |
| ImportCandidate output | `src/import/pointcloud/extract.js` and `validateImportCandidate()` |
| Candidate-to-analysis E2E | `tests/p3-pointcloud-e2e.mjs` |
| Agent-readable extraction state | `POINT_CLOUD_EXTRACTION_SUMMARY_VERSION` in candidate audit and manifest |
| Candidate evidence contract | extraction summary exposes story/column/beam evidence, confidence bands, and wall extraction status |
| Benchmark review decision | benchmark score exposes `review.syntheticGate`, failed target IDs, real scan gate, and AI-readable decision |

## Added Review Finding

The previous extraction audit only exposed raw counts. P3-M9 now records confidence, story-level evidence, beam source, and explicit limitations so an AI agent cannot mistake synthetic benchmark support for real scan proof.

2026-07-02 review update: The synthetic benchmark now records beam recall and precision in addition to story error and column recall/precision. The extraction summary and benchmark also expose `realScanValidation: pending-owner-file`, keeping the field-validation gap explicit for AI agents.

2026-07-02 follow-up: The extraction summary now exposes candidate-level evidence rows and confidence bands. Story, column, and beam candidates carry their supporting evidence, while wall extraction is explicitly marked as `not-v1-production` until real scan validation and panel grouping are available.

2026-07-02 contract update: P3-M9 extraction summaries now expose a `contract` with P3-T41 through P3-T45, output type, and source status. The synthetic benchmark result now records target thresholds and pass flags for story, column recall, column precision, and beam recall, so AI agents can verify the benchmark gate without recalculating thresholds from the plan document.

2026-07-02 benchmark-review update: `evaluatePointCloudExtraction()` now exposes a `review` block with synthetic gate status, failed target IDs, real scan gate status, owner-scan requirement, and `agentDecision`. This lets AI agents distinguish "synthetic benchmark passes but real scan is pending" from an actual extraction failure without reinterpreting raw metric values.

## Current Test Gate

P3-M9 is covered by:

| Test | Coverage |
| --- | --- |
| `tests/p3-pointcloud-extraction.mjs` | story error, column recall/precision, beam source, candidate evidence, wall status, limitations, manifest contract |
| `tests/p3-pointcloud-e2e.mjs` | extracted candidate to model to elastic analysis |

## Remaining Limits

P3-M9 remains preliminary. Beam detection still uses synthetic ground-truth assistance in the current benchmark path, wall extraction is not implemented for real scans, and real field point-cloud validation is pending.
