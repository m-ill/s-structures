# WP-03 — Membrane Global Assembly & Qualification

```yaml
id: WP-03
milestone: P15-M3
document_status: proposed
owners: [shell, verification, structural-domain]
dependencies: [WP-02]
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

## 목표

local/global matrix 계약을 명시하고 SB2·SB3를 production sparse membrane workflow로 자격화한다.

## 영향 영역

- `src/solver/shell/wallMembraneQm6.js`
- `src/solver/shell/membraneWorkflow.js`
- 신규 shell matrix/DOF projection owner
- STRIX case SB2·SB3 runners와 tests

## 작업

1. global compatible/local condensed/stabilization matrix metadata와 DOF order 명시
2. approved global membrane block projection API
3. production mesh/load/constraint/sparse solve workflow
4. SB2·SB3 수동 dense 조립 제거
5. SB2 24×12→48×24→64×32→96×48
6. SB3 4→8→12→16
7. raw Gauss probe·edge resultant·energy provenance
8. stress tensor global rotation 후 nodal averaging

## 수용기준

- SB2 R2 오차 ≤3%, 동일 메시 R4 차이 ≤0.75%
- SB3 R2 오차 ≤1%
- rotation/reflection/unit/permutation ≤1e-8
- local-as-global과 corner-probe mutation FAIL
- load resultant·moment·energy PASS
- fine sparse solve 성공, dense allocation 0

## 변경 금지

독립 kernel failure가 새로 증명되지 않는 한 QM6-EAS static condensation·enhanced strain 계수와 SB2 raw nearest-Gauss probe를 변경하지 않는다.
