# WP-05 — Winkler Recovery & Endpoint Closure

```yaml
id: WP-05
milestone: P15-M5
document_status: proposed
owners: [frame-solver, foundation, verification, structural-domain]
dependencies: [WP-01, WP-02]
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

## 목표

Winkler stiffness, foundation resisting end action과 soil reaction을 명확히 구분하고 linear/P-Delta station 결과를 양단에서 닫는다.

## 영향 영역

- `src/solver/foundation/winklerLine.js`
- 신규 `src/solver/foundation/foundationRecovery.js`
- `src/solver/linear3dRecovery.js`
- `src/solver/pdelta/secondOrder.js`
- `src/solver/linear3dAssembly.js` solve settings
- foundation result/report/tests

## Canonical 계약

```text
structuralEnd = Ks·d + f0_external
foundationEnd = Kf·d
soilEquivalentNodalAction = -Kf·d
equilibriumEnd = structuralEnd + foundationEnd
```

station equilibrium force는 `equilibriumEnd`에서 시작해 soil-on-member distributed reaction을 적분한다.

## 작업

1. foundation stiffness kernel과 recovery owner 분리
2. three-channel end action을 additive result schema에 추가
3. constitutive/equilibrium station force 구분
4. endpoint closure·resultant·first moment·energy audit
5. 1차·P-Delta common recovery와 legacy consumer migration
6. SB7 center signed endpoint probe와 8→16→32→64 refinement
7. sparse solver residual/equilibrium tolerance 정렬
8. release·offset·Timoshenko·reversal 경로 시험

## 수용기준

- SB7 displacement·moment 각각 정확해 대비 ≤0.1%
- `foundationEnd=Kf·d`, equivalent action identity ≤1e-10
- station endpoint·global force/moment/energy PASS
- dense/sparse 64-element result ≤1e-8 relative parity
- linear/P-Delta agreed limit parity ≤1e-8
- missing-foundation-end mutation FAIL

## 변경 금지

Winkler consistent Hermite K를 reference에 맞춰 보정하거나 foundation reaction을 support reaction과 이중계상하지 않는다.
