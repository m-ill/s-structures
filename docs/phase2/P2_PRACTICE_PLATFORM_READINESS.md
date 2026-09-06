# P2 Practice Platform Readiness

status: preliminary

## Scope

This milestone adds office workflow and automation contracts around the
current elastic-analysis and preliminary-design engine. It is intended to keep
project state, review state, AI QA, and import/export plans separate from
calculation code.

## Contracts

| Contract | Output |
| --- | --- |
| Project workflow | project name, revision, review state, approval state |
| AI QA checklist | model, analysis, load, result, demand readiness items |
| Import/export | structured JSON, drawing image, MGT, spreadsheet source map |
| Agent API | `getPracticePlatformReadiness()` |

## Limits

1. Workflow is a data contract and does not yet enforce locks.
2. Drawing-image and MGT sources are planned mapping contracts.
3. QA status is advisory and does not replace engineering review.

## Verification

Run `npm run test:p2platform`.
