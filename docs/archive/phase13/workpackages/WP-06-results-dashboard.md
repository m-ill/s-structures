# WP-06 — Elastic Results Dashboard

```yaml
milestone: P13-M6
status: implementation-complete
depends_on: [P13-M1, P13-M3, P13-M4, P13-M5]
release_impact: core-blocking
```

## 1. 목표와 사용자 결과

`무엇이, 어디에서, 어떤 조합으로 지배하는가`를 한 화면에서 답하고 표·chart·3D·보고서로 같은 값을 추적한다.

## 2. 재사용 자산

- `src/results/resultPostprocessing.js`, combination envelope audit 계열
- `src/results/story/*`, `storyCenter.js`, `diaphragm/forces.js`
- `src/results/rsa/*`, base shear scale와 mass participation
- `src/ui/elasticResultVisualization.js`, `resultSelectionStore.js`, result charts/overlay
- Phase 11 immutable report snapshot

## 3. 목표 결과 query

`ElasticResultQuery`는 다음을 명시한다.

```text
runId, resultHash, caseOrCombo, purpose, story/member/node,
station, component, coordinateSystem, signConvention, unit,
reduction, maxMin, governingSource, scaleState, qualification
```

Dashboard와 export는 raw result를 직접 제각각 계산하지 않고 공용 query·governing index를 사용한다.

## 4. 작업 분해

### WP06-A. Overview·Audit

- max displacement, equilibrium force/moment residual, current/stale, issue count
- governing combo/member/story와 support/limitation
- first-order/P-Delta comparison과 theta/status

### WP06-B. Story·Lateral

- drift, story shear, overturning, base shear, torsion
- CM/CR, accidental eccentricity와 principal direction overlay
- static ELF, wind, RSA result source를 혼합하지 않고 나란히 비교

### WP06-C. Member·Reaction

- member station N/Vy/Vz/T/My/Mz, max/min와 utilization
- reaction components, support group totals와 equilibrium
- result row→member/node/station selection·camera focus

### WP06-D. Dynamics

- mode period/shape, modal·cumulative participation
- RSA input/combined/modal base shear와 scale before/after/factor
- buckling mode, preload source와 residual
- linear THA는 preliminary badge·설계전이 차단 유지

### WP06-E. Performance·accessibility

- virtualized result table, cached query와 worker-side aggregate
- selected/extreme/warning 중심 label declutter
- chart data table, keyboard row navigation와 accessible status
- CSV/clipboard formula injection 방지

## 5. 검증·정량 수용기준

- P13-RES-01: Dashboard/3D/API/CSV/report immutable result snapshot parity 100%
- P13-RES-02: max·governing independent aggregate parity 100%
- P13-RES-03: force/moment equilibrium source·value parity 100%
- P13-RES-04: first-order/P-Delta same-quantity comparison 100%
- P13-RES-05: RSA scale before/after/factor provenance 누락 0
- P13-RES-06: modal participation·story result source mislabel 0
- P13-RES-07: row↔viewport object/station selection parity 100%
- P13-RES-08: cached result open p95 500 ms 이하
- P13-RES-09: 10,000 row filter/sort p95 200 ms 이하
- P13-RES-10: row select/highlight p95 250 ms 이하
- P13-RES-11: stale/empty/unsupported를 정상 0으로 표시하는 사례 0
- P13-RES-12: color-only status 0, chart equivalent table coverage 100%

## 6. failure injection

- missing/corrupt result handle, mismatched run ID, incomplete case batch
- unit/sign metadata missing, tie governing value, empty story mapping
- large table, renderer exception, export during stale transition

렌더 실패는 raw result와 run eligibility를 바꾸지 않으며 다른 run으로 fallback하지 않는다.

## 7. evidence·완료판정

- `p13-m6-elastic-results-dashboard.json`
- static/P-Delta/modal/RSA/buckling fixture와 browser/accessibility/performance evidence
- 표·3D·보고서 parity와 governing provenance가 닫힐 때 `qualification-complete`

## 8. 비범위·잔여 위험

- shell contour는 M8, nonlinear results는 비범위
- design utilization의 식·범위 확장은 별도 설계 phase
- 대형 모델의 새로운 solver 성능 주장은 하지 않는다.

## 9. 2026-08-05 구현 결과

- completed immutable run 하나만 소비하는 10-tab dashboard, current/historical 상태, governing index와 query 계약을 실제 Results UI에 연결했다.
- CSV formula injection을 방어하고 상태를 색 외 텍스트로도 표시한다.
- 10,000-row query 성능 검증을 통과했다.
