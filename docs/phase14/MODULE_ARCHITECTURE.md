# Phase 14 Module Architecture

```yaml
version: p14-module-architecture-v1
reviewed_at: 2026-08-27
status: implemented
```

## 계층 구조

```text
UI / Agent / CLI
  └─ compute/product · modeling transactions
       └─ canonical core/schema/domain
            ├─ solver/foundation
            ├─ dynamics
            ├─ solver/shell
            └─ nonlinear/pushover + nonlinear/equilibrium
                 └─ immutable result/report artifacts

verification/phase14 + tests/references
  └─ production 결과를 읽지만 production 경로에는 reference 값을 제공하지 않음
```

## Capability별 owner

| Capability | Production owner | Orchestration/report | Qualification owner |
| --- | --- | --- | --- |
| Winkler line | `src/solver/foundation/` | `foundationTransactions`, `foundationInspector`, `foundationResponse` | `src/verification/phase14/` |
| Linear THA | `linearDirectIntegration`, `groundMotionSeries`, `modalDamping` | `analysisCaseEngine`, `linearThaReport` | P14-M2 test/evidence |
| Modal combination | `modalCombination` | product case settings/engine, CLI | P14-M3 test/evidence |
| 6DOF mass/RSA | `mass6dof`, `dynamicCondensation`, RSA result modules | modal/RSA report and agent surfaces | P14-M4 test/evidence |
| Membrane | `wallMembraneQm6`, `membraneWorkflow`, `membraneRobustness` | membrane CLI/report | P14-M5/M6 test/evidence |
| Plate | `slabPlateMitc4`, `plateWorkflow`, `thickPlateQualification` | plate CLI/report | P14-M7/M8 test/evidence |
| Shell stabilization | `unsupportedRotationFloor`, `shellStabilization` | stabilization report | P14-M9 custom qualification |
| Pushover | `productionPushover`, equilibrium control modules, state store | qualification fixture/report | P14-M10 test/evidence |

## 경계 규칙

1. UI는 `solver`, `dynamics`, nonlinear backend를 직접 import하지 않는다.
2. 설정 정규화는 `compute/product/analysisCaseSettings.js`가 소유한다.
3. 좌표축 계산은 solver가 아닌 geometry-only `core/memberAxes.js`가 소유한다.
4. 보고서는 immutable artifact를 소비하며 해석을 재실행하지 않는다.
5. benchmark reference와 상용 프로그램 결과는 verification 계층에만 둔다.
6. unsupported rotation floor는 일반 좌표계의 실제 영공간에만 적용한다. MPC·다이어프램은 `T'KT` 오염을 막기 위해 좌표축소 경로와 분리한다.
7. load/displacement/arc-length 푸시오버는 같은 production state/equilibrium 계약을 공유한다.

## 의도적으로 남긴 제한

- 독립 benchmark와 상용 프로그램 교차비교는 미실행이다.
- sparse 대형계의 일반 영공간 탐지는 비용상 제한하며 exact-null/rigid-null 정책을 사용한다.
- shell stabilization은 STRIX P3S2와 동일 요소라는 주장이 아니라 S-Structures 고유 기준이다.
- 푸시오버 자격 범위는 frame moment-hinge 중심이며 일반 fiber/P-M-M 설계 자격이 아니다.
