# WP-04 — Plate Boundary, Sparse Workflow & Qualification

```yaml
id: WP-04
milestone: P15-M4
document_status: proposed
owners: [shell, compute, verification, structural-domain]
dependencies: [WP-02]
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

## 목표

plate boundary·assembly·solve·recovery를 분리하고 SB5·SB6을 short-side mesh 수렴으로 자격화한다.

## 영향 영역

- `src/solver/shell/plateWorkflow.js`
- `src/solver/shell/slabPlateMitc4.js`
- `src/solver/shell/thickPlateQualification.js`
- 신규 structured mesh/plate boundary/assembly/recovery modules
- plate report/CLI/Agent와 tests

## 작업

1. `simply-supported-soft|hard|clamped` canonical enum
2. legacy `simply-supported→soft` migration과 warning
3. hard boundary의 edge/component DOF preview·hash
4. dense K 제거, common sparse assembler/solve 사용
5. characteristic side `min(width,height)`와 actual κ recovery
6. pressure·point resultant/moment audit
7. SB5 8행 3+ levels, 5:1 short-side 24 이상 필요 시 정련
8. SB6 6행 hard SS thickness/aspect refinement
9. bending/shear energy와 solver provenance

## 수용기준

- SB5 8/8 각각 ≤1%, final mesh change ≤1%
- SB6 6/6 각각 ≤1%
- hard/soft negative control과 90° boundary mapping PASS
- pressure/point equilibrium과 energy PASS
- nondefault κ assembly/recovery parity
- 모든 fine level sparse solve 성공

## 변경 금지

MITC4 bending/assumed-shear 계수를 benchmark 값에 맞춰 수정하지 않는다. 필요 시 별도 ADR·patch/locking corpus와 독립 리뷰를 먼저 요구한다.
