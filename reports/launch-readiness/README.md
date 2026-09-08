# Phase 3 Launch Readiness

This folder records P3-M20 launch evidence.

## Gate Summary

| Gate | Evidence |
| --- | --- |
| G1 full suite | `npm.cmd test` |
| G2 benchmarks | milestone benchmark tests and nonlinear B1-B8 tests |
| G3 point-cloud benchmark | `tests/p3-pointcloud-extraction.mjs`, `tests/p3-pointcloud-e2e.mjs` |
| G4 representative pilot | `buildPilotProjectValidation({ limit: 10 })` |
| G5 workflow e2e | server/auth/persistence/app shell tests |
| G6 import e2e | DXF, plan, point-cloud tests |
| G7 performance | `performance-security.md` |
| G8 security | `performance-security.md` |
| G9 manual | `docs/user-manual/PHASE3_LAUNCH_MANUAL.md` |
| G10 agent contract | `docs/user-manual/agent-contract.json` |
| G11 beta pilot reports | `pilot-01.md` to `pilot-10.md` |
| G12 backup restore | `backup-restore.md` |
| G13 design verification | `verification/specs/DESIGN_MODULE_VERIFICATION.md` |
| G14 calculation completeness | `tests/p3-launch-gate.mjs` |

## Manual Sign-Off

Automated gate success does not equal owner approval for public release. Manual release decisions are tracked in `owner-signoff-checklist.md`.
