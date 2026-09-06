# WP-05 — Membrane Stress Qualification Surface

## 목적

QM6-EAS 계산코어를 곡선 경계의 membrane stress convergence workflow와 연결한다.

## 작업

1. deterministic structured quad mesh/refinement lineage
2. curve chord error, aspect/Jacobian/local-axis quality
3. plane-stress material·thickness contract
4. center 고정을 제거한 `(xi,eta)`/Gauss raw integration/extrapolated/averaged stress schema
5. point/edge probe와 coordinate mapping
6. consistent in-plane edge traction과 resultant/moment audit
7. contour/table/report provenance와 mesh comparison

## 내부 시험

- constant stress patch·rigid rotation·energy
- node/element order·rotation·unit invariance
- load/resultant equilibrium
- negative Jacobian·invalid boundary fail-closed
- probe method round-trip

## 후속 qualification

NAFEMS LE1 refinement. Fine mesh 한 점뿐 아니라 monotonic trend와 geometry/probe hash를 판정한다.
