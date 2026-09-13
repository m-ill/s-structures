# WP-02 — Consistent Load / Fixed-End Force

```yaml
milestone: P6-M2
priority: 2
depends: WP-01
```

## 문제
`src/solver/elasticExpansion.js`의 `expandDistributed`는 부분등분포/사다리꼴 하중을 `segments`개 **점하중으로 분할**한다. 시각화·근사엔 무방하나 지점반력·고정단모멘트·부재 중간모멘트가 **분할 수에 의존**한다. 고정단/연속보/강접골조에서 오차가 가시화된다.

## 기존 자산 (재사용/교체 대상)
- `src/solver/elasticExpansion.js` — `expandDistributed`(교체), 온도·모멘트 handcalc(유지·확장).
- `src/solver/linear3dRecovery.js` — `recoverMemberStations`(endForces+spanLoads → **q0 기반으로 정밀화**), `recoverMemberShape`(유지).
- `src/results/memberStation*.js` — station 결과 표(유지).

## 목표 구조
```text
element load
├─ equivalent nodal load vector  fe   (전역조립 투입)
├─ fixed-end force vector        q0   (부재력 복원 기준)
├─ recovery function             V(x), M(x), N(x), T(x)
└─ handcalc expression
```

## 산출물 (마이크로 모듈)
- `src/loads/fixedEnd/udl.js`, `udlPartial.js`, `trapezoid.js`, `pointLoad.js`, `memberMoment.js` — 하중종류별 `{fe, q0}` 폐형식(각 파일 단일 하중형).
- `src/loads/fixedEnd/temperature.js` — 균일·구배 온도 등가하중.
- `src/loads/fixedEnd/settlement.js` — 지점침하 등가.
- `src/loads/fixedEnd/index.js` — 하중→`{fe,q0}` 디스패처.
- `linear3dRecovery.js`의 station 내력을 `q0` + 절점력으로 복원하도록 교체.

## 인터페이스 불변식
`expandAdvancedLoads(...)` 반환에 `fe`/`q0`/`recovery` 필드를 **추가**하되 기존 소비자 필드 유지. handcalc 문자열 계약 유지.

## 핵심 식·판정 기준
정준 식은 [FORMULAS_AND_CRITERIA §2](../FORMULAS_AND_CRITERIA.md#2-consistent-load--fixed-end-force-wp-02). `f_eq=∫Nᵀp dL`, 보 형상함수 N1~N4, 하중종류별 폐형식(UDL `[qL/2,qL²/12,qL/2,−qL²/12]` 등), station 복원 `V(x)/M(x)/N(x)/T(x)`(절점력 직선보간 금지). 부호는 §0=`SIGN_CONVENTION`(인장 양수)로 통일. 평형오차 tol은 config `criteria.load.equilTol`(기본 1e-10).

## 수용 게이트
1. **fixed-fixed beam UDL** 반력·고정단모멘트 = 이론값(`wL/2`, `wL²/12`), 분할수 독립.
2. 사다리꼴/부분UDL/집중/온도/침하 각각 이론값 일치.
3. 연속보·강접골조 예제에서 중간모멘트가 분할수에 불변.
4. 기존 station 결과 회귀 유지.

## 검증 매트릭스 연결
[VERIFICATION_MATRIX](../VERIFICATION_MATRIX.md): E05–E10 (특히 **E06 fixed-fixed UDL**, **E08 trapezoid**), A05.

## 코드리뷰 체크
폐형식 유도 정확성 · 부호 관례(`src/core/signConvention.js`) 일치 · 모듈 규모 · handcalc 표현 검증.

## Review Log
| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
| | | | |
