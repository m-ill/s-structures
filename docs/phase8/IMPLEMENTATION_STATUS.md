# Phase 8 Implementation Status

```yaml
reviewed_at: 2026-07-13
phase_status: active
implementation_status: p8-m4-complete
release_status: unavailable
production_equivalence: Q1-concentrated-plasticity-candidate
completed_milestones: [P8-M0, P8-M1, P8-M2, P8-M3, P8-M4]
active_milestone: P8-M5
```

## 현재 판정

P8-M0~P8-M4는 완료되었다. M0는 preliminary 경로를 격리했고, M1은 canonical domain과 committed/trial 상태를, M2는 MDOF Newton·sparse/Worker/WASM 기반을 구현했다. M3는 objective 3D corotational frame/truss와 물리축 release를 구현했다. M4는 i/j·local y/z 집중소성 spring, 비대칭 A-B-C-D-E envelope, Masing/isotropic 이력, degradation·energy, 일관 직렬 condensation, 자동배정·PMM hook·transaction undo를 연결했다.

현재 제품 등급은 여전히 Q0다. `commercial-grade within supported scope` 판정은 [PRODUCTION_REQUIREMENTS.md](PRODUCTION_REQUIREMENTS.md)의 Q1~Q5를 모두 통과한 기능 범위에만 부여한다.

| 영역 | 현재 상태 | 제품 판정 |
| --- | --- | --- |
| 기존 Pushover | 실행 가능 | `legacy-preliminary`, 설계전달 차단 |
| 기존 SDOF Newmark NLTH | 실행 가능 | `legacy-preliminary`, model-bound 아님, 설계전달 차단 |
| displacement/arc-length UI | 비활성 및 실행 차단 | `unsupported` |
| production nonlinear engine ID | 예약됨 | M4 집중소성 요소까지 구현, M5 이후 정식 workflow 미구현, legacy fallback 금지 |
| schema v5 nonlinear registry | 구현 및 migration 검증 | P8-M0 완료 |
| nonlinear case/run-record 계약 | 구현 및 UI/report/Agent 전파 | P8-M0 완료 |
| canonical analysis domain | 구현 및 adapter 연결 | P8-M1 완료 |
| support·지정변위·rigid diaphragm constraint | `u = Tq + u_bar` 공통 계약 구현 | P8-M1 완료 |
| immutable element descriptor·origin map | local axis·offset·release·property snapshot 연결 | P8-M1 완료 |
| committed/trial/line-search branch | atomic commit·rollback·cutback 구현 | P8-M1 완료 |
| checkpoint/restart·element state serializer | 무결성 hash와 deterministic event 구현 | P8-M1 완료 |
| source/evidence registry | governance 계약 구현 | 수치 qualification과 분리 |
| reference profile/workload/budget | versioned artifact 고정 | 실제 production backend 측정은 후속 마일스톤 |
| 전역 MDOF 비선형 평형 | 반복별 `Pint`·`Kt` 조립, Newton/line search/load control 구현 | P8-M2 수치코어 완료 |
| 3D corotational frame/truss | 구현 | P8-M3 static candidate, principal rotation chart |
| 집중소성 단부 힌지 | 구현 | P8-M4 static candidate, i/j·local y/z, committed/trial history |
| finite 2축 release | 물리축 0모멘트·general tangent 구현 | static-only, `energyConservative:false`, cyclic/NLTH 차단 |
| 정식 변위제어/arc-length | 미구현 | blocked |
| 3D frame MDOF NLTH | 미구현 | blocked |
| Worker/WASM sparse runtime | 자체 Rust/WASM, zero import, Worker/preflight/cancel 구현 | P8-M2 기반 완료, 대형모델 성능 미검증 |

## M0~M4 완료 증거

- 코드: `src/nonlinear/capabilities.js`, `src/nonlinear/analysisRouter.js`, `src/nonlinear/legacy/`
- schema: `src/core/nonlinearSchema.js`, `src/core/analysisCase.js`, `src/core/nonlinearRunRecord.js`
- migration: schema v4 -> v5 전용 additive migration과 legacy engine 분류
- 실행기록: case/model/domain/engine 결속, legacy qualification ceiling, 무결성 hash
- 제품 표면: Analysis Center, 상세 보고서, 계산 패키지, Agent API에 동일 engine/qualification/model-bound/design-block 필드 전달
- 검증 runner: `npm.cmd run test:p8`
- 전체 회귀: `npm.cmd test` PASS (기존 milestone + Phase 7 + Phase 8)
- 문서 참조: `npm.cmd run test:p3docs` PASS (60 files, 413 references)
- Agent 정합성: `node tools/check-agent-contract.mjs` PASS
- 환경: [p8-m0-reference-profile.json](../../reports/validation-evidence/phase8/p8-m0-reference-profile.json)
- governance evidence: [p8-m0-governance.json](../../reports/validation-evidence/phase8/p8-m0-governance.json)
- 코드 리뷰: [p8-m0-code-review.md](../../reports/validation-evidence/phase8/p8-m0-code-review.md)

`p8-m0-governance.json`은 M0 계약 통과 증거다. 비선형 수치 결과를 `verified`로 승격하는 독립 기준해 증거가 아니며, 검증 registry에서도 analysis-result audit와 분리한다.

M1 증거:

- domain: `src/solver/domain/` 및 기존 `buildExpandedAnalysisDomain` 호환 adapter
- state: `src/nonlinear/core/stateStore.js`, `elementStateRegistry.js`, `elementContract.js`
- adapter identity: 선형·Direct P-Delta·modal·nonlinear topology/property/constraint/mass hash 일치
- 검증: `NL-DOM-01~08`, `NL-STATE-01~07`, `NL-MEI-01~08`
- evidence: [p8-m1-domain-state.json](../../reports/validation-evidence/phase8/p8-m1-domain-state.json)
- 코드 리뷰: [p8-m1-code-review.md](../../reports/validation-evidence/phase8/p8-m1-code-review.md)

M1 역시 전역 비선형 잔차·접선의 수치 정확도를 qualification하지 않는다. 해당 범위는 P8-M2 이후다.

M2 증거:

- 평형 코어: `src/nonlinear/equilibrium/assembler.js`, `newton.js`, `loadControl.js`, `convergence.js`
- sparse/backend: typed CSC scatter, dense·JS sparse reference 한도, 자체 Rust/WASM SPD 및 general/indefinite backend
- runtime: Worker protocol/client/core, transferable ownership, memory preflight, stale token과 committed-boundary cancellation
- 선형연계: Phase 7 fixed-end load·release·offset·elastic stiffness 재사용 및 변위·반력·평형 일치
- 검증: `NL-EQ-01~12`, `NL-CTRL-01~04`
- evidence: [p8-m2-equilibrium.json](../../reports/validation-evidence/phase8/p8-m2-equilibrium.json)
- ADR: [ADR-005-INHOUSE-WASM-SPARSE.md](adr/ADR-005-INHOUSE-WASM-SPARSE.md)
- 코드 리뷰: [p8-m2-code-review.md](../../reports/validation-evidence/phase8/p8-m2-code-review.md)

M2는 평형 수치코어와 실행 기반을 qualification한다. 실제 3D 기하비선형 요소, 소성힌지/fiber, 정식 Pushover, MDOF NLTH 및 대형모델 상용 성능은 qualification하지 않는다.

M3 증거:

- 요소: `src/nonlinear/elements/corotationalFrame3d.js`, `corotationalTruss3d.js`
- 회전좌표: `src/nonlinear/math/rotationCoordinates.js`, `secondOrderJet.js`
- 연계: 물리/일반화 모멘트, 초기응력, reference dead member load, release null mode, offset force/moment transfer
- 검증: `NL-COR-01~12`, Euler 임계비 1.0167, 근임계 변위증폭 6.006, elastica tip 오차 0.0276%
- evidence: [p8-m3-corotational.json](../../reports/validation-evidence/phase8/p8-m3-corotational.json)
- tangent qualification: unreleased relative error `1.183e-6`, released implicit-condensation relative error `4.214e-7`
- release gauge qualification: finite-rotation null mode and `1e-6` weak rotational restraint preservation regression PASS
- ADR: [ADR-002-FINITE-ROTATION-COROTATIONAL.md](adr/ADR-002-FINITE-ROTATION-COROTATIONAL.md)
- 코드 리뷰: [p8-m3-code-review.md](../../reports/validation-evidence/phase8/p8-m3-code-review.md)

M3는 principal rotation-vector chart 안의 탄성 기하비선형 정적 범위를 qualification한다. finite 2축 release는 물리 단력과 접선만 qualification하며 에너지 기반 cyclic/NLTH에는 전달하지 않는다. 외부 상용 solver 비교, 대형모델 성능, 재료비선형은 아직 qualification하지 않는다.

M4 증거:

- 구성법칙: `src/nonlinear/materials/hingeBackbone.js`, `hingeCyclic.js`
- 속성·배정: `src/nonlinear/properties/hingeRegistry.js`, `assignments.js`
- 요소: `src/nonlinear/elements/hingedFrame3d.js`와 M3 corotational 내부회전 condensation
- 검증: `NL-HNG-01~12`, envelope tangent 상대오차 `3.947e-11`, 직렬 접선 상대오차 `3.860e-9`, rollback byte-equivalent PASS
- evidence: [p8-m4-concentrated-hinge.json](../../reports/validation-evidence/phase8/p8-m4-concentrated-hinge.json)
- ADR: [ADR-003-CONCENTRATED-HINGE-SERIES-COMPATIBILITY.md](adr/ADR-003-CONCENTRATED-HINGE-SERIES-COMPATIBILITY.md)
- 코드 리뷰: [p8-m4-code-review.md](../../reports/validation-evidence/phase8/p8-m4-code-review.md)

M4는 집중소성 component와 3D frame 직렬호환을 `candidate`로 qualification한다. 정식 gravity-preloaded displacement-control Pushover, coupled PMM/fiber, 전체 cyclic-static path control, 외부 상용 solver 비교는 아직 qualification하지 않는다.

## Production 등급 현황

| 등급 | 상태 | 미충족 핵심 |
| --- | --- | --- |
| Q1 Numerically Qualified | in-progress | corotational·집중소성 component 완료, fiber·dynamic·외부 benchmark 미완료 |
| Q2 Model-Integrated | in-progress | canonical domain과 집중소성 요소 연결 완료, 정식 workflow·전체 기능 통합 미완료 |
| Q3 Workflow-Complete | not-started | initial-state DAG, 실패복구, 결과/보고/API |
| Q4 Scale-Qualified | in-progress | Worker/WASM 기반 완료, M-tier budget·streaming·pilot 미완료 |
| Q5 Commercial-Grade in Scope | unavailable | 독립 pilot와 전체 release gate |

## 마일스톤 현황

| 마일스톤 | 상태 | 완료 증거 |
| --- | --- | --- |
| P8-M0 상태·계약·격리 | complete | NL-GOV-01~06, schema v5 migration, M0 code review |
| P8-M1 해석영역·상태관리 | complete | NL-DOM-01~08, NL-STATE-01~07, NL-MEI-01~08, M1 code review |
| P8-M2 MDOF 평형 코어 | complete | NL-EQ-01~12, NL-CTRL-01~04, M2 code review |
| P8-M3 3D corotational 요소 | complete | NL-COR-01~12, ADR-002, M3 code review |
| P8-M4 집중소성 힌지 | complete | NL-HNG-01~12, ADR-003, M4 code review |
| P8-M5 정식 Pushover | active | 없음 |
| P8-M6 PMM·fiber 단면 | planned | 없음 |
| P8-M7 arc-length·cyclic static | planned | 없음 |
| P8-M8 MDOF NLTH | planned | 없음 |
| P8-M9 모델 기능 통합·결과회복 | planned | 없음 |
| P8-M10 UI·보고·Agent 계약 | planned | 없음 |
| P8-M11 독립검증·성능·pilot | planned | 없음 |

상태는 코드, 테스트, 검증 artifact, 코드 리뷰가 모두 끝난 뒤에만 `complete`로 변경한다.

## 다음 작업

P8-M5는 accepted gravity predecessor를 보존한 뒤 실제 augmented displacement-control Newton으로 lateral pattern을 재하하고, capacity curve·story/member/hinge 결과와 종료사유를 생성한다.
