# Phase 8 Current-State Audit

```yaml
reviewed_at: 2026-07-11
implementation_addendum: P8-M7 completed 2026-07-13; findings below describe the pre-Phase-8 legacy path unless marked resolved
scope:
  - src/nonlinear
  - src/ui/analysisRunners.js
  - src/ui/indexAnalysisCenter.js
  - src/verification/nonlinearBenchmarks.js
  - tests/p3-m14..m16
  - tests/p5 nonlinear workflows
verdict: preliminary-components-exist-but-production-nonlinear-kernel-does-not
```

> 이 문서는 Phase 8 착수 전 legacy 경로의 기준 감사다. P8-M1~M8은 별도 production domain/state/equilibrium/corotational/hinge/fiber/Pushover/arc-cyclic/MDOF-NLTH 경로를 구현했다. 전역 변위제어와 arc-length 부재 지적은 `src/nonlinear/equilibrium/displacementControl.js`, `arcLength.js`, `cyclicStatic.js`에서, scalar NLTH 지적은 `src/nonlinear/dynamics/productionNlth.js`와 `mdofNewmark.js`에서 해결되었다. legacy `src/nonlinear/control/*`와 `src/nonlinear/dynamics/newmark.js`의 한계를 production 구현 상태로 해석하면 안 된다. 전체 Phase 7 모델 기능 통합, UI와 독립 상용 비교 지적은 아직 유효하다.

## 1. 감사 방법

파일명이나 문서의 완료 표시를 기준으로 삼지 않고 다음 실행 경로를 직접 대조했다.

1. Analysis Center가 받는 설정
2. `analysisRunners`가 실제 호출하는 함수
3. 각 스텝/반복에서 조립되는 외력, 내력, 접선
4. 요소 및 힌지 상태의 trial/commit/rollback
5. 결과회복과 qualification 상태
6. 테스트가 비교하는 독립 기준값

이 기준으로 보면 현재 비선형 코드는 유용한 prototype과 UI trace를 다수 포함하지만 정식 전역 비선형 해석기는 아니다.

## 2. 우선순위별 발견사항

| 우선순위 | 발견사항 | 근거 | 영향 |
| --- | --- | --- | --- |
| Critical | 전역 MDOF 비선형 평형 루프가 없다 | `control/globalEquilibrium.js:8,24`는 반복 전에 조립한 고정 `K`로 `K u`를 계산 | 재료·기하 상태가 바뀌어도 내력과 접선이 갱신되지 않음 |
| Critical | NLTH가 구조모델을 사용하지 않는다 | `ui/analysisRunners.js:337-338`의 `_model`, 기본 `mass=1`, `stiffness=100` | 화면의 3D 골조와 NLTH 결과가 무관함 |
| Critical | qualification 벤치마크가 독립 검증이 아니다 | `verification/nonlinearBenchmarks.js:62-82,128-150` | 테스트 통과를 정확도 근거로 오인할 수 있음 |
| High | Pushover는 이전 스텝 강성저감 후 선형해석 1회 방식이다 | `nonlinear/pushover.js:41-83,103-110` | 현재 스텝 힌지 발생 후 같은 스텝에서 평형을 다시 맞추지 않음 |
| High | 상태에 committed/trial 구분이 없다 | `nonlinear/state.js` | 실패 반복과 cutback에서 소성상태 rollback을 보장할 수 없음 |
| High | 변위제어와 arc-length가 전역 솔버를 구동하지 않는다 | `control/displacementControl.js`, `control/arcLength.js` | post-peak 경로와 snap-through를 실제 해석할 수 없음 |
| High | corotational 요소가 완전한 3D 요소가 아니다 | `elements/corotationalBeam.js` 전체 45줄 | 강체회전 객관성, 자연변형, 일관접선, 내력 회복 불가 |
| Resolved in M6 | legacy PMM/fiber 모델이 실무 단면을 대표하지 못한다 | legacy `hinges/pmmHinge.js`, `fiber/fiberSection.js`; production `fiber/sectionMesh.js`, `sectionResponse.js`, `pmmSurface.js` | legacy는 preliminary로 유지하고 production은 Phase 7 source 기반 `N-My-Mz`/PMM 경로 사용 |
| High | 힌지 배정이 축과 부재 조건을 충분히 반영하지 않는다 | `hinges/hingeAssign.js:71-86` | 강축/약축, 전단경간, 부재길이, 상세조건이 소성회전에 반영되지 않음 |
| High | solver별 analysis domain이 통합되어 있지 않다 | `linear3dAssembly.js`, `pdelta/analysisDomain.js`, `modalDiaphragm.js`가 별도 전개 | 선형과 비선형이 서로 다른 diaphragm/generated/load domain을 해석할 위험 |
| High | analysis case가 engine/formulation/initial-state를 표현하지 못한다 | `core/analysisCase.js:3-11,38-75` | legacy와 production Pushover/NLTH를 같은 kind로 구분하기 어려움 |
| High | run-record 검증이 Phase 7 evidence prefix에 묶여 있다 | `core/analysisRunRecord.js:119-150` | Phase 8 evidence를 안전하게 일반화할 registry가 필요 |
| High | production runtime path가 없다 | 현재 nonlinear 모듈은 JS object/array와 동기 호출 중심 | 대표 골조 Pushover/NLTH에서 UI 정지와 메모리 폭증 위험 |
| Medium | 스펙트럼 스케일링 명칭이 실제 기능보다 넓다 | `dynamics/groundMotion.js:50-67` | 실제로는 PGA 배율인데 spectrum matching처럼 해석될 수 있음 |
| Medium | UI에 실제로 작동하지 않는 제어 옵션이 보인다 | `ui/indexAnalysisCenter.js:729-732` | 사용자는 displacement/arc-length를 선택하면 해당 솔버가 동작한다고 기대함 |
| Medium | 기존 선형 도메인 기능과 비선형 지원범위가 일치하지 않는다 | diaphragm/release/offset/generated member 경로가 새 전역 솔버에 통합되지 않음 | 같은 모델이 선형에서는 실행되고 비선형에서는 조용히 다른 모델이 될 위험 |

## 2.1 모델링·탄성해석 연계 감사

### 이미 갖춘 기반

- `modelFactory.js`는 schema v4 모델에 units, stories, diaphragms, materials, sections, loads, combinations, mass sources, analysis cases를 함께 보존한다.
- material/section schema는 elastic property와 source provenance를 가진다.
- load case metadata와 mass source는 physical source와 deduplication trace를 가진다.
- 모델 transaction은 analysis case를 stale 처리한다.
- analysis run record는 model snapshot, solver, convergence, materials, sections, combination을 보존하고 verified-only design transfer를 차단한다.
- Phase 7의 result popup과 selection store는 case/result 전환의 기반이 된다.

### production 전에 해결할 계약

- material의 nonlinear 정보가 단순 backbone point 수준이라 state model, units, calibration, source를 표현하지 못한다.
- section schema에 fiber layout, RC reinforcement snapshot, integration profile이 없다.
- analysis case에 `engineId`, geometry/material formulation, predecessor run record, output policy가 없다.
- P-Delta domain만 advanced load와 generated member를 전개하며 linear/modal과 완전히 같은 canonical builder를 사용하지 않는다.
- result dimension에 velocity, curvature, strain, stress, energy가 없다.
- model hash가 하나라 topology/property/load/mass 변경의 부분 cache invalidation을 할 수 없다.
- Phase 7 run-record evidence 판정이 `p7-` version prefix를 직접 검사한다.
- 현재 Pushover/NLTH는 production worker, typed sparse matrix, chunked history 저장을 사용하지 않는다.

따라서 Phase 8은 nonlinear solver 내부만 교체해서 끝낼 수 없다. model schema v5, canonical analysis domain, analysis-case dependency DAG, run-record v2, runtime worker를 함께 구현해야 한다.

## 3. Pushover 실행 경로

현재 `runPushover`의 핵심 흐름은 다음과 같다.

```text
step n 시작
  -> step n-1의 hinge state로 부재 전체 Iy/Iz/J 저감
  -> 횡하중 생성
  -> 선형 analyzeAll 1회
  -> 부재단 moment / My 비율로 hinge state 판정
  -> 결과 저장
step n+1
```

### 가능한 것

- 균등/삼각형 횡하중 패턴과 `+/-X`, `+/-Y`
- 스텝별 밑면전단과 제어점변위 곡선
- 단부 모멘트 비율 기반 `elastic/yielded/ultimate` 상태 표시
- 이전 스텝 상태에 따른 할선강성 저감
- UI capacity curve와 힌지 이벤트 trace

### 불가능한 것

- 현재 증분에서 새 힌지가 발생한 뒤 내력과 접선을 갱신해 다시 평형을 맞추는 것
- 실제 hinge spring 변형과 부재 탄성변형의 직렬 호환
- 중력 preload 상태의 보존과 횡하중 중 기하강성 갱신
- 변위제어의 augmented equation
- limit point 이후 경로추적
- 스텝 실패 시 상태 rollback

`pushoverFormal.js`는 이 preliminary 실행을 감싸며 성공 스텝의 반복 수를 `1`로 기록한다. 이름이 `formal`이지만 별도의 정식 평형 솔버는 아니다. Phase 8에서는 이 경로를 `runLegacyPreliminaryPushover`로 명시적으로 격리해야 한다.

## 4. 기하비선형과 접선 조립

### `assembly.js`

- 선형 `assembleStiffness3D` 결과를 시작점으로 사용한다.
- 축력은 현재 trial displacement에서 요소 내력으로 계산하지 않고 외부 `options.axialForces` 또는 member 필드에서 받는다.
- 기하강성은 제한된 횡방향 2x2 항을 더한다.
- 힌지는 한 개 회전 대각항을 바꾸는 방식이며 요소 내력, 결합항, 정적응축을 함께 갱신하지 않는다.
- 파일 자체가 global nonlinear equilibrium 미수행을 limitation으로 명시한다.

### `corotationalBeam.js`

- 변형 후 chord의 방향벡터 `e1` 계산
- `N/L` 형식 2x2 geometric stiffness trace
- 캔틸레버 대변위 screening 식

완전한 3D corotational frame에 필요한 다음 항목은 없다.

- 회전 자유도의 유한회전 표현과 local triad 갱신
- 강체운동을 제거한 natural deformation
- local basic force와 material/geometric tangent
- global resisting force와 consistent transformation tangent
- 강체회전 objectivity 검증
- release/offset과 결합된 응답

Phase 7의 Direct P-Delta는 `Kt = Ke + Kg(N)`를 반복 갱신하고 평형 audit을 수행하므로 유용한 참조다. 다만 Picard 기반 2차 탄성해석이며 stateful material element나 Newton 잔차 커널로 그대로 확장할 수는 없다.

## 5. 해 제어와 상태관리

### 현재 제어 모듈

| 모듈 | 실제 구현 | 부족한 핵심 |
| --- | --- | --- |
| `newtonRaphson.js` | 1변수 scalar residual/tangent와 line search | 벡터 DOF, 행렬 접선, 요소상태 |
| `globalEquilibrium.js` | reduced DOF 반복 trace | 반복별 재조립, 비선형 `Pint`, trial state |
| `loadControl.js` | scalar lambda 스텝과 1회 split retry | MDOF 하중제어, 상태 rollback |
| `displacementControl.js` | `dLambda=(target-current)/influence` 기록 | augmented global solve |
| `arcLength.js` | 주어진 경로의 Crisfield 구면제약 검사 | predictor/corrector, branch selection, path solve |
| `convergence.js` | 힘/변위/에너지 norm utility | 하중 scale, zero-load floor, absolute+relative 복합기준 |

### 상태 계약의 문제

현재 `state.js`는 `step`, `lambda`, `u`, `hinges`, `events`를 복사할 수 있지만 다음을 가지지 않는다.

- committed state와 iteration별 trial state
- 요소별 재료/힌지/fiber history variable
- 현재 내력과 접선 산출에 사용한 kinematic state
- 속도, 가속도, 감쇠 및 동적 에너지
- 실패 스텝 rollback transaction
- checkpoint/restart와 deterministic hash

Phase 8의 첫 기술 마일스톤은 솔버보다 이 상태 계약을 먼저 고정해야 한다.

## 6. 소성힌지와 fiber 단면

### M-theta 힌지

`momentHinge.js`의 A-B-C-D-E backbone 평가와 구간접선은 component prototype으로 재사용할 수 있다. 다만 unloading은 문자열 metadata일 뿐 실제 반전 이력, 잔류회전, pinching, 강도·강성 저하가 없다.

### 자동 힌지 배정

현재 자동배정은 재료와 단면의 강도를 이용해 i/j 단부 힌지를 만든다. 그러나:

- 최대 `Z` 값을 사용해 축별 강축/약축 특성을 흐릴 수 있다.
- 기본 `thetaY`가 실제 부재길이와 전단경간에 기반하지 않는다.
- RC/steel 상세, 축력, 전단, 접합부, panel zone을 반영하지 않는다.
- 사용자가 선택한 기준·부재종류·회전 정의와 acceptance level을 추적하지 않는다.

### PMM

보간 알고리즘은 존재하지만 기본 `My=120/100/65` 값이 하드코딩되어 있다. member 기반 생성도 단순 선형 감소식이며 실제 `P-My-Mz` 상호작용면이나 단면 fiber 적분 결과가 아니다.

### Fiber

- RC 직사각형은 콘크리트 strip과 기본 철근 4개를 적분한다.
- steel H는 상플랜지/웹/하플랜지 3개 fiber만 사용한다.
- 변형률장은 `epsilon0 - kappa*y`인 단축 휨만 지원한다.
- 목표 축력에 맞추는 축변형률 평형해가 없다.
- 재료모델은 단순 backbone이며 cover/core, confinement, concrete crushing/tension, cyclic steel history가 없다.
- 길이와 응력의 크기로 단위를 추정하는 heuristic이 있어 단위계약에 부적합하다.

`momentCurvature.js`는 기본 곡률 5점 sweep이며 최대 모멘트를 `yieldMoment`로 기록한다. 기준 축력에서의 실제 항복점이나 mesh convergence를 검증하지 않는다.

## 7. NLTH 실행 경로

`runNewmarkNlth`는 SDOF 평균가속도 Newmark와 스텝 내 scalar Newton을 구현한다. 이선형 spring, 에너지 trace, 발산 감지는 학습용 component로 유용하다.

제품 경로의 치명적 제한은 다음과 같다.

- `analysisRunners.nlth(_model, settings)`가 모델을 버린다.
- 질량, 강성, 감쇠가 스칼라 입력이며 기본값은 각각 `1`, `100`, `0`이다.
- 3D 모델의 질량행렬, 영향벡터, 요소 내력, 접선과 연결되지 않는다.
- Rayleigh 계수는 계산되지만 MDOF `C = alpha M + beta K`로 조립되지 않는다.
- 비수렴 스텝에서도 계산 중인 상태를 대입한 뒤 warning만 남기므로 정식 rollback이 없다.
- 자동 substep은 권고만 하고 실제 재적분하지 않는다.

따라서 현재 NLTH 결과는 이름을 `SDOF nonlinear oscillator trace`로 제한해야 하며 frame NLTH로 보고하거나 설계 전달해서는 안 된다.

## 8. UI와 API

### 잘된 점

- Analysis Center 설명은 Pushover와 NLTH가 preliminary임을 일부 명시한다.
- capacity curve, time-history, hinge 상태를 표시하는 결과 UI 자산이 있다.
- agent API와 run record 구조가 있어 향후 자동화 계약의 기반이 된다.

### 수정이 필요한 점

- Pushover control 목록에 `load-factor`, `displacement`, `arcLength`가 모두 보이지만 뒤의 두 값은 solver control intent로만 저장된다.
- `summarizeAnalysisResult`는 Pushover의 `ok`와 NLTH의 `converged`를 중심으로 요약하므로 qualification을 별도 필수 필드로 만들 필요가 있다.
- 기존 `runPushover`와 `runNewmarkNlth`가 일반 제품 runner에 직접 연결되어 있다.
- UI 결과는 `engine`, `algorithm`, `modelBound`, `qualification`, `designBlocked`를 항상 표시해야 한다.

Phase 8 M0에서 기능을 삭제할 필요는 없다. 대신 legacy case type을 분리하고 정식 case type은 새 엔진 gate가 열릴 때까지 만들 수 없게 해야 한다.

## 9. 기존 검증체계의 한계

현재 테스트는 prototype의 회귀와 contract 유지에는 가치가 있다. 그러나 다음 사례는 qualification 증거가 아니다.

| 기존 benchmark | 현재 비교 | 문제 |
| --- | --- | --- |
| B1 Euler buckling | 이론식으로 만든 축력을 함수에 다시 넣고 같은 축력 비교 | 요소 고유치나 비선형 경로를 풀지 않음 |
| B2 cantilever | screening 식과 같은 형태의 scalar 방정식 | 3D corotational 요소를 사용하지 않음 |
| B3 snap-through | 하드코딩한 `du,dLambda` 경로의 제약 만족 검사 | arc-length가 경로를 찾지 않음 |
| B4 plastic mechanism | 단일 힌지 상태가 yielded인지 검사 | frame mechanism과 전역 평형을 풀지 않음 |
| B5 Pushover regression | 현재 preliminary 결과를 frozen baseline과 비교 | 회귀검사이며 정확도 검증이 아님 |
| B6 moment-curvature | 계산한 `yieldMoment`를 기대값으로 다시 전달 | 자기참조 |
| B7 nonlinear THA | SDOF가 한 번 yielded인지 검사 | 응답 정확도, 에너지, 수렴 검증이 아님 |
| B8 linear compatibility | 두 SDOF 구현의 peak displacement 비교 | MDOF frame 동적 검증이 아님 |

기존 테스트는 `legacy regression` suite로 유지하되 Phase 8 release gate의 분모에서 제외한다.

## 10. 재사용 가능한 자산

| 자산 | 재사용 방식 |
| --- | --- |
| Phase 7 model schema와 section/material registry | immutable nonlinear analysis domain 입력으로 사용 |
| `linear3dElement.js`의 축, 변환, 선형 강성 | 선형 극한 reference 및 공통 수학 utility로 사용 |
| diaphragm DOF map/reduction | 일반 constraint transformation으로 추출해 재사용 |
| sparse LDLT와 diagnostics | Newton tangent 선형계 풀이 backend로 재사용, 비정정 접선 대비 별도 solver 필요성 평가 |
| Direct P-Delta의 axial force, stability, equilibrium audit | 기하비선형 검증과 결과 audit 패턴으로 재사용 |
| M-theta backbone evaluator | 새 stateful hinge material의 envelope로 재사용 |
| SDOF Newmark | MDOF 동적 solver의 독립 component regression으로 유지 |
| Analysis Center, 결과 chart, run record | 새 qualification-aware payload에 맞춰 adapter 교체 |
| trace/provenance 패턴 | model hash, iteration, warning, source 기록에 재사용 |

재사용은 기존 함수를 새 이름으로 감싸는 것이 아니라 새 계약을 만족하는지 테스트한 뒤 제한적으로 수행한다.

## 11. 폐기 또는 격리할 의미

다음 이름은 새 정식 엔진과 혼용하지 않는다.

- `runPushover` 현재 구현: `runLegacyPreliminaryPushover`로 이동 또는 명시 adapter
- `runFormalPushover`: formal 명칭 제거
- `runGlobalEquilibriumTrace`: trace 전용으로 유지
- `buildDisplacementControlTrace`: UI/교육 trace 전용으로 유지
- `buildArcLengthTrace`: 제약검사 utility로 유지
- `runNewmarkNlth`: `runSdofBilinearNewmarkTrace`로 의미 제한
- B1~B8: `legacyPrototypeBenchmarks`로 분류

기존 저장 파일과 테스트 호환은 adapter에서 유지하되 새 정식 결과로 자동 승격하지 않는다.

## 12. 권장 개발 전략

1. M0에서 먼저 결과 자격과 legacy 경로를 분리한다.
2. M1에서 committed/trial 상태와 immutable analysis domain을 구현한다.
3. M2에서 요소가 반환한 `Pint`, `Kt`, trial state를 반복마다 조립하는 MDOF Newton 코어를 완성한다.
4. M3에서 탄성 3D corotational 요소를 연결하고 선형극한·강체회전·Euler beam-column을 검증한다.
5. M4~M5에서 집중소성 힌지와 실제 변위제어 Pushover를 먼저 실용화한다.
6. M6의 PMM/fiber는 완료되었으며 M7에서 post-peak 경로추적을 추가한다.
7. 정적 코어가 검증된 뒤 M8에서 같은 요소커널로 MDOF NLTH를 구현한다.
8. M9에서 기존 모델 기능 조합과 결과회복을 닫고 M10에서 제품 UI를 연결한다.
9. M11 독립검증과 pilot 전에는 `verified`를 부여하지 않는다.
