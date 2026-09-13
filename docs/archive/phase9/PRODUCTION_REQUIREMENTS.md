# Phase 9 Production Requirements

```yaml
version: p9-requirements-v1
status: planned
reviewed_at: 2026-07-15
```

## 1. 제품 목표

지원 범위의 탄성설계와 비선형해석에서 CPU/WASM `f64` 기준결과를 보존하면서, 사용 가능한 장치와 workload에 따라 검증된 GPU operation을 선택적으로 사용한다. 새 backend가 추가되어도 모델링, 해석 case, 결과, 보고서와 Agent/MCP 계약은 변하지 않아야 한다.

## 2. 지원 계산범위

### P9-S1 필수 범위

- 선형 정적 3D frame/truss와 다중 하중조합
- Direct P-Delta의 SPD 또는 qualification된 matrix class
- modal/RSA의 저차 모드 추출
- 탄성좌굴의 지원된 symmetric eigen 경로
- 강재·RC 부재설계 batch와 envelope reduction
- PMM/fiber 전처리와 element response batch
- concentrated-plasticity Pushover
- 3D MDOF NLTH의 지원 요소·matrix class
- CPU-only, WebGPU unavailable, device-loss 환경

### P9-S2 확장 범위

- native GPU 또는 remote compute backend
- multi-GPU, shared memory WASM threads
- GPU preconditioner 선택과 advanced sparse eigensolver
- distributed fiber NLTH의 장기 이력 최적화

S2는 S1 interface를 바꾸지 않고 backend plugin으로 추가돼야 한다.

## 3. 공통 기능 요구사항

| ID | 요구사항 |
| --- | --- |
| P9-FR-CORE-01 | 모든 production 해석은 versioned `AnalysisExecutionPlan`을 생성한다. |
| P9-FR-CORE-02 | plan은 operation별 backend, precision, memory, qualification과 선택근거를 기록한다. |
| P9-FR-CORE-03 | CPU/WASM `f64` 경로는 GPU 유무와 무관하게 항상 실행 가능해야 한다. |
| P9-FR-CORE-04 | backend는 capability query, preflight, session, execute, cancel, dispose 계약을 구현한다. |
| P9-FR-CORE-05 | domain/pattern/state/result buffer는 schema version과 content hash를 가진다. |
| P9-FR-CORE-06 | 명시 `gpu` 요청은 GPU 미가용 시 실패하며 silent fallback하지 않는다. |
| P9-FR-CORE-07 | `auto` routing은 qualification된 operation만 선택하고 실제 route를 결과에 기록한다. |
| P9-FR-CORE-08 | 모든 실행은 Worker job lifecycle과 동일한 progress/cancel/restart 계약을 사용한다. |
| P9-FR-CORE-09 | backend/device 변경은 기존 result를 stale로 만들지 않고 해당 run provenance로 고정한다. |
| P9-FR-CORE-10 | unsupported precision, matrix class, memory 또는 device limit는 실행 전에 차단한다. |

## 4. 탄성·설계 요구사항

| ID | 요구사항 |
| --- | --- |
| P9-FR-ELA-01 | 탄성 stiffness pattern과 numeric values를 load vector와 분리한다. |
| P9-FR-ELA-02 | 동일 stiffness를 공유하는 조합은 symbolic analysis와 numeric factorization을 재사용한다. |
| P9-FR-ELA-03 | 여러 load combination을 multi-RHS 또는 검증된 batched solve로 처리한다. |
| P9-FR-ELA-04 | support settlement, unilateral active set, staged property처럼 stiffness가 달라지는 case는 별도 factor group으로 분리한다. |
| P9-FR-ELA-05 | Direct P-Delta는 각 tangent 변경을 명시하고 잘못된 factor 재사용을 금지한다. |
| P9-FR-ELA-06 | modal/RSA/buckling은 dense full-matrix 생성을 피하는 sparse operation 계약을 제공한다. |
| P9-FR-ELA-07 | 부재설계·envelope 가속은 formula trace, governing case와 상태를 CPU 기준과 동일하게 보존한다. |
| P9-FR-ELA-08 | 기존 sync API는 deprecation 기간 동안 small-model compatibility facade만 제공한다. |

## 5. 비선형 요구사항

| ID | 요구사항 |
| --- | --- |
| P9-FR-NL-01 | element/fiber batch는 committed state를 읽고 별도 trial state를 출력한다. |
| P9-FR-NL-02 | rejected iteration은 GPU/CPU buffer 어느 쪽에도 committed mutation을 남기지 않는다. |
| P9-FR-NL-03 | tangent assembly의 reduction order와 duplicate scatter 처리를 명시한다. |
| P9-FR-NL-04 | GPU state는 domain·source·case hash와 결속되고 변경 시 폐기한다. |
| P9-FR-NL-05 | Pushover/NLTH는 반복마다 불필요한 host-device round trip을 만들지 않는다. |
| P9-FR-NL-06 | softening, release, arc-length 또는 general matrix가 미지원이면 CPU route 또는 명시 차단한다. |
| P9-FR-NL-07 | checkpoint는 backend 독립 canonical state로 serialize되어 CPU에서 복구 가능해야 한다. |
| P9-FR-NL-08 | hinge/fiber event, energy와 convergence history가 CPU 기준과 허용오차·정규화 규칙 안에서 일치해야 한다. |

## 6. 플랫폼·사용자 요구사항

| ID | 요구사항 |
| --- | --- |
| P9-FR-PLT-01 | UI는 `자동`, `CPU 정밀`, `GPU 가속`의 의미와 현재 지원상태를 표시한다. |
| P9-FR-PLT-02 | 사용할 수 없는 GPU control은 비활성화하고 reason code와 조치방법을 제공한다. |
| P9-FR-PLT-03 | 사전검사는 adapter, limits, 예상 buffer, precision, matrix class와 workload threshold를 표시한다. |
| P9-FR-PLT-04 | 결과 팝업과 보고서는 operation별 backend와 correction/audit 결과를 표시한다. |
| P9-FR-PLT-05 | Agent/MCP는 UI와 동일한 capability, run, status, cancel, result 계약을 사용한다. |
| P9-FR-PLT-06 | device loss와 fallback 불가 상황을 일반 수렴실패와 구분한다. |
| P9-FR-PLT-07 | 사용자가 선택한 backend 정책은 project가 아니라 analysis case/run에 snapshot한다. |
| P9-FR-PLT-08 | GPU가 성능상 불리한 small workload에서는 `auto`가 CPU를 선택하고 근거를 보여준다. |

## 7. 비기능 요구사항

| ID | 요구사항 |
| --- | --- |
| P9-NFR-01 | 최종 설계 가능 결과는 CPU `f64` residual과 기존 평형 허용기준을 통과한다. |
| P9-NFR-02 | 같은 backend/device/driver/build에서 결과와 event order는 정의된 결정성 규칙을 만족한다. |
| P9-NFR-03 | 다른 GPU vendor 결과는 bitwise가 아니라 channel별 수치 tolerance로 비교한다. |
| P9-NFR-04 | M-tier 실행 중 main-thread input acknowledgement p95는 100 ms 이하를 유지한다. |
| P9-NFR-05 | cancel acknowledgement는 2초 이하이며 uncommitted state를 폐기한다. |
| P9-NFR-06 | GPU device loss 후 model은 불변이고 마지막 canonical checkpoint로 CPU 재실행할 수 있다. |
| P9-NFR-07 | memory preflight는 adapter limit와 browser process budget 중 작은 값을 사용한다. |
| P9-NFR-08 | GPU resource는 run 종료·취소·실패에서 명시적으로 해제된다. |
| P9-NFR-09 | kernel timing과 end-to-end timing을 분리하고 speedup 주장은 후자에 기반한다. |
| P9-NFR-10 | reference hardware별 1 warm-up + 5 measured run의 median/p95/peak memory를 기록한다. |
| P9-NFR-11 | production 경로는 dense global matrix 또는 main-thread fallback을 만들지 않는다. |
| P9-NFR-12 | binary contract는 backward migration 또는 명시적 incompatible version 오류를 제공한다. |
| P9-NFR-13 | 외부 수치 library 도입은 license inventory, ADR와 사용자 승인을 필요로 한다. |
| P9-NFR-14 | telemetry는 기본 로컬이며 사용자 승인 없이 외부 전송하지 않는다. |
| P9-NFR-15 | no-GPU 환경은 기능저하가 아니라 지원되는 CPU production 환경이다. |

## 8. 리팩토링·코드 클리닝 요구사항

| ID | 요구사항 |
| --- | --- |
| P9-REF-01 | sparse format·matvec·diagnostics의 공통 owner를 `src/compute`로 단일화한다. |
| P9-REF-02 | 탄성·비선형 solver가 backend capability와 preflight 구현을 공유한다. |
| P9-REF-03 | `linear3d.js`의 validation, case planning, solve, dynamics, design orchestration을 분리한다. |
| P9-REF-04 | element inner loop에서 반복 object clone·temporary matrix allocation을 제거한다. |
| P9-REF-05 | sync API compatibility는 owner, expiry milestone과 사용처 목록을 가진다. |
| P9-REF-06 | legacy engine은 production registry와 UI route에서 격리하고 제거조건을 문서화한다. |
| P9-REF-07 | 새 backend는 별도 analysis result schema를 만들 수 없다. |
| P9-REF-08 | dead export, 미사용 adapter와 중복 helper는 coverage 확인 후 제거한다. |
| P9-REF-09 | 파일 이동은 behavior parity commit과 기능변경 commit을 분리한다. |
| P9-REF-10 | 생성 evidence와 binary build는 source revision·tool version·hash를 기록한다. |
| P9-REF-11 | 각 마일스톤 종료 시 dependency cycle, public export, stale documentation을 검사한다. |
| P9-REF-12 | 코드리뷰에서 열린 Critical/High finding이 있으면 다음 기능 마일스톤으로 진행하지 않는다. |

## 9. Compute qualification 등급

| 등급 | 의미 |
| --- | --- |
| G0 Baseline | GPU 미구현. CPU/WASM 기준과 workload만 고정 |
| G1 Contract-Integrated | 공통 backend/data/job 계약과 CPU parity 통과 |
| G2 Kernel-Qualified | 독립 GPU kernel이 CPU 기준과 일치하지만 해석결과 미제공 |
| G3 Elastic-Candidate | 지원 탄성 operation이 parity·failure gate 통과 |
| G4 Nonlinear-Candidate | 지원 Pushover/NLTH operation이 state·energy·event gate 통과 |
| G5 Production-Qualified | 필수 hardware/browser matrix와 end-to-end budget 통과 |

Compute 등급은 Phase 8의 해석 qualification을 대체하지 않는다. 해석기능과 compute backend가 각각 필요한 등급을 만족해야 설계전달이 가능하다.

## 10. 최종 release gate

- 모든 P9-S1 requirement가 traceability에서 `covered`다.
- CPU-only full regression과 CPU/WASM parity가 통과한다.
- GPU 사용·미사용 결과의 equilibrium, design status, event와 report가 일치한다.
- 필수 hardware/browser profile의 성능·device-loss·OOM 시험이 통과한다.
- public API와 Agent contract migration이 완료된다.
- legacy/debt removal 목록에 owner 없는 항목이 없다.
- Critical/High review finding이 0이다.
- release manifest가 실제 evidence hash를 검증하며 누락을 PASS로 취급하지 않는다.
