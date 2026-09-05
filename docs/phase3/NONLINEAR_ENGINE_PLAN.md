# Phase 3 Nonlinear Engine Plan

status: superseded-for-production-by-phase8
milestones: P3-M14(기하 v1), P3-M15(재료+control v2), P3-M16(fiber/NLTH v3)

> **역사 문서:** 이 문서는 Phase 3 당시의 목표와 prototype 범위를 기록한다. 실제 구현은 full MDOF tangent equilibrium, 정식 displacement/arc-length control, 3D frame NLTH를 완료하지 못했다. 기존 실행 경로는 P8-M0부터 `legacy-preliminary`로 분류되며, 현재 생산 구현·qualification 기준은 [Phase 8 개발 허브](../phase8/README.md)와 [Phase 8 구현 상태](../phase8/IMPLEMENTATION_STATUS.md)가 우선한다.

## Goal

당시 목표는 pushover preliminary(`m15-pushover-preliminary`: 선형 재해석 반복)를 정식 비선형 엔진으로 대체하는 것이었다. 아래 Scope Ladder와 모듈 배치는 완료 선언이 아니라 당시 설계 목표이며, 미완료 항목은 Phase 8 마일스톤으로 재정의했다.

Direct Analysis boundary: the P2-M5 Direct Analysis plan (`docs/phase2/P2_M5_DIRECT_ANALYSIS_IMPLEMENTATION_PLAN.md`) covers elastic small-displacement second-order P-Delta using `Kt = Ke + Kg(N)` with the project tension-positive axial convention. It is not the full Phase 3 corotational/full Newton nonlinear engine.

## Scope Ladder

| 단계 | 내용 | 마일스톤 |
| --- | --- | --- |
| N1 기하비선형 | corotational beam + KG, full Newton-Raphson, load control | M14 |
| N2 재료비선형 | 집중 소성힌지 (M-θ backbone), 힌지 상태 추적 | M15 |
| N3 고급 control | displacement control, arc-length (Crisfield) | M15 |
| N4 pushover 정식화 | 하중 패턴, 성능점, capacity curve 계약 | M15 |
| N5 PMM/fiber | 축력 상관 힌지, fiber 단면 (RC/steel) | M16 |
| N6 NLTH | Newmark-β 직접적분, Rayleigh 감쇠, 지진파 관리 | M16 |

## Module Layout

```text
src/nonlinear/
  state.js              # AnalysisState: 변위/내력/힌지 상태, step 이력, restart
  assembly.js           # 접선강성 조립 (KT = KE + KG + 힌지 수정)
  elements/
    corotationalBeam.js # 3D corotational 변환 + 국부 탄성/기하 강성
  hinges/
    momentHinge.js      # M-θ backbone, 상태머신 (elastic→yield→...→residual)
    pmmHinge.js         # 축력 수준별 backbone 보간 (N5)
    hingeAssign.js      # 부재 단부 힌지 배정 (재료 nonlinear 파라미터 소비)
  fiber/
    fiberSection.js     # RC/steel fiber 분할, 재료 backbone 소비 (N5)
    momentCurvature.js  # M-φ 산정 + 검증
  control/
    newtonRaphson.js    # full NR + line search
    loadControl.js
    displacementControl.js
    arcLength.js        # Crisfield 구면 arc-length
    convergence.js      # norm 계약 (아래)
  dynamics/
    newmark.js          # Newmark-β 직접적분 + step 내 NR (N6)
    rayleigh.js         # 감쇠 행렬
    groundMotion.js     # 지진파 기록 파싱/scaling (T86)
  pushover.js           # 정식 pushover 드라이버 (기존 파일 대체)
```

기존 `src/solver/linear3dElement.js`의 요소 강성/변환을 재사용하되, 상태를 갖는 로직은 전부 `src/nonlinear/` 안에 둔다 (ARCHITECTURE 경계).

## State And Increment Contract (P3-T50)

```js
AnalysisState {
  step, lambda,                    // 하중계수
  u: Float64Array,                 // 전체 변위
  hinges: Map<hingeId, { state, rotation, moment, history }>,
  converged, iterations,
  events: [{ step, type: 'yield'|'ultimate'|'residual', hingeId }],
}
```

각 step은 이전 state에서 시작한다(경로 의존성). restart: 임의 step의 state 스냅샷에서 재개 가능해야 한다 — 이는 테스트 결정성과 UI 진행 표시의 기반이다.

## Convergence Contract (P3-T52)

| Norm | 기본 tolerance |
| --- | --- |
| force: ‖R‖ / ‖F_ext‖ | 1e-4 |
| displacement: ‖Δu_i‖ / ‖Δu_1‖ | 1e-4 |
| energy: Δuᵀ·R / (Δu_1ᵀ·R_1) | 1e-6 |

수렴 판단은 force + (displacement or energy) 동시 만족. 최대 반복(기본 30) 초과 시 해당 step 실패로 기록하고 **이유와 함께** 중단 또는 스텝 분할 재시도(자동 1회). 모든 step의 수렴 로그는 결과 계약에 남긴다 — 기존 `pDeltaTrace`/`advancedElasticTrace` 스타일을 따른다.

## Hinge Model (P3-T54)

v1 힌지: 부재 단부 집중 M-θ, 축력 상호작용 없음(한계로 명시). backbone은 재료 라이브러리 `nonlinear` 파라미터에서 생성한다.

```text
M |     B____C
  |    /      \
  |   /        \D____E
  |  A(탄성)
  +---------------------- θ
상태: elastic -> yielded(B) -> capping(C) -> degrading(D) -> residual(E)
```

| 규칙 | 내용 |
| --- | --- |
| 제하(unloading) | 초기 강성 평행 (v1) |
| 강성 반영 | 힌지 접선 강성을 요소 단부에 응축(static condensation) |
| PMM 상관 | N5(T83)에서 구현: 축력 수준별 backbone 보간. M15 시점 계산서에는 limitation 표기 후 M16에서 해제 |
| trace | 힌지별 상태 이력이 `events`에 기록, 결과 후처리에서 층별 분포 표 |

## N5. PMM Hinge And Fiber Section (M16, P3-T83~T84)

| 항목 | 내용 |
| --- | --- |
| PMM 힌지 | 축력비(P/Pₙ) 구간별 M-θ backbone 세트 보간. 상관면은 재료/단면에서 생성 (RC: PM 상관 모듈 P3-T88 재사용, steel: H1 상관식) |
| fiber 단면 | 단면을 fiber로 분할 (RC: 피복/심부 콘크리트+철근, steel: 플랜지/웨브 스트립). 재료 라이브러리 backbone(σ-ε) 소비 |
| fiber 요소 적용 | v1은 힌지 위치의 fiber 단면 (distributed plasticity는 비목표 — 집중 소성 유지) |
| 검증 | 모멘트-곡률(M-φ) 이론해 비교 (탄소성 직사각형 단면), RC 단면 Pb/M0 수계산 |

## N6. Nonlinear Time History (M16, P3-T85~T86)

| 항목 | 내용 |
| --- | --- |
| 적분 | Newmark-β (γ=1/2, β=1/4 기본), step 내 Newton-Raphson 평형 반복 |
| 감쇠 | Rayleigh (α, β — 두 모드 지정), 힌지 이력 감쇠는 자동 포함 |
| 입력 | 지반가속도 기록 (내장 기록 + 사용자 업로드 CSV/PEER 형식), 방향별 배율 |
| scaling | 설계 스펙트럼 맞춤 배율 v1 (주기 구간 평균 비율), scaling trace 계산서 표기 |
| 출력 | 시간이력 응답 (변위/층전단/힌지 상태), 최대치 envelope → 기존 결과 계약 합류 |
| 안정성 | 발산 감지 (에너지 증가율), step 자동 분할 1회 |
| 한계 명시 | 집중 소성 모델, P-Δ 포함 여부 옵션, 지반-구조 상호작용 미포함 |

## Verification Benchmarks (P3-T53, T55, T56, T83~T85)

제품 진단 gate(`src/diagnostics/benchmarkGate*.js`)와 독립 검증 framework에 등록하고 tolerance로 게이트한다.

| # | Benchmark | 검증 대상 | 기준 | tolerance |
| --- | --- | --- | --- | --- |
| B1 | Euler 기둥 좌굴 | KG, 고유 좌굴 | Pcr = π²EI/L² | ±2% |
| B2 | 캔틸레버 대변위 | corotational | elastica 해 (Mattiasson 표) | ±3% |
| B3 | von Mises truss snap-through | arc-length | 해석해 한계점 | ±2%, post-peak 경로 추적 성공 |
| B4 | 포탈 프레임 소성 메커니즘 | 힌지 | 소성해석 λ = 수계산 | ±3% |
| B5 | 대표건물 pushover 회귀 | 전체 | 기존 preliminary 대비 곡선 비교 리포트 + 신규 기준 고정 | 회귀 고정 |
| B6 | 탄소성 M-φ | fiber | 직사각형 단면 이론해 | ±2% |
| B7 | 1자유도 탄소성 THA | Newmark+힌지 | 정해(구간 해석해) | ±3% |
| B8 | 선형 THA 일치 | Newmark | 탄성 케이스에서 modal superposition(T81)과 일치 | ±1% |

## Result And Report Contract (M13 연결)

```js
getNonlinearAnalysisTrace() -> {
  method: { elements: 'corotational-beam', hinges: 'concentrated-M-theta',
            control, convergence: {...} },
  limitations: ['no PMM interaction', 'static only', ...],
  steps: [{ step, lambda, controlDisp, converged, iterations, hingeEvents }],
  capacityCurve: [{ baseShear, roofDisp }],
  hingeStates: 층별/부재별 분포,
}
```

계산서 비선형 장(P3-T59)은 method/limitation/수렴 로그를 숨기지 않고 수록한다 (개발 원칙 3). `practiceValidation`에 비선형 게이트를 추가한다: 실패 step 존재 시 WARN, benchmark 미통과 빌드는 merge 불가.

## Historical Migration Target

아래 항목은 Phase 3에서 계획했으나 정식 production migration으로 완료되지 않았다. P8-M0는 기존 API를 호환 어댑터로 보존하면서 engine ID와 qualification을 분리했고, 실제 엔진 교체는 P8-M1 이후에 수행한다.

1. 기존 `runPushover` API 시그니처는 어댑터로 유지 (agent 계약 호환).
2. `PUSHOVER_VERSION`을 `p3-pushover-formal`로 승격, 이전 버전 결과와 구분.
3. m15/m20 테스트는 어댑터 경유로 green 유지 후, 정식 엔진 테스트로 교체.
