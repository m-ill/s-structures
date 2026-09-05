# Phase 15 Risk Register

```yaml
version: p15-risk-register-v1
status: proposed
created_at: 2026-08-27
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

S는 severity, L은 likelihood다. Critical/High는 closure evidence 없이는 release할 수 없다.

| ID | 위험 | S | L | 완화·검증 | Owner |
| --- | --- | --- | --- | --- | --- |
| P15-R01 | dirty/untracked 사용자 변경을 Phase 15 baseline 또는 새 변경으로 오인 | Critical | High | M0 inventory, 별도 branch/worktree, overwrite 0 | M0 |
| P15-R02 | Phase 14 evidence·보고서를 덮어써 원인 추적 불가 | High | Medium | immutable archive, 새 evidence path | M0 |
| P15-R03 | live 상태를 여러 문서에 복제해 drift 재발 | High | Medium | status authority 단일화, doc lint | M0 |
| P15-R04 | reference/tolerance를 결과 후 변경 | Critical | Medium | 별도 PR, pre-run hash, INVALIDATED | M0·M1 |
| P15-R05 | benchmark 숫자에 맞춰 정상 QM6/MITC4/Winkler kernel을 보정 | Critical | High | 변경금지 대상, R1~R3, mutation/metamorphic | M1~M5 |
| P15-R06 | reference/oracle이 production 함수를 재사용해 독립성 상실 | Critical | Medium | import graph 0, independent owner review | M1 |
| P15-R07 | timestamp/null/incomplete payload로 hash가 거짓 결정성 표시 | High | High | hash 분리, schema, repeat 3/3 | M1 |
| P15-R08 | 절대값 비교나 성분 합으로 부호·상쇄 오류 은폐 | Critical | High | signed metric, component gates, mutation | M1·M7 |
| P15-R09 | IC breakdown을 artificial stiffness로 숨김 | Critical | Medium | 원 행렬 불변, fallback trace, true residual | M2 |
| P15-R10 | scaled residual만 작고 원 system residual·평형은 실패 | Critical | Medium | original-coordinate residual와 audit alignment | M2 |
| P15-R11 | fallback이 메모리 폭증 또는 비결정 결과 유발 | High | Medium | budget-aware policy, performance/hash repeat | M2 |
| P15-R12 | 공통 sparse 추출 중 기존 frame 결과 퇴행 | Critical | Medium | extraction PR 분리, full-precision shadow parity | M2·M8 |
| P15-R13 | local/global matrix metadata가 다시 소실 | Critical | Medium | typed basis/dofOrder, rejection test | M3 |
| P15-R14 | SB2 probe를 corner extrapolation으로 바꿔 false green | Critical | Medium | frozen raw-Gauss probe, mutation guard | M3 |
| P15-R15 | curved stress를 서로 다른 local axis로 직접 평균 | High | High | global tensor transform, rotation parity | M3 |
| P15-R16 | legacy `simply-supported`의 의미를 조용히 hard로 변경 | Critical | High | versioned explicit enum, legacy soft migration | M4 |
| P15-R17 | hard support 축/rotation DOF mapping 오류 | Critical | Medium | edge DOF snapshot, 90° rotation test | M4 |
| P15-R18 | SB5 coarse mesh 또는 final 한 점으로 수렴을 오판 | High | High | short-side sequence, final delta+reference gate | M4 |
| P15-R19 | characteristic side·shearFactor result provenance 불일치 | High | Medium | min side, actual κ, unit test | M4 |
| P15-R20 | foundation reaction과 `Kf·d`를 이중계상 | Critical | Medium | three-channel end contract, closure/energy | M5 |
| P15-R21 | linear만 고치고 P-Delta recovery는 불일치 | Critical | Medium | common recovery owner, limit-case parity | M5 |
| P15-R22 | sparse tolerance가 평형 gate보다 느슨해 fine SB7 실패 | High | High | M2 settings snapshot과 true residual | M2·M5 |
| P15-R23 | synthetic vector를 actual stabilization solve로 오인 | Critical | High | solve-count/hash, production model K/M | M6 |
| P15-R24 | clamp된 동일 parameter 반복도 sweep PASS | Critical | High | requested/effective/range/log-span gate | M6 |
| P15-R25 | floor stiffness가 physical/rigid mechanism을 가림 | Critical | Medium | common classifier, negative-control modes | M6 |
| P15-R26 | dense/sparse affected DOF가 달라 backend별 결과 차이 | High | Medium | common plan + parity | M6 |
| P15-R27 | 기존 PASS 강화 중 실제 regression 발견을 숨김 | Critical | Medium | preliminary label, fail-closed discrepancy | M7 |
| P15-R28 | mass·mode sign·participation 오류가 eigenvalue 일치로 은폐 | High | Medium | residual/MAC/orthogonality/mass audit | M7 |
| P15-R29 | PD1 비선형 단계 false convergence | Critical | Medium | stage residual/work/rollback/convergence | M7 |
| P15-R30 | 모듈 추출과 수치수정을 한 PR에 섞어 원인 격리 실패 | High | High | PR type 분리, review stop condition | M8 |
| P15-R31 | 내부 root barrel import로 cycle 발생 | High | Medium | owner-file import, full src cycle CI | M8 |
| P15-R32 | compatibility wrapper를 너무 일찍 제거해 UI/API/report 파손 | High | Medium | consumer inventory, M8 이후 removal | M8 |
| P15-R33 | report가 solver를 재실행하거나 숨은 수치를 생성 | High | Medium | immutable artifact-only review | M1·M8 |
| P15-R34 | 독립 cross-solver 입력이 동등 모델이 아님 | Critical | High | mapping audit, full-precision export, BLOCKED 허용 | M9 |
| P15-R35 | Phase 전체 PASS를 capability release로 일괄 승격 | Critical | Medium | per-capability manifest, owner approval | M9 |

## Stop condition

- baseline 또는 reference/tolerance hash 미승인
- 사용자 변경 overwrite 위험
- production expected/oracle import
- normal kernel을 benchmark 전용 계수로 수정
- true residual·평형·에너지·dense/sparse gate 실패
- mandatory mutation 미탐지
- Critical/High finding open
- feature-off·legacy project regression
- artifact schema/hash 불일치
- failed/partial/stale 결과 publish

Stop condition은 일정 지연 사유가 아니라 해당 milestone을 PASS로 표시하지 않는 fail-closed 규칙이다.
