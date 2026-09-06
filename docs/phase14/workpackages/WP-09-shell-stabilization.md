# WP-09 — Shell Stabilization Qualification

## 목적

S-Structures의 `drillingAlpha`가 spurious rotation만 제거하고 물리응답을 오염시키지 않는지 판정한다.

## 작업

1. alpha range/default/dimensionless provenance
2. unsupported-rotation floor ratio를 explicit criteria/hash로 승격하고 null rotational DOF에만 적용
3. 두 parameter의 독립 sweep runner
4. mode-shape correlation/MAC와 physical mode classifier
5. stabilization/physical energy ratio
6. static+modal response sensitivity
7. custom-criterion claim/report gate

## 내부 시험

- alpha 2 orders sweep
- rigid/patch/static/modal corpus
- mode swapping tracking
- zero-energy mode removal
- selected default가 benchmark ID에 의존하지 않음

## 후속 qualification

STRIX P3S2와 장르를 비교할 수 있으나 동일 parameter/element PASS로 표기하지 않는다.
