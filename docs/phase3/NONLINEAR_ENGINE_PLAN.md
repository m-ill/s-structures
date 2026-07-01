# Phase 3 Nonlinear Engine Plan

status: active
milestones: P3-M11(기하 v1), P3-M12(재료+control v2)

## Goal

pushover preliminary(`m15-pushover-preliminary`: 선형 재해석 반복)를 **정식 비선형 엔진**으로 대체한다. 범위는 정적 비선형까지다. 시간이력(NLTH)은 상태 구조만 대비하고 구현은 Phase 4 (PRD 비목표 4).

## Scope Ladder

| 단계 | 내용 | 마일스톤 |
| --- | --- | --- |
| N1 기하비선형 | corotational beam + KG, full Newton-Raphson, load control | M11 |
| N2 재료비선형 | 집중 소성힌지 (M-θ backbone), 힌지 상태 추적 | M12 |
| N3 고급 control | displacement control, arc-length (Crisfield) | M12 |
| N4 pushover 정식화 | 하중 패턴, 성능점, capacity curve 계약 | M12 |
| (N5 fiber/NLTH) | Phase 4 | - |

## Module Layout

```text
src/nonlinear/
  state.js              # AnalysisState: 변위/내력/힌지 상태, step 이력, restart
  assembly.js           # 접선강성 조립 (KT = KE + KG + 힌지 수정)
  elements/
    corotationalBeam.js # 3D corotational 변환 + 국부 탄성/기하 강성
  hinges/
    momentHinge.js      # M-θ backbone, 상태머신 (elastic→yield→...→residual)
    hingeAssign.js      # 부재 단부 힌지 배정 (재료 nonlinear 파라미터 소비)
  control/
    newtonRaphson.js    # full NR + line search
    loadControl.js
    displacementControl.js
    arcLength.js        # Crisfield 구면 arc-length
    convergence.js      # norm 계약 (아래)
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
| PMM 상관 | v2.1 후보로 명시. v1 계산서에 limitation 표기 |
| trace | 힌지별 상태 이력이 `events`에 기록, 결과 후처리에서 층별 분포 표 |

## Verification Benchmarks (P3-T53, T55, T56)

benchmark gate(`src/verification/benchmarkGate*.js`)에 등록하고 tolerance로 게이트한다.

| # | Benchmark | 검증 대상 | 기준 | tolerance |
| --- | --- | --- | --- | --- |
| B1 | Euler 기둥 좌굴 | KG, 고유 좌굴 | Pcr = π²EI/L² | ±2% |
| B2 | 캔틸레버 대변위 | corotational | elastica 해 (Mattiasson 표) | ±3% |
| B3 | von Mises truss snap-through | arc-length | 해석해 한계점 | ±2%, post-peak 경로 추적 성공 |
| B4 | 포탈 프레임 소성 메커니즘 | 힌지 | 소성해석 λ = 수계산 | ±3% |
| B5 | 대표건물 pushover 회귀 | 전체 | 기존 preliminary 대비 곡선 비교 리포트 + 신규 기준 고정 | 회귀 고정 |

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

## Migration From Preliminary

1. 기존 `runPushover` API 시그니처는 어댑터로 유지 (agent 계약 호환).
2. `PUSHOVER_VERSION`을 `p3-pushover-formal`로 승격, 이전 버전 결과와 구분.
3. m15/m20 테스트는 어댑터 경유로 green 유지 후, 정식 엔진 테스트로 교체.
