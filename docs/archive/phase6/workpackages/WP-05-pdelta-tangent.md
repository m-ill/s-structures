# WP-05 — P-Delta 기하강성 · 비선형 조합 실행

```yaml
milestone: P6-M5
priority: 5
depends: WP-03
```

## 문제
`src/solver/linear3d.js:394` `analyzePDelta`는 `makePDeltaLoads` 등가 횡하중 반복 = **간이 2차효과**다. 사용자 기대치인 `Kt = Ke + Kg(N)`(기하/접선강성) 방식이 아니다. 또한 인장/압축 전용·P-Delta·uplift가 걸린 조합은 **비선형 load case**이므로 조합 후 선형중첩이 금지되는데, 실행구조가 이를 강제하지 않는다.

## 핵심: 중복 구현 금지 — 좌굴 경로의 정식화 추출
- **기하강성 정식화**는 `src/dynamics/globalBuckling.js`의 `buildGlobalGeometricStiffness` 내부에 이미 있다. 다만 현재는 좌굴 전용 비공개 함수이므로 그대로 import할 수 없다. WP-05의 본질은 이 정식화와 테스트를 공용 기하강성 모듈로 추출한 뒤 탄성 P-Delta 경로로 배선하는 것이다.
- corotational 프레임 `src/nonlinear/elements/corotationalBeam.js`.
- Newton-Raphson·arc-length·변위/하중 제어 `src/nonlinear/control/*`, 전역평형 `globalEquilibrium.js`.
- 인장/압축 전용 trace `src/results/unilateralTrace.js`.

## 산출물
- `src/solver/geometricStiffness.js` — 기존 좌굴 KG 정식화를 공용 모듈로 추출, tension-positive sign adapter, local/global `Kg` 테스트.
- `src/solver/pdelta/tangentStiffness.js` — `Kt = Ke + Kg(N)` 조립(공용 KG 모듈 재사용), 부호관례 문서화.
- `src/solver/pdelta/secondOrder.js` — load step별 축력 갱신 + NR/modified NR 반복(기존 control 재사용).
- `src/solver/pdelta/split.js` — P-Δ / P-δ 분리 옵션(P-large-Δ가 P-small-δ 미포함 명시).
- `src/dynamics/buckling/multiMode.js` — 좌굴 5~10 모드, shift-invert, mode normalization, pre-load별 KG, tension member KG 부호.
- `src/solver/nonlinearCombo.js` — 조합 `F=ΣγL` 전체로 unilateral/P-Delta iteration 수행(조합 후 중첩 차단 가드).

## 표기 정정
- 현행 근사: `iterative equivalent lateral load P-Delta approximation`(라벨 유지).
- 신규 기본옵션: `geometric stiffness second-order analysis`.
- 큰 변위-작은 변형은 corotational로 후속 옵션.

## 핵심 식·판정 기준
정준 식은 [FORMULAS_AND_CRITERIA §5](../FORMULAS_AND_CRITERIA.md#5-p-delta--기하강성--접선강성-wp-05). 접선강성 `Kt=Ke+Kg(N)`(**인장 양수 `SIGN_CONVENTION` 단일 부호규약** — 압축 P>0 문헌의 `Ke−Kg`를 부호전환), 2D beam-column Kg 정준행렬, NR `KtΔu=R`, 좌굴연결 `(Ke−λKg0)φ=0`, 층 안정지수 `θ=PΔ/(Vh)`. 수렴/발산/θ tier 임계값은 config `criteria.pdelta.*`(eR/eU/eE=1e-6/1e-6/1e-8, θ tier 0.05/0.10/0.20 — 현행 `pDeltaThetaLimit` 0.25를 대체·config화).

## 수용 게이트
1. P-Delta 캔틸레버(S04)·sway frame(S03) 이론값 수렴.
2. 좌굴 λcr(S01–S03)과 P-Delta 증폭의 일관성(S05).
3. `F=1.2D+1.6L+1.0W` 전체로 tension/comp-only iteration, 조합 후 `R=Σγ·R_L` 중첩 시도 시 가드가 차단/경고.
4. P-Δ/P-δ 옵션이 결과에 구분 표기.

## 검증 매트릭스 연결
[VERIFICATION_MATRIX](../VERIFICATION_MATRIX.md): S01–S05.

## 코드리뷰 체크
KG 부호관례 일관성 · 기존 KG 재사용(중복 조립 금지) · 비선형 조합 중첩금지 가드 · 수렴 진단 · 모듈 규모.

## Review Log
| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
| | | | |
