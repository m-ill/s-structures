# Phase 9 Requirements Traceability

```yaml
version: p9-traceability-v1
status: implementation-complete-qualification-blocked
requirement_source: docs/phase9/PRODUCTION_REQUIREMENTS.md
verification_source: docs/phase9/VERIFICATION_MATRIX.md
```

## 1. 추적 규칙

모든 production requirement는 다음 chain을 가져야 한다.

```text
requirement -> architecture/ADR -> milestone -> code owner
            -> verification ID -> evidence artifact -> release decision
```

한 link라도 없으면 requirement 상태는 `uncovered`다. 구현 코드와 unit test만 존재하면 `implemented`, 실제 qualification evidence까지 있어야 `qualified`다.

## 2. 요구사항군 추적

| Requirement | Architecture | Milestone | Verification | 목표 Evidence |
| --- | --- | --- | --- | --- |
| P9-FR-CORE-01~05 | execution plan, backend, binary contract | M1~M2 | CMP-01~12, CPU-01~10 | contract/domain/sparse artifacts |
| P9-FR-CORE-06~10 | routing, Worker, preflight | M1, M4, M9 | GPU-PLT, API, FAIL | runtime/failure artifacts |
| P9-FR-ELA-01~04 | factor group, multi-RHS | M2~M3 | CPU-07~10, ELA-01~10 | elastic plan/parity artifact |
| P9-FR-ELA-05 | Direct P-Delta tangent | M3, M5 | ELA-11~12, GPU-ELA-11~12 | direct P-Delta parity |
| P9-FR-ELA-06 | sparse eigen operations | M6 | GPU-EIG-01~14 | modal/RSA/buckling artifact |
| P9-FR-ELA-07~08 | design and sync migration | M3, M5, M9 | ELA-07~08, API-04~06 | design/API parity |
| P9-FR-NL-01~04 | batch/state/assembly | M7 | GPU-NL-01~10 | nonlinear component artifact |
| P9-FR-NL-05~08 | resident Pushover/NLTH | M8 | GPU-NL-11~24, FAIL-05~10 | nonlinear end-to-end artifact |
| P9-FR-PLT-01~04 | UI capability/preflight/result | M9 | UI-01~08 | UI workflow artifact |
| P9-FR-PLT-05~08 | Agent, loss, policy snapshot | M9~M10 | UI-09~12, API-07~14 | Agent/report artifact |
| P9-NFR-01~03 | precision/determinism | M4~M8 | GPU-NUM, GPU-ELA, GPU-NL | numerical parity artifacts |
| P9-NFR-04~10 | UX, failure, performance | M0, M4~M10 | PERF, FAIL | hardware performance artifacts |
| P9-NFR-11~15 | no dense/fallback, schema, license/privacy | M1~M10 | CPU, REF, REL | governance/release artifact |
| P9-REF-01~04 | common sparse/orchestrator/hot loop | M1~M7 | REF-01~09 | refactor review artifacts |
| P9-REF-05~08 | sync/legacy/schema/dead export | M3, M9~M10 | REF-10~12, API | cleanup inventory |
| P9-REF-09~12 | commit/evidence/review hygiene | every milestone | REF-13~14, REL-07~12 | milestone review/manifest |

표의 verification prefix `CMP`는 실제 ID `P9-CMP-*`를 의미한다.

## 3. 마일스톤 산출물 추적

| Milestone | 필수 코드/계약 | 필수 Evidence | 상태문서 |
| --- | --- | --- | --- |
| P9-M0 | fixture, profiler, debt registry | p9-m0-baseline, p9-m0-review | implementation status |
| P9-M1 | binary/backend/plan/Worker contracts | p9-m1-compute-contract, review | architecture/ADR |
| P9-M2 | shared sparse and CPU/WASM runtime | p9-m2-cpu-wasm, review | precision/performance |
| P9-M3 | elastic plan/factor/multi-RHS | p9-m3-elastic-runtime, review | migration/status |
| P9-M4 | WebGPU platform and kernels | p9-m4-webgpu-foundation, review | GPU ADR/status |
| P9-M5 | hybrid elastic/P-Delta | p9-m5-hybrid-elastic, review | qualification/status |
| P9-M6 | sparse modal/RSA/buckling | p9-m6-eigen-dynamics, review | verification/status |
| P9-M7 | nonlinear SoA/GPU state | p9-m7-nonlinear-batch, review | migration/status |
| P9-M8 | hybrid Pushover/NLTH | p9-m8-hybrid-nonlinear, review | qualification/status |
| P9-M9 | shared product service, UI/API/report/Agent | p9-m9-product-workflow, p9-m9-code-review | P9_M9_PRODUCT_WORKFLOW/status |
| P9-M10 | qualification gate and cleanup | p9-m10-release-gate, p9-m10-final-debt, final review | P9_M10_RELEASE_GATE/final status |

실제 evidence filename에는 source revision과 artifact hash가 포함될 수 있다. generator와 registry가 canonical path를 관리한다.

## 4. Architecture Decision Record

| ADR | 결정 | 관련 Requirement | 검증 |
| --- | --- | --- | --- |
| [ADR-001](adr/ADR-001-HYBRID-CPU-WASM-WEBGPU.md) | CPU/WASM f64 + operation-routed WebGPU hybrid | CORE, NFR-01~03 | CMP, GPU-NUM/ELA/NL |
| [ADR-002](adr/ADR-002-MIXED-PRECISION-AND-DETERMINISM.md) | f64 canonical, correction과 determinism | NFR-01~03, NL-08 | GPU-NUM/ELA/NL/DET |
| [ADR-003](adr/ADR-003-EXTENSIBLE-BACKEND-AND-FAIL-CLOSED.md) | extensible backend와 no silent fallback | CORE-04~10, PLT-01~08 | GPU-PLT, FAIL, API |
| [Phase 8 ADR-005](../phase8/adr/ADR-005-INHOUSE-WASM-SPARSE.md) | in-house CPU/WASM sparse baseline | CORE-03, NFR-13 | CPU, LIC |
| [Phase 8 ADR-008](../phase8/adr/ADR-008-NEWMARK-DAMPING-SUBSTEP-POLICY.md) | NLTH state/backend policy | NL-01~08 | GPU-NL, FAIL |

새 native backend, 외부 library, f32-only production 또는 general GPU solver는 새 ADR 없이는 scope에 추가할 수 없다.

## 5. 코드 ownership 목표

| Concern | 현재 owner | 목표 owner | Migration |
| --- | --- | --- | --- |
| elastic orchestration | `src/solver/linear3d.js` | solver/elastic modules | M3 |
| sparse schema/ops | `src/solver/sparse/`, nonlinear typed sparse | compute/sparse | M1~M2 |
| backend policy | nonlinear reference backend policy | compute execution-plan/backend registry | M1 |
| CPU/WASM solver | Phase 8 WASM backend | compute/backends/wasm-cpu | M2 |
| GPU platform | 없음 | compute/backends/webgpu | M4 |
| Worker protocol | nonlinear runtime + UI paths | compute/runtime | M1~M3 |
| modal/buckling eigen | dynamics modules 내부 | compute/eigen + solver recovery | M6 |
| nonlinear batch state | object element assembler | nonlinear batch adapters + compute state arena | M7 |
| product run/result | elastic/nonlinear 개별 bridge | shared analysis product service | M9 |

목표 owner 표기는 계획상 module boundary이며 실제 파일 생성 전 구현 완료를 의미하지 않는다.

## 6. Requirement 상태

| 상태 | 정의 |
| --- | --- |
| proposed | 요구사항만 승인 대기 |
| planned | 마일스톤·검증·owner 연결 완료 |
| implemented | 코드와 unit/contract test 존재 |
| integrated | 실제 analysis/product path에서 사용 |
| qualified | 필수 evidence와 hardware/reference gate 통과 |
| blocked | 필수 근거·환경·기능 미충족 |
| rejected | ADR로 범위에서 제외 |

현재 모든 Phase 9 requirement는 `planned`, compute qualification은 G0다.

## 7. Evidence registry 요구사항

registry row 필수항목:

```text
verificationId
requirementIds
milestone
testCommand
artifactPath
artifactHash
sourceRevision
environmentProfile
status
blockerCode
qualificationImpact
```

동일 verification ID에 여러 hardware profile이 필요한 경우 profile별 row를 가진다. 하나의 PASS가 전체 profile을 대표하지 않는다.

## 8. Code review 추적

각 마일스톤 review는 다음을 포함한다.

- correctness/security/performance finding
- precision·fallback·state ownership 검토
- architecture dependency와 duplicate implementation
- public API/Agent/report 영향
- test gap과 residual risk
- open Critical/High count
- closed finding resolution과 commit

review 문서만 존재하고 finding이 해결되지 않으면 완료가 아니다.

## 9. 변경관리

다음 변경은 최소 네 문서를 같이 갱신한다.

| 변경 | 필수 갱신 |
| --- | --- |
| Requirement 추가/삭제 | requirements, milestones, verification, traceability |
| backend capability 변경 | architecture, precision, ADR, verification |
| tolerance 변경 | precision, verification, reference basis, ADR |
| milestone scope 변경 | README, milestone plan, traceability, status |
| public API 변경 | migration, traceability, Agent/user docs |
| legacy 제거 | refactoring, status, release evidence, user docs |
| hardware 지원 변경 | performance, risk, verification, release manifest |

## 10. 최종 coverage gate

P9-M10에서 자동으로 확인한다.

- 필수 requirement의 owner/milestone/verification/evidence 누락 0
- verification artifact hash 불일치 0
- approved hardware profile 누락 0
- open Critical/High finding 0
- owner 없는 debt와 expired compatibility 0
- unapproved external dependency 0
- status/manifest/user/Agent 문서 불일치 0
- Phase 8 qualification의 암묵 승격 0

coverage 도구가 읽지 못하는 자유형 문장만으로 완료를 주장할 수 없다.
