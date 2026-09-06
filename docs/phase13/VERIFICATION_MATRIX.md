# Phase 13 Verification Matrix

```yaml
version: p13-verification-matrix-v1
status: planned
reviewed_at: 2026-08-05
```

## 1. 판정 규칙

| 상태 | 의미 |
| --- | --- |
| PASS | 실제 test·artifact·review가 수용기준을 만족 |
| FAIL | 기대값·허용오차·불변조건을 위반 |
| BLOCKED | 필수 source·환경·owner input·evidence가 없음 |
| NOT_RUN | 아직 실행하지 않음 |
| NOT_APPLICABLE | 승인된 이유와 reviewer가 있는 비적용 |

timeout, missing artifact, unapproved skip와 수동 문서 표기는 PASS가 아니다.

## 2. 검증 레벨

- L1 unit/formula/schema
- L2 contract/transaction/migration
- L3 integration/numeric parity/failure injection
- L4 browser E2E/visual/accessibility/performance
- L5 source/release package/pilot/release manifest

독립 수치 reference는 production 함수가 기대값을 생성하지 않아야 한다. UI screenshot은 배치 evidence이며 수치 evidence를 대체하지 않는다.

## 3. P13-M0 — Governance·Baseline

| ID | 검증 | Level | 필수 결과 |
| --- | --- | --- | --- |
| P13-BASE-01 | 실행 진입점·result store·consumer inventory | L2 | 누락 0 |
| P13-BASE-02 | 현 status contradiction 재현 | L3/L4 | fixture 고정 |
| P13-BASE-03 | representative model/result/report hash | L2 | 모두 기록 |
| P13-BASE-04 | requirement-risk-test-evidence 링크 | L2 | dangling 0 |
| P13-BASE-05 | external solver runtime dependency audit | L3 | 0 |
| P13-BASE-06 | Phase 7~12 mandatory test inventory | L2 | 미분류 0 |
| P13-BASE-07 | supported viewport baseline | L4 | 필수 화면 확보 |
| P13-BASE-08 | reference device performance baseline | L4 | median/p95/memory |

## 4. P13-M1 — Run·Workspace

| ID | 검증 | Level | 필수 결과 |
| --- | --- | --- | --- |
| P13-RUN-01 | ribbon/wizard/workspace/report/API run parity | L3/L4 | 100% |
| P13-RUN-02 | engineering edit stale propagation | L2/L4 | 다음 화면 갱신 전 |
| P13-RUN-03 | view-state edit non-stale | L2/L4 | false stale 0 |
| P13-RUN-04 | mixed-run rejection | L3 | mixed publish 0 |
| P13-RUN-05 | failed/cancelled last-success protection | L3 | hash 불변 |
| P13-RUN-06 | save/reopen hash-qualified current restore | L3 | 오복원 0 |
| P13-RUN-07 | legacy record migration | L2/L3 | 데이터 손실 0 |
| P13-RUN-08 | double run/out-of-order worker result | L3 | current 정확히 1 |
| P13-WS-01 | 6-workspace navigation·state | L4 | 설정 손실 0 |
| P13-WS-02 | tree/viewport/inspector/drawer selection | L4 | parity 100% |
| P13-WS-03 | 1280×720~2560×1440 layout | L4 | 핵심 가림 0 |
| P13-WS-04 | keyboard/focus/layout restore | L4 | blocker 0 |

## 5. P13-M2 — Model Check·Repair

| ID | 검증 | Level | 필수 결과 |
| --- | --- | --- | --- |
| P13-MC-01 | pathological/load-audit issue battery | L1/L3 | expected recall 100% |
| P13-MC-02 | blocker false-green battery | L3 | 0 |
| P13-MC-03 | stable issue ID/order | L2 | 결정적 |
| P13-MC-04 | issue object/location completeness | L2 | 누락 0 |
| P13-MC-05 | click-to-object | L4 | parity 100% |
| P13-MC-06 | repair preview/applied diff | L2/L3 | parity 100% |
| P13-MC-07 | transaction undo hash | L3 | 원상복구 100% |
| P13-MC-08 | repair failure injection | L3 | partial mutation 0 |
| P13-MC-09 | waiver stale/revision binding | L2/L3 | 자동 재승인 0 |
| P13-MC-10 | UI/API/report issue parity | L3/L4 | 100% |

## 6. P13-M3 — Load·Mass·Manual Combination

| ID | 검증 | Level | 필수 결과 |
| --- | --- | --- | --- |
| P13-LM-01 | table/viewport/solver/report totals | L3/L4 | parity 100% |
| P13-LM-02 | one/two-way slab qA conservation | L1/L3 | criteria PASS |
| P13-LM-03 | transferred force·centroid moment | L1/L3 | equilibrium PASS |
| P13-LM-04 | generated reapply/custom conflict | L2/L3 | duplicate/overwrite 0 |
| P13-LM-05 | self/member/load mass dedup | L1/L3 | double count 0 |
| P13-LM-06 | mass preview/assembly | L3 | parity 100% |
| P13-LM-07 | failed/cancelled change-set | L3 | mutation 0 |
| P13-LM-08 | CSV unit/direction/mapping | L2/L4 | 누락 검출 100% |
| P13-LM-09 | spreadsheet code/formula execution | L3 | 0 |
| P13-LM-10 | panel preview performance/cancel | L4 | budget PASS |
| P13-LM-11 | save/reopen logical parity | L2/L3 | 100% |
| P13-LM-12 | one Apply one stale event | L2 | exactly one |

## 7. P13-M4 — KDS Procedure

| ID | 검증 | Level | 필수 결과 |
| --- | --- | --- | --- |
| P13-KDS-01 | official/independent fixture reproduction | L1/L3 | supported set 100% |
| P13-KDS-02 | source/clause/formula/unit/intermediate trace | L2/L3 | 누락 0 |
| P13-KDS-03 | missing required input | L2/L4 | silent default 0 |
| P13-KDS-04 | direction/sign/family coverage | L2/L3 | 누락·중복 0 |
| P13-KDS-05 | deterministic pack apply | L2/L3 | 100% |
| P13-KDS-06 | generated/custom conflict | L2/L4 | silent resolution 0 |
| P13-KDS-07 | rule update diff | L3/L4 | 영향 coverage 100% |
| P13-KDS-08 | unapproved candidate gate | L3 | design transfer 0 |
| P13-KDS-09 | UI/API/report approval parity | L3/L4 | 100% |
| P13-KDS-10 | superseded/tampered pack | L3 | fail-closed |

## 8. P13-M5 — Editors·Story·Diaphragm

| ID | 검증 | Level | 필수 결과 |
| --- | --- | --- | --- |
| P13-EDIT-01 | advanced Phase 10 field UI coverage | L2/L4 | 100% |
| P13-EDIT-02 | UI/model/solver/Agent value parity | L3 | 100% |
| P13-EDIT-03 | feature-off numeric regression | L3 | drift 0/tolerance PASS |
| P13-EDIT-04 | invalid bulk apply | L2/L3 | partial 0 |
| P13-EDIT-05 | undo model hash | L3 | 원상복구 100% |
| P13-EDIT-06 | save/reopen/migration field parity | L2/L3 | loss 0 |
| P13-EDIT-07 | grid/viewport selection | L4 | 100% |
| P13-STORY-01 | story meta vs geometry command | L3/L4 | 혼동 0 |
| P13-STORY-02 | diaphragm conflict/cycle/unassigned | L3 | false green 0 |
| P13-GRID-01 | 1,000-row paste/validate | L4 | budget PASS |
| P13-GRID-02 | keyboard/header/error relation | L4 | serious finding 0 |

## 9. P13-M6 — Results

| ID | 검증 | Level | 필수 결과 |
| --- | --- | --- | --- |
| P13-RES-01 | Dashboard/3D/API/CSV/report snapshot | L3/L4 | parity 100% |
| P13-RES-02 | independent max/governing aggregate | L1/L3 | parity 100% |
| P13-RES-03 | force/moment equilibrium display | L3/L4 | source/value parity |
| P13-RES-04 | first-order/P-Delta comparison | L3 | same-quantity 100% |
| P13-RES-05 | RSA scaling provenance | L3/L4 | 누락 0 |
| P13-RES-06 | modal/story result source | L3 | mislabel 0 |
| P13-RES-07 | row/chart/viewport selection | L4 | 100% |
| P13-RES-08 | cached result open | L4 | p95 ≤ 500 ms |
| P13-RES-09 | result grid filter/sort | L4 | p95 ≤ 200 ms |
| P13-RES-10 | row highlight | L4 | p95 ≤ 250 ms |
| P13-RES-11 | stale/empty/unsupported rendering | L4 | false normal 0 |
| P13-RES-12 | chart accessibility/status | L4 | coverage 100% |

## 10. P13-M7 — Review·MGT

| ID | 검증 | Level | 필수 결과 |
| --- | --- | --- | --- |
| P13-REV-01 | revision diff golden | L2/L3 | parity 100% |
| P13-REV-02 | approval/package stale | L3 | 100% |
| P13-RPT-01 | package run/report hash | L3/L5 | parity 100% |
| P13-RPT-02 | stale/partial artifact gate | L3/L5 | publish 0 |
| P13-RPT-03 | required drawing layer/limitation | L4/L5 | 누락 0 |
| P13-MGT-01 | supported mapping fixture | L2/L3 | loss 0 |
| P13-MGT-02 | unsupported source-line exposure | L2/L4 | 100% |
| P13-MGT-03 | unresolved property commit | L3 | 0 |
| P13-MGT-04 | parse/map/commit failure | L3 | current mutation 0 |
| P13-MGT-05 | source provenance | L2/L5 | 기록 100% |
| P13-MGT-06 | supported subset round-trip | L3 | parity 100% |
| P13-SEC-IMP-01 | hostile import/CSV payload | L3 | code/path injection 0 |

## 11. P13-M8 — Shell containment

| ID | 검증 | Level | 필수 결과 |
| --- | --- | --- | --- |
| P13-SHX-01 | patch/rigid/Jacobian/local-axis/pressure | L1/L3 | PASS |
| P13-SHX-02 | equilibrium·energy | L3 | PASS |
| P13-SHX-03 | supported plate benchmark | L3 | tolerance PASS |
| P13-SHX-04 | mesh convergence provenance | L2/L3 | 100% |
| P13-SHX-05 | invalid mesh battery | L3 | recall 100% |
| P13-SHX-06 | result mesh/formulation/run hash | L2/L4 | 누락 0 |
| P13-SHELL-GUARD-01 | no-provenance design transfer | L3/L5 | 0 |
| P13-SHELL-GUARD-02 | shell→frame design leakage | L3 | 0 |
| P13-SHELL-GUARD-03 | unqualified GPU route | L3 | verified 0 |
| P13-SHELL-GUARD-04 | eligibility surface parity | L3/L4 | 100% |

## 12. P13-M9 — Pilot·NFR·Release

| ID | 검증 | Level | 필수 결과 |
| --- | --- | --- | --- |
| P13-PILOT-01~06 | 6 Core scenarios source/release 3회 | L5 | 전부 PASS |
| P13-PILOT-07 | 실무자 task·time·finding | L5 | WP-09 기준 PASS |
| P13-PERF-01 | app/check/run/preview/result/report | L4/L5 | budget PASS |
| P13-PERF-02 | 50-cycle memory/resource | L4/L5 | 증가 ≤ 10% |
| P13-A11Y-01 | keyboard/focus/contrast/zoom/NVDA | L4/L5 | blocker 0 |
| P13-SEC-01 | Phase 12 security regression | L5 | PASS |
| P13-SEC-02 | injection/privacy/network/process audit | L3/L5 | violation 0 |
| P13-ROLL-01 | install/restart/backup/N-1 rollback | L5 | PASS |
| P13-REL-01 | requirement/evidence/review coverage | L5 | 100% |
| P13-REL-02 | full mandatory regression | L5 | fail/skip/flake 0 |
| P13-REL-03 | open findings | L5 | Critical/High 0 |
| P13-REL-04 | manifest hash verification | L5 | 100% |
| P13-REL-05 | invariant flags | L5 | 모두 기대값 |

## 13. release 판정

Core release는 M0~M7과 M9가 모두 PASS여야 한다. M8은 별도 capability다. M8이 FAIL/BLOCKED이면
`shellExperimentalViewAllowed=false`, `shellDesignTransferAllowed=false`로 격리하고 Core를 독립 판정한다.

`frameElasticOfficePilotAllowed`는 `finalDesignTransferAllowed`와 다른 필드다. 후자는 기존 Phase 10 공학 교차검증과 책임기술자 승인까지 충족한 경우에만 변경한다.
