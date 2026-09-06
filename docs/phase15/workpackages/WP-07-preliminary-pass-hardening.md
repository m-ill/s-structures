# WP-07 — Preliminary PASS Evidence Hardening

```yaml
id: WP-07
milestone: P15-M7
document_status: proposed
owners: [verification, frame, dynamics, nonlinear, structural-domain]
dependencies: [WP-01]
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

## 목표

기존 PASS 6건을 상태개수의 일부가 아니라 독립 reference·수렴·모드·성분·부호 evidence가 있는 capability로 승격한다.

## 작업

### SB1

- Euler-Bernoulli R1 signed displacement·rotation·reaction·moment
- 1→2→4→8 element와 energy/equilibrium

### SB8

- 32→64→128→256 Timoshenko frequency refinement
- six-mode eigen residual·MAC·mass·shear-deformation scope

### SB9

- bending-only, axial-only, combined result를 별도 metric으로 보존
- component sum identity와 refinement

### SB10

- signed axial force·displacement·reaction convention
- magnitude-only mutation 제거·탐지

### PD1

- mesh/load-step convergence, converged stage residual·work
- geometric stiffness/tension trend negative control

### SM5

- independent generalized eigen result
- eigenvalue·mass-weighted MAC·orthogonality·participation·mass unit

## 수용기준

- 각 사례의 [Verification Matrix](../VERIFICATION_MATRIX.md) primary·additional gate PASS
- sign/component/mode 상쇄 false PASS 0
- reference/probe/tolerance provenance 100%
- mandatory mutation kill rate 100%
- 기존 수치의 설명되지 않은 regression 0

## 판정

새 결함이 발견되면 이전 PASS를 보존하려고 tolerance를 완화하지 않는다. discrepancy를 추가하고 해당 capability를 FAIL 또는 REVIEW/BLOCKED로 유지한다.
