# S-Structures User Manual

manualVersion: 2026-07-03-phase4-prebeta

This folder is the user-facing and AI-readable manual set for the current
pre-beta product. Development milestone notes stay outside this folder; this
folder explains how to operate the program as it exists now.

## Unified Help (HTML)

`/help.html` is the unified, self-contained help viewer: a collapsible
tree menu with two sections — 사용 안내서 (this folder's markdown pages,
pre-rendered) and 기능 설명서 (13 categories / 75 feature entries from
`src/platform/featureCatalog.js`, the single source of feature-control
keys `feature.<id>`). All content is embedded at build time, so it also
opens by double-clicking the file (no server needed). Deep links:
`help.html#<page-or-feature-id>`. Legacy `manual.html` / `guide.html`
redirect here.

Regenerate after editing manuals or the catalog: `npm run build:help`.
Sync and coverage are enforced by `tests/p4-user-guide.mjs` and
`tests/p4-feature-manual.mjs`.

## Manual Map

| Order | Document | Purpose |
| --- | --- | --- |
| 00 | `00-install.md` | Install, config, desktop scaffold, backup |
| 01 | `01-getting-started.md` | Open the app, understand shell routes, create projects |
| 02 | `02-modeling-and-elastic-analysis.md` | Model and run elastic analysis |
| 03 | `03-loads-design-and-reports.md` | Loads, combinations, design traces, reports |
| 04 | `04-import-drawings.md` | DXF/DWG import review workflow |
| 05 | `05-import-pointcloud.md` | Point-cloud load and extraction workflow |
| 06 | `06-materials-library.md` | Project material and section library |
| 07 | `07-nonlinear-analysis.md` | Preliminary nonlinear workflow |
| 08 | `08-collaboration.md` | Accounts, revisions, evidence, approvals |
| Status | `STATUS_AND_LIMITS.md` | Current capability and limitation summary |
| Agent | `AI_AGENT_GUIDE.md` | Stable API and screen-control instructions |
| Contract | `agent-contract.json` | Machine-readable agent contract |

## Tutorials And Samples

- `tutorials/T1-drawing-to-calculation.md`
- `tutorials/T2-pointcloud-to-model.md`
- `tutorials/T3-pushover-review.md`
- `samples/onboarding/*.json`

## Current Product Scope

Available: project shell, native modeler host, server revisions, elastic 3D
analysis, preliminary load/design/report traces, import review UI, project
library UI, AI command bridge, backup tool, and release packaging.

Excluded from this pre-beta pass: formal engineering validation, clean-machine
external smoke, beta tester execution, and final production sign-off.

## AI Reading Order

1. Read `agent-contract.json`.
2. Read `AI_AGENT_GUIDE.md`.
3. Read the task-specific manual page.
4. Check `STATUS_AND_LIMITS.md` before interpreting calculation results.
5. Use `getCapabilities()`, `getSnapshot()`, and `getScreenState()` before any
   automated action.
