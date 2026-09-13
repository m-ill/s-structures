# WP-09 — Office Pilot·Release Gate

```yaml
milestone: P13-M9
status: implementation-complete-qualification-blocked
depends_on: [P13-M1, P13-M2, P13-M3, P13-M4, P13-M5, P13-M6, P13-M7]
separate_capability_input: P13-M8
release_impact: final-phase-gate
```

## 1. 목표와 허용 claim

source와 Windows 배포물에서 대표 업무를 반복 수행하고 workflow, 수치무결성, 성능, 접근성, 보안, 실패복구와
사용성을 판정한다. 통과 시 허용되는 claim은 다음으로 제한한다.

> 지원 범위의 자체 탄성 프레임 해석을 위한 단일 PC·loopback-only 구조사무소 파일럿.

## 2. 필수 E2E 시나리오

1. RC 사무소: story/diaphragm, D/L, mass, static/modal/RSA, drift와 package
2. 철골 창고: release/offset, wind, Direct P-Delta, buckling과 governing member
3. 반복층 골조: story copy/edit, CM/CR·eccentricity, revision comparison
4. slab distributor: 1·2방향 panel, qA·mass conservation, manual/KDS combination
5. limited MGT: preview, mapping issue, atomic import, repair, run, diff
6. pathological model: blocker detection, safe repair, rerun과 report
7. shell: 별도 experimental containment 시나리오이며 Core claim을 높이지 않음

각 Core 시나리오는 source와 unpacked release에서 독립 state root로 3회 연속 수행한다.

## 3. 작업 분해

### WP09-A. Pilot corpus·task script

- 익명·재배포 가능한 fixture와 known result/issue
- task, expected outcome, stop condition과 reviewer form
- raw input hash, project revision, run/report/evidence hash

### WP09-B. 실무 사용자 gate

- 목표: 구조 실무자 최소 3명
- 핵심 task 성공률 100%, 전체 task 성공률 90% 이상
- false green, 데이터 손실, 잘못된 governing 결과 0
- M0 기준 대비 핵심 workflow 중앙시간 20% 이상 단축
- 오류 후 수정→재실행→package 성공률 100%
- P0/P1 UX finding 0, 남은 Medium은 owner·기한 보유

사용자 수 확보가 안 되면 `pilot-accepted`와 `frameElasticOfficePilotAllowed`는 false를 유지한다.

### WP09-C. 성능·soak

M0에서 reference device와 fixture를 고정하고 warm-up 1회 후 5회 median/p95/peak memory를 기록한다.

| 항목 | provisional gate |
| --- | ---: |
| local app initial display | p95 ≤ 3 s |
| S-tier Model Check | p95 ≤ 2 s |
| S-tier first-order elastic run | p95 ≤ 5 s |
| load/slab preview | p95 ≤ 2 s |
| bulk Apply | p95 ≤ 3 s |
| cached result open | p95 ≤ 500 ms |
| input/filter/chart acknowledgement | p95 ≤ 100 ms 목표; M6 table은 200 ms 상한 |
| first progress | ≤ 1 s |
| cancel acknowledgement | ≤ 2 s |
| S-tier report export | p95 ≤ 30 s |
| S-tier peak working set | ≤ 1 GiB |

- S-tier는 약 1,000 frame member, 2,000+는 review-required, 4,000은 long-run evidence 없이는 claim 금지
- M0 대비 p95 또는 memory 10% 초과 악화는 승인된 ADR 없이는 차단
- 50회 edit→run→review cycle 후 unreleased resource 증가 10% 이하

### WP09-D. 접근성·화면

- WCAG 2.2 AA 목표, automated serious/critical 0
- keyboard-only 핵심 workflow, focus ring/restore와 drag alternative
- 1280×720, 1366×768, 1920×1080, 2560×1440
- Windows 125%·150%, 200% zoom과 reduced motion
- 색 외 상태표현, chart equivalent table, NVDA+Chromium smoke

### WP09-E. 보안·운영·rollback

- Phase 12 CSP/nosniff/auth/loopback/data-secrets separation 재실행
- import/report HTML·SVG/CSV injection, size/resource/path tests
- 사용자 승인 없는 network request와 외부 solver process 0
- clean install, restart, backup/restore와 N-1 portable rollback
- source/release dependency SBOM·license·artifact hash

## 4. 자동 release gate

- P13-REL-01: M0~M7 requirement/evidence/review hash complete
- P13-REL-02: Phase 7~12 mandatory regression fail/timeout/flaky/unapproved skip 0
- P13-REL-03: Core E2E source/release 각 3회 PASS
- P13-REL-04: run/status/value/report parity 100%
- P13-REL-05: open Critical/High 0
- P13-REL-06: performance/accessibility/security budgets PASS
- P13-REL-07: clean install/restart/backup/restore/N-1 rollback PASS
- P13-REL-08: `openSeesRuntimeUsed=false`, external solver process/network 0
- P13-REL-09: shell design-transfer 우회 0, eligibility parity 100%
- P13-REL-10: release manifest가 source/build/evidence/artifact hash 재검증

## 5. release manifest 판정

다음 필드를 독립 판정한다.

```json
{
  "claimProfile": "LOCAL_LOOPBACK_FRAME_ELASTIC_OFFICE_PILOT",
  "workflowReleaseQualified": false,
  "frameElasticOfficePilotAllowed": false,
  "engineeringCrossValidationQualified": false,
  "finalDesignTransferAllowed": false,
  "shellExperimentalViewAllowed": false,
  "shellDesignTransferAllowed": false,
  "openSeesRuntimeUsed": false,
  "externalSolverRuntimeDependency": false,
  "nonlinearInScope": false
}
```

누락·timeout·BLOCKED·unapproved SKIP은 PASS가 아니다. M8 containment가 green이면 shell view만 experimental로 열 수 있으며 shell 설계전이는 false를 유지한다.

## 6. evidence·완료판정

- `verification/evidence/validation/phase13/p13-release-manifest.json`
- pilot forms, performance/accessibility/security/rollback artifacts와 final review
- 모든 Core gate와 owner sign-off가 있어야 `release-qualified`

## 7. 비범위·잔여 위험

- 공개 인터넷, LAN 다중사용자, 최종 인허가 제출
- general commercial release claim
- shell·nonlinear·detailed design의 production 자격

## 8. 2026-08-05 구현 결과

- P13-REL-01~10 fail-closed gate와 manifest hash parity를 UI·Agent·보고서에 연결했다.
- 실제 Release Gate에서 REL-05·08·09만 PASS이고 REL-01·02·03·04·06·07·10은 BLOCKED임을 확인했다.
- 전체 회귀·pilot·parity/NFR·설치/복구·manifest integrity와 독립 교차검증 전에는 release를 승인하지 않는다.
