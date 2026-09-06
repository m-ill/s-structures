# Phase 15 Requirements Traceability

```yaml
version: p15-traceability-v1
status: proposed
created_at: 2026-08-27
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

이 표는 requirement family의 유일한 상위 매핑 owner다. P15-M0에서 각 개별 ID와 실제 test/evidence/review hash로 확장한다.

| Requirement | Discrepancy/Risk | Milestone | Work package | Verification | Evidence 예정 | Review |
| --- | --- | --- | --- | --- | --- | --- |
| P15-FR-GOV-* | P15-D016, P15-R01~R04 | M0, M9 | WP-00, WP-09 | P15-GOV-*, P15-REL-* | p15-m0-baseline, release manifest | M0, M9 |
| P15-FR-VFY-* | P15-D009~P15-D012, P15-D014, P15-R05~P15-R08 | M1, M9 | WP-01, WP-09 | P15-VFY-*, P15-REL-* | p15-m1-evidence-contract | M1, M9 |
| P15-FR-NUM-* | P15-D004, P15-D008, P15-R09~P15-R12 | M2 | WP-02 | P15-NUM-* | p15-m2-sparse-numeric | M2 |
| P15-FR-MEM-* | P15-D001, P15-D002, P15-D013, P15-R13~P15-R15 | M3 | WP-03 | P15-MEM-* | p15-m3-membrane | M3 |
| P15-FR-PLT-* | P15-D003~P15-D006, P15-R16~P15-R19 | M4 | WP-04 | P15-PLT-* | p15-m4-plate | M4 |
| P15-FR-FND-* | P15-D007, P15-D008, P15-R20~P15-R22 | M5 | WP-05 | P15-FND-* | p15-m5-winkler-recovery | M5 |
| P15-FR-STAB-* | P15-D009, P15-D014, P15-D015, P15-R23~P15-R26 | M6 | WP-06 | P15-STAB-* | p15-m6-stabilization | M6 |
| P15-FR-PASS-* | P15-D011, P15-R27~R29 | M7 | WP-07 | P15-PASS-* | p15-m7-pass-hardening | M7 |
| P15-FR-MOD-* | P15-D004, P15-D010~P15-D016, P15-R30~P15-R33 | M1~M8 | WP-01~WP-08 | P15-ARCH-* | p15-m8-codebase-review | M1~M8 |
| P15-NFR-* | 전체 | M0~M9 | 모든 WP | NUM/ARCH/REL | milestone + release evidence | 모든 milestone |

## 상태 흐름

```text
planned
  → implemented
  → internally-verified
  → independently-qualified
  → cross-solver-compared
  → release-allowed
```

단계는 건너뛰지 않는다. source/build/input/reference/tolerance/probe가 바뀌면 `INVALIDATED`로 내려가며, 이전 review/evidence hash를 새 결과에 재사용하지 않는다.

## P15-M0 확장 규칙

각 개별 requirement row는 다음을 가져야 한다.

- 정확한 source file/function 또는 schema field
- risk·discrepancy ID
- red reproduction test
- unit/contract/numeric/metamorphic/mutation/integration test 중 적용 ID
- reference/tolerance/input/build/result hash
- code review record와 승인 역할
- limitation, rollback route와 stale impact

orphan requirement, orphan test, orphan evidence와 review 없는 release row는 0이어야 한다.
