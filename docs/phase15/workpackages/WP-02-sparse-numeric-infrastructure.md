# WP-02 — Shared Sparse Numeric Infrastructure

```yaml
id: WP-02
milestone: P15-M2
document_status: proposed
owners: [compute, solver, numerical-review]
dependencies: [WP-01]
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

## 목표

frame·membrane·plate가 함께 사용하는 deterministic sparse assembler와 fail-closed SPD solve policy를 만든다.

## 영향 영역

- 신규 `src/compute/sparse/assembly.js` 또는 승인된 동등 경로
- 신규 `src/compute/elastic/spdSolvePolicy.js`
- `src/compute/elastic/factorSession.js`
- `src/solver/linear3dAssembly.js`
- sparse parity/performance tests

## 작업

1. private sparse accumulator·CSC submatrix를 common owner로 추출
2. `basis`, `dofOrder`, element ID를 받는 block assembly 계약
3. deterministic duplicate sum·ordering·symmetry audit
4. symmetric diagonal equilibration
5. IC(0)-PCG와 승인된 fallback, true residual recomputation
6. downstream equilibrium tolerance와 solve settings 결속
7. backend/scaling/preconditioner/iterations/residual/fallback diagnostics
8. dense/sparse shadow comparison과 lifecycle·cache test

## 수용기준

- dense/CSC matrix error ≤1e-12
- LOCAL block의 GLOBAL assembly rejection 100%
- qualified response displacement ≤1e-9, force/result ≤1e-8 parity
- fine SB2/SB5 model dense n×n allocation 0
- known SPD false pivot 0 또는 명시적 qualified fallback
- 원 system true residual과 downstream audit PASS
- memory O(nnz), M0 performance budget 1.25배 이내

## 비목표

- artificial stiffness로 SPD를 강제
- benchmark별 threshold/fallback
- 외부 solver library runtime 의존
