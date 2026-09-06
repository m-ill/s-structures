# WP-04 — 6-DOF Mass & RSA Recovery

## 목적

명시적 회전질량관성과 rigid-diaphragm translation-rotation coupling을 지원하고 member RSA response를 복구한다.

## 작업

1. 기존 nonlinear engine과 공통인 6성분 `node.mass` schema·units·migration
2. full 6DOF lumped mass matrix
3. diaphragm `TᵀMT`, reference-point offset와 coupling
4. direct rotational inertia/offset mass dedup audit
5. eigen normalization·residual과 rotational DOF
6. Ux/Uy/Rz·frame/truss force modal recovery
7. combination/result/report parity

## 내부 시험

- eccentric point-mass analytical reduction
- offset mass vs direct Izz equivalence
- mass·polar inertia conservation
- zero/negative/unit error validation
- translational-only legacy regression
- brace force equilibrium and modal sign invariance

## 후속 qualification

SR2b의 2 frequencies, roof Ux/Uy/Rz와 세 가새축력의 세 조합법.
