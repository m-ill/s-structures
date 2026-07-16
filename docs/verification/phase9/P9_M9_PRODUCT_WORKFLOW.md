# P9-M9 Product Workflow

## Decision

P9-M9 implementation is complete. Elastic and nonlinear product execution now share one versioned analysis service for capability discovery, validation, planning, asynchronous job execution, progress, cancel, retry, bounded results, reports and telemetry.

The Analysis Center, elastic ribbon, nonlinear workflow and Agent API use the same canonical settings bytes and plan hash. Legacy synchronous calls remain only in an isolated compatibility module; P9-M10 records them as approved retained compatibility whose removal requires explicit public breaking-change approval. They are not a production compute route and cannot authorize GPU execution or design transfer.

Qualification remains `G2`. `Auto` and `CPU precise` resolve to the qualified CPU f64 path. `GPU accelerated` is disabled and displays its unsupported reason and remediation until the required hardware/browser matrix and release gates pass. There is no silent GPU-to-CPU fallback.

## Verification

| Verification | Scope | Result |
| --- | --- | --- |
| `P9-UI-01~07` | capability, validate, plan, job lifecycle, bounded result and report | PASS |
| `P9-UI-08~12` | Analysis Center/nonlinear controls, progress, cancel/retry and provenance | PASS |
| `P9-API-07~14` | Agent validate/plan/run/status/result/slice/report/telemetry | PASS |
| `P9-REF-10` | production UI direct numeric solver calls removed | PASS |
| P8 product UI/Agent regression | nonlinear workflow, result popup and job API compatibility | PASS |
| elastic Worker regression | static and eigen Worker product services | PASS |
| responsive UI | 1091x960 and 390x844, no panel horizontal overflow | PASS |

The focused browser review confirmed visible `Auto`, `CPU precise` and disabled `GPU accelerated` controls, an always-visible GPU unsupported notice, responsive panel scrolling, and no browser console errors.

## Product Boundary

- `analysisProductService` owns all public elastic/nonlinear job operations.
- `analysisCaseEngine` is the only new owner of direct elastic, dynamic and nonlinear engine calls.
- UI modules consume the service through `indexBridge`; they do not import numerical solvers.
- Browser static and eigen cases retain the resident Worker product routes.
- The nonlinear product service remains the authoritative Pushover/NLTH owner behind the shared facade.
- Reports and raw telemetry disclose requested target, actual target, backend, plan hash, audit and qualification state.

## Open Qualification Work

P9-M5 elastic speed/profile blockers and P9-M8 nonlinear M-tier/browser budgets remain open. Production GPU routing, automatic GPU selection, design transfer and Phase 9 release remain blocked until P9-M10 and external qualification evidence close those gates.
