# Phase 17 STRIX21 Verification Matrix

```yaml
version: p17-verification-matrix-v1
official_denominator: 21
phase17_initial_status: NOT_STARTED
prior_results_are_inherited: false
```

## 1. 공식 21개 queue

| 순번 | ID | 검증 대상과 핵심 비교량 | Phase 15 이전 상태 | Phase 17 필수 특화 gate | P17 초기 상태 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `SB1` | Euler cantilever tip `uz`, `ry`, 지점 `Rz`, `My` | 수치 PASS | 폐형해, 평형·에너지, subdivision invariance | `NOT_STARTED` |
| 2 | `SB2` | NAFEMS LE1 D점 접선응력 | 수치 PASS | source probe 위치, 곡선 mesh lineage, mesh convergence, 응력복구 | `NOT_STARTED` |
| 3 | `SB3` | Cook membrane normalized tip displacement | 수치 PASS | 왜곡 mesh, 회전·순서 불변성, refinement | `NOT_STARTED` |
| 4 | `SB5` | 얇은 판 8개 중앙 처짐계수 | 수치 PASS | SS/FIX, UDL/point, 1:1/5:1, hard/soft negative control, 수렴 | `NOT_STARTED` |
| 5 | `SB6` | 두꺼운 판 6개 FSDT 처짐계수 | 수치 PASS | Reissner-Mindlin, `kappa=5/6`, hard SS, 두께·종횡비 sweep | `NOT_STARTED` |
| 6 | `SB7` | Winkler 보 중앙 처짐·모멘트 | 수치 PASS | `Ks/Kf/Ktotal`, 기초 end/station closure, 반력·energy, refinement | `NOT_STARTED` |
| 7 | `SB8` | Timoshenko 보 `f1~f6` | 수치 PASS | 병진 lumped mass, rotary inertia off, eigen residual·직교성·mode tracking | `NOT_STARTED` |
| 8 | `SB9` | 포털 골조 combined·bending·axial 처짐 | 수치 PASS | UDL, section modifier, component superposition identity, 평형 | `NOT_STARTED` |
| 9 | `SB10` | 두 brace 축력, apex `ux/uz`, 지점반력 | 수치 PASS | signed axial force, exact determinacy, 전역 force/moment closure | `NOT_STARTED` |
| 10 | `SB12` | 경사·near-vertical 6-DOF link 변위·회전 12개 | `UNSUPPORTED` | anisotropic link, beta-angle transform, near-vertical/축변환 mutation | `NOT_STARTED` |
| 11 | `PD1` | 인장 유무 P-Delta 처짐·모멘트 | metric PASS, qualification BLOCKED | stage carry-over, tension-positive `Kg`, external/internal work, step residual | `NOT_STARTED` |
| 12 | `SM5` | Bathe-Wilson 첫 3개 `omega^2` | metric PASS, qualification BLOCKED | 독립 full-precision mode vector, MAC, mass orthogonality, residual | `NOT_STARTED` |
| 13 | `SM5b` | 편심 강체 다이어프램 첫 6개 `omega^2` | `INPUT_BLOCKED` | `Ux/Uy/Rz` condensation, full/reduced parity, 편심질량·회전관성 | `NOT_STARTED` |
| 14 | `SM6` | ASME 3D pipe frame eigenvalues/frequencies | `INPUT_BLOCKED` | 3D 축·연결, 6-DOF mass, rotational mass, mode count·residual | `NOT_STARTED` |
| 15 | `SR1` | 2D RSA `T1/T2`, 층변위, 부재모멘트 | `INPUT_BLOCKED` | spectrum curve hash, participation, SRSS/CQC, modal/base shear closure | `NOT_STARTED` |
| 16 | `SR2` | 편심 3D RSA periods와 roof Ux 4조합 | `INPUT_BLOCKED` | rigid diaphragm torsion, damping, SRSS/CQC/ABS/NRC10 trace | `NOT_STARTED` |
| 17 | `SR2b` | L형 가새골조 roof `Ux/Uy/Rz`, brace axial | `INPUT_BLOCKED` | diaphragm·MMI, direction rule, CQC/SRSS/ABS, signed axial recovery | `NOT_STARTED` |
| 18 | `P3S2` | stabilizer sweep에 따른 지배 mode period | 공식 미실행, `P3S2-SS` analog만 존재 | 동일 wall·parameter, spurious/physical mode 분류, participation/MAC | `NOT_STARTED` |
| 19 | `SP1` | moment hinge yield·hardening peak·pre-peak consistency | `READY_NOT_RUN` | backbone mapping, tangent, load/displacement control, step/energy | `NOT_STARTED` |
| 20 | `SH1` | custom 3D P-M-M hinge backbone·biaxial·N interpolation | `UNSUPPORTED` | 동일 PMM surface/state 여부, objectivity·rollback; 아니면 analogous 표시 | `NOT_STARTED` |
| 21 | `TH1` | Newmark zeta 0/5% peak, dt 수렴, modal-Rayleigh gap | `INPUT_BLOCKED` | excitation sample hash, dt order, energy·phase·amplitude, damping parity | `NOT_STARTED` |

## 2. 공식 집계 밖 custom 사례

| ID | 역할 | 정책 |
| --- | --- | --- |
| `P3S2-SS` | S-Structures 고유 shell stabilization 실제 정적·모달 qualification | `custom/`에 유지, 공식 P3S2와 별도 report·분모·status |

## 3. 사례별 비교열

모든 사례 report는 가능한 범위에서 다음 열을 가진다.

| 열 | 값이 없을 때 |
| --- | --- |
| Primary independent reference | `BLOCKED_REFERENCE` 또는 적용 불가 사유 |
| STRIX manual v1.0.2 | 판본과 source precision 표시 |
| STRIX per-case HTML/catalog v1.0.4 | 판본과 source precision 표시 |
| STRIX per-case PDF v1.0.2 | 판본과 source precision·완전성 표시 |
| STRIX actual R4 export | 실제 재실행이 없으면 `NOT_RUN` |
| MIDAS actual R4 export | native model/raw export가 없으면 `NOT_RUN` |
| S-Structures Phase 17 result | 실제 product run 없으면 `NOT_RUN` |

STRIX v1.0.2와 v1.0.4 값이 같더라도 하나의 열로 합치지 않고 source lock에서 동등성을 확인한 뒤 alias할 수 있다.

## 4. 공통 mandatory gate

- source, reference, tolerance, probe와 model mapping 사전 승인
- model·build·settings·result hash 결속
- signed metric과 near-zero absolute rule
- 평형 또는 해당 가족의 물리 residual
- 메시·시간간격·load-step 또는 mode convergence
- 결정론 3회
- 적용 가능한 metamorphic/mutation test
- Chrome input/result capture
- JSON/Markdown/PDF parity
- 독립 reviewer signoff

한 항목이라도 없으면 수치가 허용오차에 들어와도 공식 사례 `PASS`가 아니다.
