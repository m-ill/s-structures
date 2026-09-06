# Phase 14 Verification Matrix

```yaml
version: p14-verification-matrix-v1
status: proposed
created_at: 2026-08-27
```

## 1. 레벨

- L1: formula/unit/schema
- L2: matrix/algorithm invariant·metamorphic
- L3: engine assembly/recovery/integration
- L4: CLI/Agent/UI/report·migration·failure·performance
- L5: independent reference·cross-solver·review·release manifest

L5 benchmark는 개발 후 실행한다. 현재 모든 P14 항목은 `NOT_RUN`이다.

## 2. M0

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P14-GOV-01 | Phase 13 baseline·dirty tree·build inventory | L2 | 누락 0 |
| P14-GOV-02 | requirement-risk-reference-test mapping | L2 | 100% |
| P14-GOV-03 | expected owner import audit | L3 | production import 0 |
| P14-GOV-04 | qualification stale impact map | L3 | 누락 0 |
| P14-GOV-05 | external runtime dependency audit | L4 | 0 |

## 3. M1 Winkler

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P14-FND-01 | uniform-k Hermite matrix | L1/L2 | independent parity |
| P14-FND-02 | symmetry·PSD·k=0 limit | L2 | PASS |
| P14-FND-03 | EB/Timoshenko/release/offset/rotation | L2/L3 | fixture tolerance |
| P14-FND-04 | structural force/soil reaction 분리 | L3 | owner·station parity |
| P14-FND-05 | schema/migration/UI/API/report | L4 | parity 100% |
| P14-FND-06 | foundation force·moment 평형과 energy | L3 | residual ≤1e-8, parity PASS |
| P14-FND-07 | full/stiffness-only/modal/P-Delta·dense/sparse/cache | L3/L4 | result/hash parity |
| P14-FND-08 | property/assignment 변경 stale propagation | L3/L4 | missed invalidation 0 |
| P14-SB7-01 | exact continuum + refinement | L5 | frozen tolerance |

## 4. M2 THA

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P14-THA-01 | zero/constant/harmonic input | L1/L2 | analytical behavior |
| P14-THA-02 | SDOF exact + dt-halving | L2/L5 | error/order criteria |
| P14-THA-03 | damping policy·energy | L2/L3 | trace/criteria PASS |
| P14-THA-04 | cancel/restart/partial publish | L3/L4 | corruption 0 |
| P14-TH1-01 | frozen TH1 full path | L5 | frozen tolerance |

## 5. M3/M4 RSA

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P14-MC-01 | SRSS/CQC/ABS/NRC synthetic vectors | L1/L2 | independent parity |
| P14-MC-02 | mode order/sign/permutation | L2 | invariant |
| P14-MC-03 | close-mode boundary and trace | L2/L3 | branch coverage 100% |
| P14-SR2-01 | 4 periods + 4 roof responses | L5 | frozen tolerance |
| P14-MASS-01 | full 6DOF diagonal mass | L1/L3 | exact entries |
| P14-MASS-02 | diaphragm TᵀMT eccentric reduction | L2/L3 | independent parity |
| P14-MASS-03 | mass/inertia conservation·dedup | L2/L3 | residual criteria |
| P14-RSA-REC-01 | Ux/Uy/Rz + member force recovery | L3/L4 | source parity |
| P14-SR2B-01 | 2 frequencies + 18 responses | L5 | frozen tolerance |

## 6. M5/M6 Membrane

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P14-SHM-01 | patch/rigid/rotation/Jacobian | L1/L3 | PASS |
| P14-SHM-02 | mesh lineage·quality·curved boundary | L2/L4 | trace 100% |
| P14-SHM-03 | raw/extrapolated/averaged probe | L2/L3 | method parity |
| P14-SB2-01 | LE1 stress refinement | L5 | frozen tolerance/trend |
| P14-SHM-04 | Cook distortion family | L2/L3 | no false finite result |
| P14-SHM-05 | drilling energy non-pollution | L2/L3 | criteria PASS |
| P14-SB3-01 | normalized response refinement | L5 | frozen tolerance/trend |

## 7. M7/M8 Plate

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P14-SHP-01 | support template vs direct DOF | L2/L4 | parity 100% |
| P14-SHP-02 | pressure/point resultant·moment | L2/L3 | equilibrium PASS |
| P14-SHP-03 | coefficient/result separation | L2/L4 | source trace 100% |
| P14-SB5-01 | 8 thin plate cases | L5 | each frozen tolerance |
| P14-SHP-04 | thickness/aspect/shear-factor sweep | L2/L3 | physical trend |
| P14-SHP-05 | thin-limit recovery·locking diagnostic | L2/L3 | criteria PASS |
| P14-SB6-01 | 6 thick plate cases | L5 | each frozen tolerance |

## 8. M9 Stabilization

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P14-STAB-01 | alpha range/default/unit | L1/L2 | contract PASS |
| P14-STAB-02 | 2-order parameter sweep | L2/L3 | physical shift bound |
| P14-STAB-03 | spurious mode removal | L2/L3 | mechanism 0 |
| P14-STAB-04 | mode correlation under swapping | L2 | correct tracking |
| P14-STAB-05 | claim labeling | L4/L5 | identical-claim 0 |

## 9. M10 Pushover

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P14-NL-01 | linear limit·single hinge closed form | L1/L3 | tolerance PASS |
| P14-NL-02 | multi-hinge global residual | L2/L3 | equilibrium bound |
| P14-NL-03 | strategy/cutback/rollback | L2/L3 | state corruption 0 |
| P14-NL-04 | limit/snap-through/back corpus | L3 | no hang/false PASS |
| P14-NL-05 | checkpoint/cancel/resume | L3/L4 | hash parity |
| P14-SP1-01 | CSI moment-hinge pre-peak | L5 | frozen tolerance |
| P14-SP1-02 | post-peak driver qualification | L5 | separate corpus PASS |

## 10. M11 release

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P14-REL-01 | requirement/evidence/review coverage | L5 | 100% |
| P14-REL-02 | Phase 7~14 mandatory regression | L5 | fail/skip/flake 0 |
| P14-REL-03 | metamorphic batch | L5 | mandatory PASS |
| P14-REL-04 | offline cross-solver mapping/discrepancy | L5 | silent mismatch 0 |
| P14-REL-05 | UI/CLI/Agent/report parity | L4/L5 | 100% |
| P14-REL-06 | schema migration/rollback/backup | L4/L5 | loss 0 |
| P14-REL-07 | performance/security/accessibility | L4/L5 | budget PASS |
| P14-REL-08 | manifest hash/invariant flags | L5 | 100% |

## 11. 판정

PASS는 실제 artifact가 존재할 때만 부여한다. 문서 작성, test 파일 존재, 외부 프로그램의 마케팅 표 또는 수동 화면 일치는 PASS가 아니다.
