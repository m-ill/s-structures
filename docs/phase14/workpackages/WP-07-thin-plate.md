# WP-07 — Thin Plate Bending Completion

## 목적

MITC4 얇은 판을 경계·하중·결과·메시 provenance가 있는 production capability로 만든다.

## 작업

1. simply-supported/clamped boundary templates와 DOF preview
2. consistent pressure와 exact central point load
3. center displacement·moment·shear result
4. dimensionless coefficient result transform
5. 1:1·5:1 deterministic refinement
6. UI/Agent/report comparison surface

## 내부 시험

- boundary template/direct constraints parity
- pressure resultant·centroid moment
- point load resultant
- rotation/unit/mesh/order invariance
- thin plate energy/rigid/patch regression

## 후속 qualification

SB5의 8 configurations. 각 행을 독립 판정하고 aggregate PASS로 실패를 숨기지 않는다.
