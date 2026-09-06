# Phase 11 Requirements Traceability

```yaml
version: p11-traceability-v1
status: planned
reviewed_at: 2026-07-23
```

## 1. 추적 규칙

모든 요구사항은 다음 chain을 가진다.

```text
requirement
→ architecture/ADR
→ milestone/WP
→ production owner
→ verification IDs
→ evidence artifact/hash
→ release decision
```

계획 단계의 상태는 `planned`다. 코드가 존재한다고 자동으로 `qualified`가 되지 않는다.

## 2. 요구사항군 추적

| 요구사항 | Architecture/ADR | M/WP | Owner | Verification | Evidence |
| --- | --- | --- | --- | --- | --- |
| P11-FR-DATA-01~05 | Target §2.1, ADR-001 | M1/WP-01 | report contracts | DATA-01~10 | `p11-m1-*.json` |
| P11-FR-VER-01~05 | Target §2.2 | M1/WP-01 | report verdict | RPT-01~03, DATA | `p11-m1-*.json` |
| P11-FR-I18N-01~07 | Target §4, ADR-001 | M2/WP-02 | report i18n | I18N-01~12, PAR-01~06 | `p11-m2-*.json` |
| P11-FR-CAP-01~09 | Target §2.3~2.4, §5, ADR-002 | M3~M4/WP-03~04 | visual evidence | CAP-01~24 | `p11-m3-*.json`, `p11-m4-*.json` |
| P11-FR-RPT-01~09 | Target §6 | M4~M5/WP-04~05 | report render | RPT-04~22, A11Y | `p11-m4-*.json`, `p11-m5-*.json` |
| P11-FR-EXP-01~09 | Target §7~8 | M6/WP-06 | export service/desktop | PDF, SEC, FAIL | `p11-m6-*.json` |
| P11-FR-UI-01~02 | Target §7~8 | M7/WP-07 | report UI | UI-01~12 | `p11-m7-*.json` |
| P11-FR-API-01~02 | Target §7~8 | M7/WP-07 | Agent/API | API-01~12, PAR-08 | `p11-m7-*.json` |
| P11-NFR-01, 11 | Target §2, §10 | M1~M9 | contracts/release | DATA, PAR, E2E | 각 milestone evidence |
| P11-NFR-02~05 | Target §7~8 | M8/WP-08 | export qualification | PERF-01~10 | `p11-m8-*.json` |
| P11-NFR-06~07 | Target §5~6 | M5, M8 | render/QA | VIS, A11Y | `p11-m5-*.json`, `p11-m8-*.json` |
| P11-NFR-08~10 | Target §8~9 | M6, M8 | export/security | SEC, FAIL | `p11-m6-*.json`, `p11-m8-*.json` |
| P11-NFR-12 | Target §3, §7 | M0, M6 | architecture owner | REL-01, SEC | ADR/evidence |

## 3. 마일스톤 산출물 추적

| M | 필수 코드/문서 | 필수 test | 필수 evidence | release 영향 |
| --- | --- | --- | --- | --- |
| M0 | scope, ADR, retention, manifest skeleton | `p11-m0-*` | baseline governance | 후속 착수 |
| M1 | snapshot/verdict | `p11-m1-*` | hash/verdict matrix | truthfulness |
| M2 | i18n/dual HTML | `p11-m2-*` | translation/parity | locale readiness |
| M3 | capture core/manifest | `p11-m3-*` | capture invalid matrix | visual readiness |
| M4 | 7 scenes/embedding | `p11-m4-*` | scene coverage | report evidence |
| M5 | executive layout | `p11-m5-*` | page raster/structure | report candidate |
| M6 | dual PDF service | `p11-m6-*` | PDF/security/failure | export candidate |
| M7 | UI/Agent workflow | `p11-m7-*` | plan/result parity | product candidate |
| M8 | qualification | `p11-m8-*` | visual/perf/security | release candidate |
| M9 | office pilot/release | `p11-m9-*` | final manifest | release decision |

## 4. Requirement 상태

| 상태 | 의미 |
| --- | --- |
| `proposed` | 제안됐으나 authoritative plan 미반영 |
| `planned` | plan, owner, milestone, verification이 정의됨 |
| `implemented` | production code와 focused test가 존재 |
| `integrated` | UI/Agent/export product surface에 연결 |
| `qualified` | 필수 환경·evidence·review·release gate PASS |
| `blocked` | 외부입력·환경·결정 미충족 |
| `rejected` | ADR로 제외 |

P11 요구사항은 M9 release manifest 기준으로 모두 `qualified`다. 보고서 기능 qualification은
구조공학적 독립 교차검증을 대신하지 않으며 `CONDITIONAL_PASS` 제한을 유지한다.

## 5. Evidence registry 요구사항

- artifact path만 아니라 SHA-256과 source revision 기록
- snapshot/evidence/artifact hash chain 재계산 가능
- actual/reference/tolerance와 recomputed error 저장
- environment profile에 OS, Electron/Chromium, font, PDF renderer 기록
- raw PNG/PDF와 tracked summary/hash를 분리
- missing raw artifact는 release evidence에서 `BLOCKED`
- artifact 갱신은 기존 evidence를 조용히 덮어쓰지 않고 run ID를 남김

## 6. Code review 추적

마일스톤 review는 `docs/phase11/reviews/P11-MN-CODE-REVIEW.md`에 다음을 기록한다.

```yaml
review:
date:
verdict:
milestone_status:
dedicated_gate:
full_regression:
release_qualification:
release_qualified:
critical_findings_open:
high_findings_open:
evidence_artifact:
evidence_records:
artifact_hash:
```

review 본문은 correctness, security/privacy, performance/memory, API/Agent/UI/report 영향,
test gap, 잔여 위험과 해결 commit을 포함한다.

## 7. 변경관리

- requirement 추가·삭제는 requirements, architecture, milestone, matrix, traceability, risk를 함께 갱신
- 필수 scene 축소, verdict 완화, budget 완화는 사용자 판단과 ADR 필요
- locale text 변경은 key parity와 양 언어 regression 필요
- report schema 변경은 version bump와 migration test 필요
- public API 변경은 Agent manifest와 user manual 동시 갱신

## 8. 최종 coverage gate

다음 중 하나라도 있으면 release 차단:

- owner/milestone/verification 없는 requirement
- hash 또는 source revision 없는 evidence
- 필수 scene/PDF/raw artifact 누락
- ko/en snapshot 또는 numeric parity 불일치
- open Critical/High
- stale documentation/API manifest
- release manifest와 실제 파일 hash 불일치
- Phase 10 eligibility를 근거 없이 승격한 report
