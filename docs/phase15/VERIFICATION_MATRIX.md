# Phase 15 Verification Matrix

```yaml
version: p15-verification-matrix-v1
status: proposed
created_at: 2026-08-27
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

## 1. 검증 수준

| Level | 의미 |
| --- | --- |
| L0 | 문서·schema·hash·import 계약 |
| L1 | 순수 함수·행렬·단위 unit test |
| L2 | module/API contract와 failure injection |
| L3 | 수치 invariant·평형·에너지·잔차 |
| L4 | metamorphic·mutation·dense/sparse parity |
| L5 | production workflow·CLI/Agent/UI/report integration |
| L6 | R1~R3 독립자격, R4 교차비교와 release evidence |

PASS는 해당 행의 모든 level과 frozen acceptance를 충족할 때만 부여한다.

## 2. P15-M0 Baseline

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P15-GOV-01 | source/build/dirty/environment inventory | L0 | 누락 0, immutable hash |
| P15-GOV-02 | 1차 report/JSON archive | L0 | overwrite 0, hash 재검증 |
| P15-GOV-03 | reference/tolerance/probe pre-registration | L0 | 대상 case 100% |
| P15-GOV-04 | requirement-risk-discrepancy mapping | L0 | 100% |
| P15-GOV-05 | production expected import graph | L0/L2 | import 0 |
| P15-GOV-06 | performance/determinism baseline | L2 | repeatable record 존재 |

## 3. P15-M1 Verification integrity

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P15-VFY-01 | model/calculation/result/run hash field coverage | L0/L2 | required field 100%, null 0 |
| P15-VFY-02 | same-run determinism | L2/L5 | calculation/result hash 3/3 동일 |
| P15-VFY-03 | timestamp/environment separation | L2 | calculation hash 동일, run hash 변경 |
| P15-VFY-04 | signed metric | L1/L2 | SB10 magnitude mutation FAIL |
| P15-VFY-05 | stale propagation | L2 | source/reference/tolerance/probe 변경 100% INVALIDATED |
| P15-VFY-06 | status fail-closed | L2 | fail/blocked/not-run/partial/stale PASS 0 |
| P15-VFY-07 | artifact-only report | L2/L5 | artifact 외 수치·진단 생성 0 |
| P15-VFY-08 | evidence schema | L0/L2 | NaN/Infinity/duplicate/missing 탐지 100% |
| P15-VFY-09 | mutation harness self-test | L4 | 등록 mutation kill rate 100% |

## 4. P15-M2 Sparse numeric infrastructure

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P15-NUM-01 | triplet duplicate/permutation determinism | L1/L4 | canonical CSC/hash 동일 |
| P15-NUM-02 | dense/CSC assembly parity | L1/L3 | relative matrix error ≤1e-12 |
| P15-NUM-03 | coordinate metadata rejection | L2 | LOCAL block의 GLOBAL assembly 반드시 FAIL |
| P15-NUM-04 | SPD scaling/preconditioner | L1/L3 | 원 system true residual ≤ case tolerance |
| P15-NUM-05 | IC breakdown fallback | L2/L3 | reason 기록, qualified fallback 또는 explicit failure |
| P15-NUM-06 | dense/sparse response parity | L3/L4 | displacement ≤1e-9, force/result ≤1e-8 relative |
| P15-NUM-07 | fine-model storage | L3/L5 | dense n×n allocation 0, memory O(nnz) |
| P15-NUM-08 | factor lifecycle/cache | L2 | dispose balance, stale reuse 0 |
| P15-NUM-09 | solver/audit tolerance alignment | L2/L3 | solver true residual이 downstream gate보다 느슨하지 않음 |

## 5. P15-M3 Membrane

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P15-MEM-01 | global block equals approved transform | L1/L3 | relative error ≤1e-12 |
| P15-MEM-02 | SB2 load resultant/moment | L3 | manifest tolerance, 기본 normalized ≤1e-8 |
| P15-MEM-03 | SB2 refinement | L3/L6 | 24×12→48×24→64×32→96×48; R2 ≤3%; last change ≤1.5% |
| P15-MEM-04 | SB2 same-mesh R4 | L6 | STRIX 차이 ≤0.75% |
| P15-MEM-05 | SB3 refinement | L3/L6 | 4→8→12→16; R2 ≤1%; last change ≤0.5% |
| P15-MEM-06 | rotation/reflection/unit/permutation | L4 | transformed response relative difference ≤1e-8 |
| P15-MEM-07 | raw Gauss probe guard | L2/L4 | corner extrapolation 대체 mutation FAIL |
| P15-MEM-08 | global tensor averaging | L1/L4 | rotated mesh contour parity ≤1e-8 |

## 6. P15-M4 Plate

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P15-PLT-01 | soft/hard/clamped DOF snapshot | L1/L2 | edge/component contract 100% |
| P15-PLT-02 | legacy support migration | L2/L5 | 기존 soft 결과 parity, silent semantic change 0 |
| P15-PLT-03 | pressure/point resultant·moment | L3 | normalized residual ≤1e-10 |
| P15-PLT-04 | SB5 eight rows | L3/L6 | 각각 R2 오차 ≤1% |
| P15-PLT-05 | SB5 refinement | L3 | 각 3+ levels, final change ≤1%, `p>0.8` 또는 승인된 asymptotic 근거 |
| P15-PLT-06 | SB6 six hard-SS rows | L3/L6 | 각각 R2 오차 ≤1% |
| P15-PLT-07 | hard/soft negative control | L4 | support-contract mutation FAIL; R10/R5 중 차이 명확 |
| P15-PLT-08 | shearFactor recovery | L1/L3 | nondefault κ assembly/recovery parity |
| P15-PLT-09 | 90° rotation/short-side normalization | L4 | coefficient·boundary parity ≤1e-8 |
| P15-PLT-10 | refined sparse solve | L3/L5 | 모든 level 성공, dense allocation 0 |

## 7. P15-M5 Winkler

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P15-FND-01 | `foundationEnd=Kf·d` | L1/L3 | relative residual ≤1e-10 |
| P15-FND-02 | equivalent action identity | L1/L3 | `equivalentAction=-foundationEnd` ≤1e-10 |
| P15-FND-03 | station endpoint closure | L3 | 각 element/force component ≤1e-8 relative |
| P15-FND-04 | reaction resultant/first moment/energy | L3 | manifest equilibrium tolerance PASS |
| P15-FND-05 | linear/P-Delta common contract | L2/L4 | agreed limit-case parity ≤1e-8 |
| P15-FND-06 | SB7 refinement | L3/L6 | 8→16→32→64, final change ≤0.05% |
| P15-FND-07 | SB7 exact response | L6 | center w와 M 각각 R1 오차 ≤0.1% |
| P15-FND-08 | dense/sparse 64-element | L4 | response ≤1e-8 relative, top-level analysis OK |
| P15-FND-09 | reversal/rotation/unit/scaling | L4 | transformed result ≤1e-8 |
| P15-FND-10 | missing-end-action mutation | L4 | closure 또는 reference gate에서 FAIL |

## 8. P15-M6 Stabilization

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P15-STAB-01 | requested/effective range contract | L1/L2 | clamp·invalid·duplicate effective value PASS 0 |
| P15-STAB-02 | actual solve count | L2/L5 | sweep point 수와 solve artifact 수 일치 |
| P15-STAB-03 | physical static sensitivity | L3/L6 | response shift <0.5% |
| P15-STAB-04 | physical modal sensitivity | L3/L6 | period shift <0.5%, matched MAC ≥0.99 |
| P15-STAB-05 | stabilization energy | L3 | modal ratio ≤1e-3, static ratio ≤1e-4 |
| P15-STAB-06 | null-mode classification | L3/L4 | spurious 제거, physical/rigid masking 0 |
| P15-STAB-07 | dense/sparse affected-DOF parity | L2/L4 | set·diagonal plan parity 100% |
| P15-STAB-08 | 1×→2×→4× mesh | L3 | retained physical periods last change ≤0.5% |
| P15-STAB-09 | claim label | L0/L5 | identical-to-STRIX claim 0 |

## 9. P15-M7 Existing PASS hardening

| ID | 사례 | Mandatory 추가 gate |
| --- | --- | --- |
| P15-PASS-01 | SB1 | signed 4 quantities ≤0.01%, 1→2→4→8, energy/equilibrium |
| P15-PASS-02 | SB8 | 32→64→128→256, six frequencies ≤0.1%, residual/MAC/mass |
| P15-PASS-03 | SB9 | bending·axial·combined 각각 ≤0.1%, component identity |
| P15-PASS-04 | SB10 | signed forces/displacements/reactions ≤0.1%, magnitude mutation FAIL |
| P15-PASS-05 | PD1 | frozen 4 metrics, mesh/load-step, stage residual·work balance |
| P15-PASS-06 | SM5 | eigenvalue ≤0.5%, MAC ≥0.99, mass orthogonality/participation/unit |

## 10. P15-M8 Architecture·review

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P15-ARCH-01 | full `src` import cycle | L0/L2 | cycle 0 |
| P15-ARCH-02 | forbidden imports | L0/L2 | UI→numeric, production→verification/reference, internal→root barrel 각각 0 |
| P15-ARCH-03 | duplicate owner audit | L0/L2 | sparse/boundary/foundation recovery/stabilization classifier owner 각 1 |
| P15-ARCH-04 | compatibility wrapper parity | L2/L5 | consumer 100%, undocumented removal 0 |
| P15-ARCH-05 | legacy schema/project | L2/L5 | migration/save/reopen/undo/backup PASS |
| P15-ARCH-06 | performance/memory | L5 | M0 baseline 1.25배 이내 |
| P15-ARCH-07 | review finding closure | L0 | unresolved Critical/High 0 |

## 11. P15-M9 Release

| ID | 검증 | Level | 기준 |
| --- | --- | --- | --- |
| P15-REL-01 | requirements/evidence/review coverage | L6 | 100% |
| P15-REL-02 | Phase 7~15 mandatory regression | L5/L6 | fail/skip/timeout/flake 0 |
| P15-REL-03 | mutation batch | L4/L6 | kill rate 100% |
| P15-REL-04 | deterministic rerun | L5/L6 | same environment 3/3 hash parity |
| P15-REL-05 | clean-environment rerun | L6 | mandatory PASS |
| P15-REL-06 | UI/CLI/Agent/JSON/PDF parity | L5/L6 | value/unit/axis/sign/hash/status 100% |
| P15-REL-07 | offline cross-solver mapping | L6 | silent mapping difference 0; 미확보는 BLOCKED |
| P15-REL-08 | release manifest | L6 | stale/hash/open finding validation PASS |
| P15-REL-09 | final design transfer | L6 | 별도 structural owner 승인 없으면 false |

## 12. 판정 규칙

- test 파일 존재는 PASS가 아니다.
- reference 값과 같은 production 함수로 만든 oracle은 독립자격이 아니다.
- convergence failure, fallback failure, timeout, missing field와 stale hash는 PASS가 아니다.
- primary metric가 tolerance 안이어도 mandatory invariant·mutation 하나가 실패하면 해당 case는 FAIL이다.
- R4가 없으면 `crossSolverCompared=false`를 유지하되 R1~R3 독립자격과 혼동하지 않는다.
