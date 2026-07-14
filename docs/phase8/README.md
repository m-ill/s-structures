# Phase 8 Development Hub - 실무용 비선형 3D 골조해석

```yaml
phase: 8
status: active
implementation_status: p8-m8-complete
reviewed_at: 2026-07-14
current_milestone: P8-M9
mission: Phase 7 모델링·탄성해석과 동일한 analysis domain 위에서 상용 수준의 정적·동적 비선형 3D 건축골조해석을 구현한다.
governing_plan: docs/phase8/MILESTONE_EXECUTION_PLAN.md
```

> P8-M0~P8-M8은 완료되었다. canonical domain·state, MDOF 평형/Worker/WASM, objective 3D corotational frame/truss, 상태기반 집중소성 단부힌지, 정식 증강 변위제어 Pushover, fiber PMM/분포소성, PMM 전처리 Worker/cache, Crisfield arc-length·cyclic static과 실제 3D MDOF NLTH가 구현됐다. 기존 stepwise Pushover와 SDOF NLTH는 `legacy-preliminary`로 격리된다. 실제 진행 상태는 [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)를 기준으로 한다.

## 1. 결론

기존 preliminary 모듈은 계속 격리한다. `productionPushover`는 M2 전역 MDOF Newton, M3 corotational 요소, M4 집중소성 힌지, M5 독립 중력·변위제어, M6 fiber PMM/분포소성, M6.1 비동기 전처리와 M7 선택적 arc-length continuation을 사용하는 정식 정적 후보 경로다. `productionNlth`는 같은 요소·상태·중력 선행상태를 모델 질량, Rayleigh 감쇠, 균일 다성분 지진파 및 Newmark full-Newton과 결합하는 동적 후보 경로다.

현재 상태를 정확히 표현하면 다음과 같다.

- legacy Pushover는 각 스텝에서 선형해석을 한 번 수행하고 이전 스텝의 힌지 상태로 다음 스텝 부재 강성을 낮추는 preliminary 방법이며 production 경로와 분리된다.
- legacy 전역 평형 모듈은 고정된 선형 강성으로 `K u`를 계산한다. P8-M2 코어는 별도 경로에서 현재 trial state의 요소 `Pint`와 `Kt`를 반복마다 재조립한다.
- legacy `corotationalBeam.js`는 screening 식이며 격리된다. production 후보는 M3의 `corotationalFrame3d.js`/`corotationalTruss3d.js`다.
- production 변위제어와 arc-length는 각각 실제 전역 증강방정식을 풀며 M5 checkpoint에서 byte-equivalent하게 연속된다. 사용자 UI workflow는 P8-M10 범위다.
- legacy NLTH는 모델을 받지 않는 SDOF 이선형 스프링 적분기다. production NLTH는 모델-bound 3D MDOF 경로이며 두 결과 계약은 섞이지 않는다.
- 기존 비선형 벤치마크 중 일부는 자기참조 또는 미리 만든 경로를 검사하므로 제품 검증 근거가 될 수 없다.

따라서 Phase 8은 기존 파일을 기능별로 덧붙이는 작업이 아니다. **Phase 7 모델을 canonical analysis domain으로 고정하고 상태, 요소 내력, 일관접선, 전역 잔차, 해 제어, 결과 회복을 하나의 production 실행 커널로 다시 묶는 작업**이다.

상세 근거는 [CURRENT_STATE_AUDIT.md](CURRENT_STATE_AUDIT.md)에 기록한다.

## 2. Phase 8의 제품 정의

Phase 8의 최종 제품은 다음 질문에 모두 답할 수 있어야 한다.

1. 어떤 중력하중 상태에서 비선형 해석을 시작했는가?
2. 각 증분과 반복에서 외력, 내력, 잔차, 접선강성은 무엇이었는가?
3. 어떤 요소와 힌지가 어떤 상태변수를 사용했고 언제 commit 되었는가?
4. 스텝 실패 시 상태가 오염되지 않고 rollback 및 cutback 되었는가?
5. 하중제어, 변위제어, arc-length가 실제 전역 방정식을 풀었는가?
6. Pushover 밑면전단-제어점변위 곡선과 힌지 이력이 평형 상태에서 산출되었는가?
7. NLTH의 질량, 감쇠, 지진파, 시간적분, 반복 수렴이 실제 3D 모델과 연결되었는가?
8. 결과가 독립 기준해, 공개 벤치마크 또는 별도 구현과 허용오차 안에서 일치하는가?

이 질문 중 하나라도 실행 기록으로 답할 수 없으면 해당 결과는 `verified`가 아니다.

### 상용 수준의 의미

Phase 8은 ETABS/MIDAS/OpenSees의 전체 기능 수를 복제하는 계획이 아니다. 지원을 선언한 3D frame/truss 건축골조 범위에서 다음 다섯 가지를 모두 만족하는 것을 목표로 한다.

- 수치 정확도와 독립 검증
- 모델링·탄성·비선형 domain의 동일성
- 초기상태부터 결과·보고까지 이어지는 실무 workflow
- sparse/WASM/Worker 기반 대표 건축골조 계산 성능
- 실패·미지원·stale 결과를 정상 설계값으로 전달하지 않는 qualification

정확한 제품 요구사항과 지원경계는 [PRODUCTION_REQUIREMENTS.md](PRODUCTION_REQUIREMENTS.md)를 따른다.

## 3. 제품 범위

### 포함

- 3D frame/truss 해석영역과 6자유도 절점
- 중력 preload와 횡하중을 결합한 기하 및 재료 비선형 정적해석
- 완전한 3D corotational frame 요소와 현재변형 상태 기반 내력/접선
- 부재단 집중소성 M-theta 힌지, 축력 의존 PMM 힌지, 상태 이력
- 강재 H/BOX/PIPE 및 RC 직사각형의 검증 가능한 fiber 단면
- 하중제어, 변위제어, Crisfield 계열 arc-length와 adaptive cutback
- 정식 Pushover capacity curve, 힌지 이벤트, 층응답, 수렴 trace
- 3D MDOF Newmark 계열 NLTH, Rayleigh 감쇠, 균일 지반가속도 입력
- rigid diaphragm, 선형 support spring, release, offset, generated member와의 명시적 호환
- 결과 시각화, 보고서, Analysis Center, agent/MCP용 읽기·실행 계약
- 모델 hash, 입력 snapshot, 엔진 버전, 허용오차와 검증등급을 포함한 재현 기록
- Phase 7 선형·Direct P-Delta·모달/RSA와 공통인 canonical domain 및 case dependency
- Web Worker, WASM sparse backend, checkpoint, chunked result store

### 최초 정식 릴리스에서 제외하거나 명시적으로 차단

- 비선형 shell/plate/solid FEM
- 토질-구조 상호작용과 다지점 지진입력
- 접합부 파단, 저주기 피로, 국부좌굴, 철근 좌굴과 붕괴 후 단절
- 화재, 충돌, 유체-구조 연성
- 검증되지 않은 follower load와 대변형 면적하중
- 자동 성능설계 승인 또는 법적 적합성 판정

제외 기능을 가진 모델은 조용히 선형 대체하지 않는다. 실행 전 validation에서 `unsupported` 또는 `designBlocked`로 차단한다.

## 4. 구현 원칙

1. **평형이 기능의 중심이다.** 모든 정적 스텝은 `R = Pext - Pint`를, 모든 동적 스텝은 유효동적잔차를 실제로 줄여야 한다.
2. **committed와 trial을 분리한다.** 반복 실패가 소성변형, 손상, 에너지를 다음 스텝에 남기면 안 된다.
3. **요소가 내력과 접선을 함께 제공한다.** 전역 조립기가 `K u`를 비선형 내력으로 대신하지 않는다.
4. **제어법은 솔버다.** 목표변위나 arc-length 제약을 계산해 표시하는 것만으로 구현 완료로 보지 않는다.
5. **정적과 동적은 같은 요소 커널을 쓴다.** NLTH 전용 이선형 스칼라 모델을 별도 제품 경로로 유지하지 않는다.
6. **선형 극한을 먼저 통과한다.** 비선형을 끄면 Phase 7 선형 결과와 허용오차 안에서 같아야 한다.
7. **회귀와 검증을 구분한다.** 현재 코드의 결과를 baseline으로 고정하는 것은 회귀검사이며 정확도 검증이 아니다.
8. **지원하지 않는 조합은 fail-closed 한다.** release, offset, diaphragm, unilateral, follower load의 미지원 조합을 근사값으로 통과시키지 않는다.
9. **UI는 solver capability를 넘지 않는다.** 실제 구동되지 않는 control option이나 `formal` 명칭을 노출하지 않는다.
10. **기능별 자격을 따로 부여한다.** Pushover가 검증되어도 fiber NLTH까지 자동으로 `verified`가 되지 않는다.
11. **모델은 하나다.** 모델링·탄성·비선형 solver가 서로 다른 topology, property, constraint, load, mass를 만들지 않는다.
12. **production 계산은 worker와 sparse backend를 쓴다.** 큰 모델을 main thread 또는 dense matrix로 실행하지 않는다.

## 5. 릴리스 단계

| 릴리스 | 마일스톤 | 제공 범위 | 상태 규칙 |
| --- | --- | --- | --- |
| R8.0 Truthful Baseline | P8-M0 | 기존 preliminary 기능 격리, 결과 자격계약 | 기존 기능은 `legacy-preliminary` |
| R8.1 Nonlinear Core | P8-M1~M3 | 상태관리, MDOF 평형, 3D corotational elastic | 독립 검증 전 `candidate` |
| R8.2 Formal Pushover | P8-M4~M5 | 집중소성, 중력 preload, 변위제어 Pushover | 정적 범위만 `candidate` |
| R8.3 Advanced Static | P8-M6~M7 | PMM/fiber, post-peak arc-length, cyclic static | 기능별 검증등급 부여 |
| R8.4 Frame NLTH | P8-M8~M9 | 실제 모델 MDOF NLTH와 통합 결과회복 | M8 component `candidate`, M9 통합·M11 독립검증 전 설계전달 차단 |
| R8.5 Practice Release | P8-M10~M11 | UI, 보고, agent 계약, 독립검증, pilot | 통과한 범위만 `verified` |

## 6. 상태 용어

| 상태 | 의미 |
| --- | --- |
| `legacy-preliminary` | 기존 결과 재현용. 설계 전달 차단 |
| `implemented` | 실행 코드가 존재하나 독립 검증 전 |
| `candidate` | 단위·통합 검증을 통과했으나 독립 비교 또는 pilot 전 |
| `verified` | 지정 범위의 필수 검증과 독립 근거를 모두 통과 |
| `blocked` | 입력, 기능 조합, 수렴 또는 검증 실패로 결과 사용 차단 |
| `unsupported` | 제품 범위 밖이며 근사 대체 없이 실행 거부 |

`ok: true` 또는 예외가 없다는 사실만으로 `verified`를 부여하지 않는다.

## 7. 문서 읽는 순서

1. [PRODUCTION_REQUIREMENTS.md](PRODUCTION_REQUIREMENTS.md) - 상용 수준의 정의, 지원범위, 기능·비기능 요구사항
2. [CURRENT_STATE_AUDIT.md](CURRENT_STATE_AUDIT.md) - 현재 코드가 실제로 하는 일과 위험
3. [MODELING_ELASTIC_INTEGRATION.md](MODELING_ELASTIC_INTEGRATION.md) - Phase 7 모델링·탄성해석과 단일 domain/case 계약
4. [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) - 새 실행 커널과 데이터 계약
5. [PERFORMANCE_AND_SCALABILITY.md](PERFORMANCE_AND_SCALABILITY.md) - Worker/WASM/sparse/result streaming과 성능 budget
6. [MILESTONE_EXECUTION_PLAN.md](MILESTONE_EXECUTION_PLAN.md) - P8-M0부터 P8-M11까지 작업 순서
7. [VERIFICATION_MATRIX.md](VERIFICATION_MATRIX.md) - 검증 ID, 기준해, 허용오차, release gate
8. [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) - 요구사항·마일스톤·코드·검증·증거 추적
9. [REFERENCE_BASIS.md](REFERENCE_BASIS.md) - 공식 기준출처와 benchmark governance
10. [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) - 실제 진행 상태와 증거 링크

기존 [Phase 3 비선형 계획](../phase3/NONLINEAR_ENGINE_PLAN.md)은 역사적 목표와 preliminary trace의 배경 문서로 남긴다. Phase 8 착수 이후 비선형 구현 순서와 완료 판정은 이 디렉터리의 문서가 우선한다.

## 8. Phase 8 완료 조건

- P8-M0~M11의 필수 검증 ID가 모두 증거 artifact를 가진다.
- 모델링·선형·Direct P-Delta·모달/RSA·Pushover·NLTH가 canonical domain의 동일 topology/property/constraint를 사용한다.
- 정적 비선형과 동적 비선형이 같은 요소 상태 및 내력/접선 계약을 사용한다.
- Pushover는 중력 preload 이후 실제 변위제어 전역 평형을 수행한다.
- NLTH는 현재 모델에서 조립한 `M`, `C`, `Pint`, `Kt`를 사용한다.
- 스텝 실패와 cutback에서 committed state가 보존됨을 자동 검증한다.
- rigid-body objectivity, 일관접선 유한차분, 선형극한, 평형, 에너지 검증을 통과한다.
- 자기참조 벤치마크는 qualification evidence에서 제외된다.
- 지원하지 않는 모델 조합은 UI, API, 보고서에서 동일하게 차단된다.
- 대표 강구조 및 RC 골조 pilot에서 모델 작성부터 보고서까지 재현된다.
- production Worker/WASM sparse 경로가 M-tier Pushover/NLTH 시간·메모리·UI responsiveness budget을 통과한다.
- Critical/High 코드리뷰 finding이 0이고 전체 회귀 테스트가 통과한다.
