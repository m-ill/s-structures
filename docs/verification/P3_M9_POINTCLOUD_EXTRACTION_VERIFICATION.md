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
| Wall candidate review path | `src/import/pointcloud/wallDetect.js`, review-only wall panel candidate evidence |
| ImportCandidate output | `src/import/pointcloud/extract.js` and `validateImportCandidate()` |
| Candidate-to-analysis E2E | `tests/p3-pointcloud-e2e.mjs` |
| Agent-readable extraction state | `POINT_CLOUD_EXTRACTION_SUMMARY_VERSION` in candidate audit and manifest |
| Candidate evidence contract | extraction summary exposes story/column/beam/wall evidence, confidence bands, and wall review status |
| Benchmark review decision | benchmark score exposes `review.syntheticGate`, failed target IDs, real scan gate, and AI-readable decision |
| Real-scan validation decision | extraction summary and benchmark score now share `buildPointCloudExtractionReview()` so owner-file status changes are reflected in `realScanGate`, `productionReady`, and `agentDecision` |

## Added Review Finding

The previous extraction audit only exposed raw counts. P3-M9 now records confidence, story-level evidence, beam source, and explicit limitations so an AI agent cannot mistake synthetic benchmark support for real scan proof.

2026-07-02 review update: The synthetic benchmark now records beam recall and precision in addition to story error and column recall/precision. The extraction summary and benchmark also expose `realScanValidation: pending-owner-file`, keeping the field-validation gap explicit for AI agents.

2026-07-02 follow-up: The extraction summary now exposes candidate-level evidence rows and confidence bands. Story, column, and beam candidates carry their supporting evidence, while wall extraction is explicitly marked as preliminary until real scan validation and panel grouping are available.

2026-07-02 contract update: P3-M9 extraction summaries now expose a `contract` with P3-T41 through P3-T45, output type, and source status. The synthetic benchmark result now records target thresholds and pass flags for story, column recall, column precision, and beam recall, so AI agents can verify the benchmark gate without recalculating thresholds from the plan document.

2026-07-02 benchmark-review update: `evaluatePointCloudExtraction()` now exposes a `review` block with synthetic gate status, failed target IDs, real scan gate status, owner-scan requirement, and `agentDecision`. This lets AI agents distinguish "synthetic benchmark passes but real scan is pending" from an actual extraction failure without reinterpreting raw metric values.

2026-07-02 wall-candidate update: `wallDetect.js` now exposes wall panel review candidates from synthetic ground truth or user-supplied review input. The extraction summary records `wallExtraction.status`, candidate geometry, confidence band, `midPierReady`, and limitations. These wall candidates are audit/review evidence only; the point-cloud import path does not yet auto-convert wall panels into production mid-pier analysis members.

2026-07-02 real-scan decision update: point-cloud extraction review decisions now normalize `pending-owner-file`, `checked`, and `failed` states. A synthetic benchmark pass remains non-production until real scan validation is `checked`; AI agents can branch on `pointcloud.evidence.review.productionReady` instead of inferring readiness from raw benchmark values.

## Current Test Gate

P3-M9 is covered by:

| Test | Coverage |
| --- | --- |
| `tests/p3-pointcloud-extraction.mjs` | story error, column recall/precision, beam source, wall candidate recall/evidence, candidate evidence, limitations, manifest contract |
| `tests/p3-pointcloud-e2e.mjs` | extracted candidate to model to elastic analysis |

## Remaining Limits

P3-M9 remains preliminary. Beam detection still uses synthetic ground-truth assistance in the current benchmark path, wall extraction is a review candidate trace rather than production real-scan plane grouping, and real field point-cloud validation is pending.

2026-07-03 practice-validation update: `getPhase3PointCloudValidationReview` now records synthetic benchmark rows separately from owner real-scan validation rows. This keeps story/column/beam benchmark success useful for regression while preventing AI agents from treating synthetic-assisted beam/wall extraction as production field-scan proof.
