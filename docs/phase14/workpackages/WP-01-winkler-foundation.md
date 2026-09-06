# WP-01 — Distributed Winkler Foundation

## 목적

절점스프링 근사가 아닌 frame interpolation 기반 선형 분포기초를 추가한다.

## 영향 영역

- core schema/hash/validation/migration
- frame local matrix·assembly·release/offset
- result recovery/equilibrium/energy
- model inspector, CLI, Agent API, report

## 작업

1. `foundationProperties[]`와 typed line stiffness
2. direct input와 `ks×width` derivation provenance
3. EB analytical reference와 common numerical integrator
4. 기존 EB/Timoshenko shape function·5점 Gauss의 common owner 추출
5. Timoshenko·local-y/z DOF mapping·3D transform
6. `Ks/Kf/Ktotal` 분리와 release·부분강접·offset 조립순서 ADR
7. structural end force와 soil reaction의 분리 recovery
8. reaction curve/resultant/centroid/energy와 global force/moment 평형
9. property/element/factor/wire hash 및 stale invalidation
10. stiffness-only/modal/P-Delta·dense/sparse/cache parity
11. transaction editor와 local-axis glyph
12. performance·migration·rollback

## 내부 시험

- k=0 무회귀, matrix symmetry/PSD
- Hermite exact matrix
- rotation/reflection/member reversal/unit scaling
- external-support-foundation force/moment equilibrium와 energy parity
- release·offset·Timoshenko, dense/sparse/cache parity
- foundation 변경 시 result/factor/qualification stale
- invalid/truss/nonlinear assignment fail-closed

## 후속 qualification

exact continuum/refinement → SB7 → MIDAS/STRIX. 이 실행은 WP 구현 완료 뒤 별도 승인으로 수행한다.

## 비범위

compression-only, uplift/gap, nonlinear soil, soil settlement, coupled soil springs, exact/dynamic-stiffness production element.
