# Phase 9 Verification Matrix

```yaml
version: p9-verification-matrix-v1
status: proposed
evidence_root: reports/validation-evidence/phase9
```

## 1. 검증 등급

| Level | 의미 | 예시 |
| --- | --- | --- |
| L0 | schema/static | version, required field, dependency rule |
| L1 | math unit | vector, reduction, scaling, element kernel |
| L2 | component parity | CPU old/new, CPU/GPU operation 비교 |
| L3 | integrated analysis | domain부터 recovery/audit까지 |
| L4 | product workflow | Worker/UI/Agent/report와 failure handling |
| L5 | qualification | independent reference, hardware matrix, project workload |

G3 이상 compute 등급은 L1~L5 중 지정된 모든 gate를 요구한다.

## 2. Evidence status

| Status | 의미 |
| --- | --- |
| PASS | 실제 입력·결과·tolerance를 재계산해 통과 |
| FAIL | 시험을 실행했고 기준을 위반 |
| BLOCKED | 필수 환경·근거·지원기능이 없어 승인 불가 |
| SKIP | 해당 fixture에 비적용. release denominator에서 임의 제외 금지 |

missing evidence를 PASS로 취급하지 않는다.

## 3. 수치 비교 규칙

- absolute max와 relative L2를 함께 계산한다.
- near-zero channel은 absolute tolerance를 우선한다.
- matrix residual은 원본 CPU `f64` equation에서 계산한다.
- 기존 analysis criteria가 이 문서보다 엄격하면 기존 값을 따른다.
- design status, governing identity, termination과 qualification flag는 이산값 일치를 요구한다.
- modal vector는 sign/order canonicalization 후 MAC 계열 지표를 사용한다.
- NLTH/Pushover event는 stable key로 정규화한 뒤 비교한다.

## 4. Evidence schema

필수 field:

```text
suiteId, verificationIds, generatedAt, sourceRevision
environment, backendBuilds, executionPlan, fixtureHash
actual, reference, tolerances, recomputedErrors
status, blockers, qualificationImpact, artifactHash
```

성능 evidence는 raw duration samples와 peak memory를 포함한다. screenshot과 summary만으로 통과하지 않는다.

## 5. Baseline - P9-BASE-01~10

| ID | Level | 검증 | 합격기준 |
| --- | --- | --- | --- |
| P9-BASE-01~02 | L0/L3 | S/M/L fixture와 canonical hash | 고정 입력·domain·case hash 재현 |
| P9-BASE-03~04 | L3 | CPU f64 golden elastic/nonlinear result | 전체 필수 channel과 audit 존재 |
| P9-BASE-05~06 | L4 | operation timer와 total timer | 단계 합·overhead·total 일관성 |
| P9-BASE-07~08 | L4 | main-thread latency와 memory baseline | raw sample과 환경기록 존재 |
| P9-BASE-09~10 | L0/L4 | debt/caller/export inventory | owner·target·replacement 누락 0 |

## 6. Compute contract - P9-CMP-01~12

| ID | Level | 검증 | 합격기준 |
| --- | --- | --- | --- |
| P9-CMP-01~02 | L0/L2 | DomainBinary pack/unpack | schema·units·hash·ID byte parity |
| P9-CMP-03~04 | L0/L2 | SparsePattern/scatter | CSR/CSC와 reduced assembly parity |
| P9-CMP-05~06 | L0/L2 | StateArena commit/rollback | rejected trial 후 byte-equivalent committed state |
| P9-CMP-07~08 | L0/L4 | ExecutionPlan/backend capability | immutable route와 fail-closed preflight |
| P9-CMP-09~10 | L4 | Worker message/progress/cancel | monotonic sequence, single terminal state |
| P9-CMP-11~12 | L4 | resource ledger/result chunk | dispose balance 0, chunk hash 재현 |

## 7. CPU/WASM - P9-CPU-01~14

| ID | Level | 검증 | 합격기준 |
| --- | --- | --- | --- |
| P9-CPU-01~02 | L1/L2 | typed CSR/CSC operations | independent dense reference 일치 |
| P9-CPU-03~04 | L2 | SPD solve와 residual | CPU golden tolerance 통과 |
| P9-CPU-05~06 | L2 | general/indefinite pivot solve | singular/pivot fixture와 backward error 통과 |
| P9-CPU-07~08 | L2 | symbolic/numeric handle reuse | pattern 유지·value 변경 invalidation 정확 |
| P9-CPU-09~10 | L2/L3 | multi-RHS | repeated single-RHS와 channel parity |
| P9-CPU-11~12 | L4 | cancel/OOM/missing backend | no dense fallback, allocation/state 보존 |
| P9-CPU-13~14 | L2/L5 | SIMD/threads determinism | single-thread tolerance와 event order 일치 |

## 8. Elastic execution - P9-ELA-01~16

| ID | Level | 검증 | 합격기준 |
| --- | --- | --- | --- |
| P9-ELA-01~02 | L3 | combination factor grouping | stiffness-affecting key 정확, 잘못된 공유 0 |
| P9-ELA-03~04 | L3 | multi-RHS static solve | combo displacement/reaction/member parity |
| P9-ELA-05~06 | L3 | envelope/governing identity | 기존 result와 동일 또는 tie 규칙 통과 |
| P9-ELA-07~08 | L3 | steel/RC design | ratio·status·formula trace parity |
| P9-ELA-09~10 | L3 | settlement/unilateral group invalidation | active/stiffness 변경 시 factor 분리 |
| P9-ELA-11~12 | L3 | Direct P-Delta | tangent rebuild, iteration과 audit parity |
| P9-ELA-13~14 | L4 | async Worker progress/cancel | UI 비차단, partial result current 금지 |
| P9-ELA-15~16 | L4 | sync compatibility | S-tier 제한, warning, production GPU 우회 불가 |

## 9. GPU platform - P9-GPU-PLT-01~12

| ID | Level | 검증 | 합격기준 |
| --- | --- | --- | --- |
| P9-GPU-PLT-01~02 | L0/L4 | adapter/feature/limit preflight | unavailable/fallback/limit reason 정확 |
| P9-GPU-PLT-03~04 | L1/L4 | buffer alignment/segmentation | validation error 0, hash parity |
| P9-GPU-PLT-05~06 | L4 | resource lifecycle | normal/cancel/failure disposal balance 0 |
| P9-GPU-PLT-07~08 | L4 | queue/error scope/device loss | deterministic failure와 model 불변 |
| P9-GPU-PLT-09~10 | L4 | explicit/auto routing | silent fallback 0, plan provenance 완전 |
| P9-GPU-PLT-11~12 | L5 | browser/vendor capability matrix | approved profile별 재현 evidence |

## 10. GPU numeric kernel - P9-GPU-NUM-01~14

| ID | Level | 검증 | 합격기준 |
| --- | --- | --- | --- |
| P9-GPU-NUM-01~02 | L1/L2 | vector/scaling kernels | CPU f64 reference와 tolerance 통과 |
| P9-GPU-NUM-03~04 | L1/L2 | deterministic reduction | repeat/vendor tolerance와 stable extrema ID |
| P9-GPU-NUM-05~06 | L1/L2 | CSR SpMV | random/structural pattern parity |
| P9-GPU-NUM-07~08 | L1/L2 | preconditioner | zero/negative diagonal fail-closed |
| P9-GPU-NUM-09~10 | L2 | PMM/fiber sample batch | force/tangent/state parity |
| P9-GPU-NUM-11~12 | L2 | element local matrix batch | axis/release/offset fixture parity |
| P9-GPU-NUM-13~14 | L4/L5 | device limit/performance | transfer 포함 threshold와 memory gate 통과 |

## 11. Hybrid elastic - P9-GPU-ELA-01~16

| ID | Level | 검증 | 합격기준 |
| --- | --- | --- | --- |
| P9-GPU-ELA-01~02 | L2 | conditioning/scaling eligibility | unsafe fixture GPU 차단 |
| P9-GPU-ELA-03~04 | L2 | f32 solve + f64 residual | 원본 equation residual 통과 |
| P9-GPU-ELA-05~06 | L2 | iterative correction | convergence 또는 명시 failure, 상한 준수 |
| P9-GPU-ELA-07~08 | L3 | static multi-combination | 모든 combo/recovery/audit parity |
| P9-GPU-ELA-09~10 | L3 | envelope/design | governing identity와 status 동일 |
| P9-GPU-ELA-11~12 | L3 | Direct P-Delta | iteration, tangent, drift/member parity |
| P9-GPU-ELA-13~14 | L4 | explicit GPU failure behavior | CPU-only silent reroute 0 |
| P9-GPU-ELA-15~16 | L5 | S/M end-to-end | approved speed/memory와 100% audit pass |

## 12. Modal/RSA/Buckling - P9-GPU-EIG-01~14

| ID | Level | 검증 | 합격기준 |
| --- | --- | --- | --- |
| P9-GPU-EIG-01~02 | L1/L2 | K/M/Kg operator | dense reference matvec parity |
| P9-GPU-EIG-03~04 | L2 | requested eigenpairs | eigenvalue tolerance와 convergence trace |
| P9-GPU-EIG-05~06 | L2 | sign/order/MAC | canonical pair mapping 안정 |
| P9-GPU-EIG-07~08 | L3 | mass normalization/participation | CPU f64 result parity |
| P9-GPU-EIG-09~10 | L3 | SRSS/CQC RSA | story/member/combined response parity |
| P9-GPU-EIG-11~12 | L3 | buckling factors/modes | preload·eligibility·recovery parity |
| P9-GPU-EIG-13~14 | L4/L5 | rigid mode/failure/performance | unsupported 차단과 M-tier evidence |

## 13. Nonlinear hybrid - P9-GPU-NL-01~24

| ID | Level | 검증 | 합격기준 |
| --- | --- | --- | --- |
| P9-GPU-NL-01~02 | L2 | CPU SoA element batch | 기존 object kernel force/tangent parity |
| P9-GPU-NL-03~04 | L2 | state arena commit/rollback | rejected trial byte parity |
| P9-GPU-NL-05~06 | L2 | GPU element/fiber batch | state·energy·diagnostics parity |
| P9-GPU-NL-07~08 | L2 | deterministic assembly | sparse values와 reduction hash/tolerance |
| P9-GPU-NL-09~10 | L3 | matrix-class partition | unsupported GPU operation 정확 분리 |
| P9-GPU-NL-11~12 | L3 | gravity checkpoint/session | CPU checkpoint와 동일 initial state |
| P9-GPU-NL-13~14 | L3 | Pushover curve | step/base shear/control/story/member parity |
| P9-GPU-NL-15~16 | L3 | hinge/fiber event | transition, termination과 state parity |
| P9-GPU-NL-17~18 | L3 | NLTH history/envelope | selected history, peak와 event parity |
| P9-GPU-NL-19~20 | L3 | NLTH energy/equilibrium | CPU f64 audit 통과 |
| P9-GPU-NL-21~22 | L4 | checkpoint/restart/device loss | continuous run parity, trial 폐기 |
| P9-GPU-NL-23~24 | L5 | M-tier end-to-end | performance/memory/UI budget 통과 |

## 14. Failure containment - P9-FAIL-01~10

| ID | Level | 검증 | 합격기준 |
| --- | --- | --- | --- |
| P9-FAIL-01~02 | L4 | GPU unavailable/explicit request | stable reason, no silent fallback |
| P9-FAIL-03~04 | L4 | correction nonconvergence/NaN | result 폐기, model 불변 |
| P9-FAIL-05~06 | L4 | device loss/OOM | canonical checkpoint와 resource cleanup |
| P9-FAIL-07~08 | L4 | cancel/browser suspend | committed boundary와 resume audit |
| P9-FAIL-09~10 | L4 | corrupted buffer/chunk/hash | qualification·design transfer 차단 |

## 15. UI and API - P9-UI-01~12, P9-API-01~14

| ID | Level | 검증 | 합격기준 |
| --- | --- | --- | --- |
| P9-UI-01~04 | L4 | capability/control/preflight | unavailable 기능 비활성·reason 표시 |
| P9-UI-05~08 | L4 | progress/cancel/result provenance | actual operation route와 audit 표시 |
| P9-UI-09~12 | L4 | responsive layout/history/report | elastic/nonlinear 동일 product behavior |
| P9-API-01~03 | L0/L4 | plan/job schema | UI와 Agent settings-byte parity |
| P9-API-04~06 | L4 | elastic async migration | sync facade 제한과 result parity |
| P9-API-07~10 | L4 | GPU capability/run/status | stable reason와 bounded result slice |
| P9-API-11~14 | L4 | cancel/restart/report/export | provenance와 raw channel 무손실 |

## 16. Refactoring - P9-REF-01~14

| ID | Level | 검증 | 합격기준 |
| --- | --- | --- | --- |
| P9-REF-01~03 | L0 | debt/owner/dependency baseline | owner·milestone 누락 0 |
| P9-REF-04~05 | L0/L2 | sparse owner 단일화 | duplicate writer/production format 0 |
| P9-REF-06~07 | L0/L3 | modal/buckling 책임분리 | solver/recovery parity |
| P9-REF-08~09 | L2 | element hot-loop cleanup | clone/allocation 감소와 result parity |
| P9-REF-10 | L0/L4 | UI/product dependency | direct backend call 0 |
| P9-REF-11~12 | L0/L4 | legacy/export cleanup | expired caller/dead export 0 |
| P9-REF-13~14 | L0/L4 | generated docs/evidence hygiene | source hash·tool version·stale 0 |

## 17. Performance - P9-PERF-01~20

| ID | Level | 검증 | 합격기준 |
| --- | --- | --- | --- |
| P9-PERF-01~04 | L5 | CPU elastic factor/multi-RHS | total regression <= approved budget |
| P9-PERF-05~07 | L5 | GPU startup/kernel/transfer | raw samples와 threshold evidence |
| P9-PERF-08~10 | L5 | hybrid elastic/P-Delta | end-to-end median improvement와 audit |
| P9-PERF-11 | L5 | modal/RSA/buckling | requested-mode time/memory budget |
| P9-PERF-12 | L5 | nonlinear batch | element/state/assembly breakdown |
| P9-PERF-13~15 | L5 | Pushover/NLTH | M-tier time/memory/UI/cancel budget |
| P9-PERF-16~18 | L5 | multi-vendor/browser | profile별 parity와 p95 |
| P9-PERF-19~20 | L5 | result pipeline/resource leak | bounded memory와 dispose balance 0 |

## 18. Release - P9-REL-01~12

| ID | Level | 검증 | 합격기준 |
| --- | --- | --- | --- |
| P9-REL-01~02 | L5 | requirement/evidence coverage | 필수 ID missing 0 |
| P9-REL-03~04 | L5 | CPU-only/full regression | 기존 product 기능 회귀 0 |
| P9-REL-05~06 | L5 | hardware/browser qualification | approved matrix 통과 |
| P9-REL-07~08 | L5 | risk/code review | Critical/High open 0 |
| P9-REL-09~10 | L5 | cleanup/license/docs | owner 없는 debt와 미승인 dependency 0 |
| P9-REL-11~12 | L5 | fail-closed manifest/build | hash 검증, missing evidence BLOCKED |

## 19. Release 판정

| Compute 등급 | 필요한 verification |
| --- | --- |
| G1 | BASE, CMP, CPU contract subset |
| G2 | GPU-PLT, GPU-NUM component |
| G3 | ELA, GPU-ELA, PERF elastic, FAIL subset |
| G4 | GPU-NL, Pushover/NLTH PERF, device-loss |
| G5 | UI/API, full PERF, REF, REL 전체 |

Phase 8 해석기능이 `candidate`이면 G5 compute backend를 사용해도 결과의 해석 qualification은 자동으로 `verified`가 되지 않는다.

\n