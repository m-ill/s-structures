# Phase 14 Risk Register

```yaml
version: p14-risk-register-v1
status: proposed
created_at: 2026-08-27
```

| ID | 위험 | S | L | 완화·검증 | 단계 |
| --- | --- | --- | --- | --- | --- |
| P14-R01 | 다른 프로그램 숫자에 맞춘 benchmark overfit | Critical | Medium | frozen reference, metamorphic tests, import audit | M0~M11 |
| P14-R02 | P13 dirty/untracked 상태를 재현 가능한 baseline으로 오인 | Critical | High | commit/build/dirty evidence, no release before baseline | M0 |
| P14-R03 | P13 qualification backlog를 P14 완료로 숨김 | High | Medium | separate manifests/status authority | M0, M11 |
| P14-R04 | Winkler `ks(F/L³)`와 line `k(F/L²)` 단위 혼동 | Critical | High | typed dimensions, derivation trace, unit metamorphic | M1 |
| P14-R05 | foundation matrix를 release/offset과 잘못 조립 | Critical | Medium | independent fixtures, assembly-order ADR | M1 |
| P14-R06 | soil reaction recovery가 support reaction과 이중계상 | Critical | Medium | global equilibrium/result owner | M1 |
| P14-R07 | THA acceleration sign/unit/interpolation 불일치 | Critical | Medium | canonical series, exact SDOF, trace | M2 |
| P14-R08 | 안정하지만 틀린 dt 결과를 PASS | Critical | Medium | convergence order + exact/RK4 | M2 |
| P14-R09 | ABS/NRC 구현 중 modal sign·group 오류 | High | Medium | synthetic signed vectors/permutation | M3 |
| P14-R10 | 회전질량과 offset mass inertia 이중계상 | Critical | High | mass source audit, TᵀMT conservation | M4 |
| P14-R11 | shell singular/averaged stress를 NAFEMS point 값으로 오인 | Critical | High | raw/extrapolated/averaged probe provenance | M5 |
| P14-R12 | 왜곡/음 Jacobian mesh가 finite 결과를 반환 | Critical | Medium | fail-closed quality battery | M5~M6 |
| P14-R13 | support template가 이론 경계와 다름 | Critical | Medium | DOF preview/direct parity | M7 |
| P14-R14 | MITC4 shear locking을 fine mesh 한 점으로 숨김 | High | Medium | thickness/aspect/refinement/energy sweep | M8 |
| P14-R15 | stabilization이 물리 모드 순서를 바꿔 오판 | High | High | MAC/mode correlation, energy ratio | M9 |
| P14-R16 | STRIX custom P3S2를 동일 기능 PASS로 홍보 | High | Medium | custom-criterion label gate | M9 |
| P14-R17 | nonlinear false convergence·state commit 손상 | Critical | High | residual/energy, trial-commit-revert, rollback | M10 |
| P14-R18 | snap-through에서 무한 loop·UI hang | Critical | Medium | iteration budget, cancellation, failure corpus | M10 |
| P14-R19 | 외부 solver/parser가 runtime dependency 또는 보안경로가 됨 | Critical | Low | offline-only adapter, process/network audit | M0, M11 |
| P14-R20 | 범위가 SB12·SH1·full PBSD까지 팽창 | High | High | charter/change control/new phase ADR | 모든 단계 |
| P14-R21 | AI가 코어 수정 후 과거 qualification을 current로 유지 | Critical | Medium | impact hash/stale propagation | M0~M11 |
| P14-R22 | 사용자 원문·라이선스 자료가 evidence에 유출 | High | Medium | hash/locator/redaction, no raw copy | M11 |
| P14-R23 | `Ktotal`로 보 내력을 복구해 토양 등가력이 부재 설계력에 혼합 | Critical | High | `Ks/Kf/Ktotal` 분리, station-force 독립시험 | M1 |
| P14-R24 | foundation 변경이 factor/result hash를 바꾸지 않아 stale 해석 재사용 | Critical | High | property/element/factor/wire identity와 mutation test | M1 |

Critical/High open finding은 영향 capability의 qualification과 release를 차단한다.

## Architecture decision trigger

- foundation interpolation/assembly order 또는 nonlinear behavior 확대
- mass schema의 backward-incompatible 통합
- modal combination 공식·close-mode policy 변경
- shell formulation owner·stress averaging·design-transfer 변경
- nonlinear state/tangent/strategy public contract 변경
- 외부 solver·AI·network·process runtime dependency 추가
- tolerance 변경 또는 reference 등급 승격
