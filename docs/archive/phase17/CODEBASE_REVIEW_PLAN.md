# Phase 17 Codebase and Module Review Plan

```yaml
version: p17-codebase-review-plan-v1
review_point: after-each-numerical-change-and-P17-M23
behavior_preserving_review_separate_from_numerical_change: true
release_on_open_critical_or_high: false
```

## 1. 목적

21개 사례를 추가하면서 benchmark 전용 코드가 production 해석엔진에 섞이거나, 같은 해석 기능이 사례마다 중복 구현되는 것을 막는다. 수치 PASS와 좋은 모듈 구조를 별도 gate로 관리한다.

## 2. 필수 리뷰 관점

### CR-01 Product/verification boundary

- `src/**`가 `verification/**`의 reference, tolerance, case builder, evaluator를 import하지 않는가
- verification runner가 private solver deep module 대신 stable product service를 호출하는가
- browser/server bundle에 benchmark expected 값이 포함되지 않는가

완료 gate: product→verification 0, verification→product deep import 0, expected leakage 0.

### CR-02 사례 격리

- 한 case가 다른 case의 model, expected 값 또는 mutable state를 import하지 않는가
- single-case command가 다른 결과 파일을 쓰지 않는가
- timeout/failure가 다른 20개 run을 손상시키지 않는가

완료 gate: case cross-import 0, failure-isolation negative test PASS.

### CR-03 Canonical numerical ownership

다음 관심사는 제품 안에 각각 하나의 canonical owner만 둔다.

- frame/truss/link element formulation과 local-axis transform
- membrane/plate/shell assembly·boundary·stress/result recovery
- Winkler stiffness와 foundation force recovery
- mass matrix, rigid diaphragm condensation, eigen solve와 mode matching
- spectrum interpolation, modal/directional combination과 member-force recovery
- P-Delta geometric stiffness·stage work balance
- hinge state/tangent/rollback과 pushover control
- Newmark integration, damping과 ground-motion interpolation

완료 gate: duplicate implementation 0 또는 승인된 compatibility policy, import cycle 0.

### CR-04 Report/result immutability

- report renderer가 solver를 호출하거나 누락된 값을 다시 계산하지 않는가
- UI와 PDF가 같은 run ID·result hash를 읽는가
- 화면용 반올림이 raw full-precision 결과를 바꾸지 않는가

완료 gate: report→solver 0, UI/JSON/PDF hash parity 100%.

### CR-05 Reference/evaluator independence

- independent oracle가 production solver 함수나 동일 stiffness builder를 재사용하지 않는가
- expected 값이 model builder의 분기나 mesh에 영향을 주지 않는가
- evaluator가 metric 누락을 PASS로 처리하지 않는가

완료 gate: oracle dependency audit PASS, missing/NaN/Infinity mutation kill 100%.

### CR-06 Numeric behavior change

수치 코드를 수정한 사례는 다음을 별도 검토한다.

- 정식화·부호·단위·축과 강성/질량/하중/복구식의 근거
- dense/sparse·full/reduced·UI/API 경로 parity
- condition, pivot/fallback, residual과 energy diagnostics
- 영향 consumer와 stale evidence 범위
- negative·pathological·permutation·scaling·refinement test

완료 gate: numerical reviewer와 structural-domain reviewer 승인, 영향 회귀 PASS.

### CR-07 Public API와 portability

- case runner가 특정 cwd, Windows path 또는 GUI 상태에 의존하지 않는가
- project folder를 옮겨도 canonical path와 relative source locator가 유지되는가
- claimed OS에서 같은 engineering result hash를 재현했는가

완료 gate: cwd independence, path normalization, 주장한 OS parity evidence.

## 3. 사례별 리뷰 순서

```text
model review
  -> numerical/reference review
  -> run/evidence review
  -> product change review (필요 시)
  -> module/dependency review
  -> report/reproducibility review
  -> case signoff
```

한 사람이 model mapping, solver 수정, reference 추출과 최종 release를 모두 승인하지 않는다.

## 4. P17-M23 통합 리뷰 산출물

- import graph와 cycle report
- production/verification/public API boundary report
- 21-case cross-import 및 duplicated owner report
- reference leakage/browser bundle scan
- report→solver audit
- test taxonomy와 planned/executed/failed/skipped/timeout/flake inventory
- source/model/build/evidence invalidation audit
- compatibility wrapper owner·소비자·제거 gate
- Critical/High/Medium finding register
- capability별 release recommendation

## 5. 승인 기준

| 항목 | 기준 |
| --- | --- |
| Critical finding | 0 |
| High finding | 0 또는 release 차단 상태의 명시적 owner·기한 |
| product→verification | 0 |
| verification→product deep import | 0 |
| import cycle | 0 |
| case cross-import | 0 |
| report→solver | 0 |
| expected/tolerance production leakage | 0 |
| mandatory test fail/skip/timeout/flake | 0 |

High finding을 문서화했다는 이유만으로 release하지 않는다. 구조개선이 이번 Phase 범위를 넘으면 Phase 17 작업 완료와 제품 release를 분리하고 release는 계속 `BLOCKED`로 둔다.

