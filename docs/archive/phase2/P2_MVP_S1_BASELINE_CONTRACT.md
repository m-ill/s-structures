# P2-MVP-S1 Baseline Contract

status: implemented
tickets: T01, T02, T03

## Scope

P2-MVP-S1 fixes the first Phase 2 contracts before deeper validation, benchmark, story, and load work.

| Ticket | Result |
| --- | --- |
| T01 Unit system | `unitSystem` contract is created and migrated with models |
| T02 Sign convention | global/member/load/reaction convention is available as a public contract |
| T03 Schema contract | schema name, version, required collections, and migration target are exposed |

## Public API

| API | Purpose |
| --- | --- |
| `normalizeUnitSystem()` | normalize internal/display/conversion audit units |
| `getSignConvention()` | read current sign convention |
| `buildSchemaContract()` | read current schema contract |
| `buildBaselineContract(model)` | read combined Phase 2 baseline contract |
| `window.SStructuresAgent.getBaselineContract()` | agent-readable baseline contract |

## Verification

```powershell
npm.cmd run test:p2s1
npm.cmd run test:m51
```

`npm.cmd test` also runs the numeric alias `test:m51`.
