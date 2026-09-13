# Phase 13 Requirements Traceability

```yaml
version: p13-traceability-v2
status: implementation-complete-qualification-in-progress
reviewed_at: 2026-08-05
```

## 1. 추적 규칙

모든 requirement는 milestone, work package, verification ID, planned test와 evidence에 연결돼야 한다.
코드 구현 후 링크가 없는 requirement 또는 requirement 없는 production 코드가 있으면 qualification을 차단한다.

## 2. 요구사항군 추적

| Requirement group | Milestone | Work package | Verification | Evidence |
| --- | --- | --- | --- | --- |
| P13-FR-SCOPE-* | M0, M9 | WP-00, WP-09 | P13-BASE-05, P13-REL-05 | m0, release manifest |
| P13-FR-RUN-* | M1 | WP-01 | P13-RUN-* | p13-m1-unified-run-workspace.json |
| P13-FR-UX-* | M1 | WP-01 | P13-WS-*, P13-A11Y-* | m1, m9 |
| P13-FR-MC-* | M2 | WP-02 | P13-MC-* | p13-m2-model-check-repair.json |
| P13-FR-LM-* | M3 | WP-03 | P13-LM-* | p13-m3-load-mass-workspace.json |
| P13-FR-KDS-* | M4 | WP-04 | P13-KDS-* | p13-m4-kds-procedures.json |
| P13-FR-EDIT-* | M5 | WP-05 | P13-EDIT-*, STORY, GRID | p13-m5-practical-editors.json |
| P13-FR-RES-* | M6 | WP-06 | P13-RES-* | p13-m6-elastic-results-dashboard.json |
| P13-FR-REV/RPT/IMP-* | M7 | WP-07 | P13-REV/RPT/MGT-* | p13-m7-review-mgt.json |
| P13-FR-SHELL-* | M8 | WP-08 | P13-SHX/SHELL-GUARD-* | p13-m8-shell-lab.json |
| P13-NFR-DATA/NUM/COMPAT/ROLL-* | M0~M9 | 모든 WP | milestone contract/failure tests | 각 milestone evidence |
| P13-NFR-PERF/A11Y/SEC/OBS/TEST-* | M1~M9 | 관련 WP, WP-09 | P13-PERF/A11Y/SEC/REL-* | m9 release manifest |

## 3. 마일스톤 산출물 추적

| Milestone | Requirements | Planned tests | Review | Status source |
| --- | --- | --- | --- | --- |
| M0 | SCOPE, NFR-TEST/OBS | `tests/p13-m0-*` | P13-M0-CODE-REVIEW | IMPLEMENTATION_STATUS |
| M1 | RUN, UX, DATA | `tests/p13-m1-*` | P13-M1-CODE-REVIEW | IMPLEMENTATION_STATUS |
| M2 | MC, DATA, A11Y | `tests/p13-m2-*` | P13-M2-CODE-REVIEW | IMPLEMENTATION_STATUS |
| M3 | LM, DATA, PERF, SEC | `tests/p13-m3-*` | P13-M3-CODE-REVIEW | IMPLEMENTATION_STATUS |
| M4 | KDS, DATA, NUM | `tests/p13-m4-*` | P13-M4-CODE-REVIEW | IMPLEMENTATION_STATUS |
| M5 | EDIT, DATA, COMPAT | `tests/p13-m5-*` | P13-M5-CODE-REVIEW | IMPLEMENTATION_STATUS |
| M6 | RES, NUM, PERF, A11Y | `tests/p13-m6-*` | P13-M6-CODE-REVIEW | IMPLEMENTATION_STATUS |
| M7 | REV/RPT/IMP, SEC, ROLL | `tests/p13-m7-*` | P13-M7-CODE-REVIEW | IMPLEMENTATION_STATUS |
| M8 | SHELL, NUM, GUARD | `tests/p13-m8-*` | P13-M8-CODE-REVIEW | IMPLEMENTATION_STATUS |
| M9 | all mandatory | `tests/p13-m9-*`, full regression | P13-M9-FINAL-REVIEW | release manifest |

## 4. planned test families

- contract/schema: `p13-mN-contract.mjs`
- transaction/migration: `p13-mN-state.mjs`
- numeric/independent: `p13-mN-numeric.mjs`
- workflow/browser: `p13-mN-ui.mjs`, packaged smoke
- failure/security: `p13-mN-failure.mjs`
- evidence: `p13-mN-evidence-contract.mjs`

실제 파일명은 M0 inventory에서 확정하며 삭제·병합 시 traceability를 갱신한다.

## 5. 상태 규칙

| Requirement status | 의미 |
| --- | --- |
| planned | 계획·owner·verification이 존재 |
| implemented | production code와 focused test 존재 |
| integrated | UI/API/report 또는 해당 소비표면 연결 |
| qualified | mandatory evidence와 review PASS |
| blocked | 필수 source/environment/evidence 없음 |

`release-qualified`는 requirement 개별 상태가 아니라 claim profile의 최종 release 판정이다.

## 6. coverage gate

M9 runner는 다음을 기계적으로 검증한다.

- requirements 총수 = mapped requirement 총수
- verification ID 중복·고아 0
- mandatory test unclassified 0
- PASS evidence의 source revision·artifact hash 유효
- code review 문서의 open Critical/High 0
- UI/API/report capability와 manifest eligibility parity

수동 표 편집만으로 coverage를 PASS 처리하지 않는다.
