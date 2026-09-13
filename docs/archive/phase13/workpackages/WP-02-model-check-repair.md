# WP-02 — Model Check & Repair Center

```yaml
milestone: P13-M2
status: in-progress
depends_on: [P13-M1]
release_impact: core-blocking
```

## 1. 목표와 사용자 결과

해석 전에 잘못된 모델을 구체적인 객체와 위치로 찾고, 안전한 항목만 미리보기 후 원자적으로 수정한다.
사용자는 오류 개수만 보는 대신 무엇이 왜 문제인지와 다음 행동을 확인한다.

## 2. 재사용 자산

- `src/core/validation.js`, `validationHealth.js`
- `src/modeling/repair.js`, `transaction.js`, `selection.js`
- `src/loads/loadAudit.js`
- sparse singularity·mechanism diagnostics, equilibrium audit와 Phase 10 BM battery

## 3. 목표 계약

`ModelIssue` 필수 필드:

```text
issueId, code, severity, category, source,
objectRefs[], storyId, geometryHint, messageKey, parameters,
ruleRef, detectedAtModelHash, fixability, proposedFixId,
waiverStatus, blockerFor[]
```

issue ID는 model hash와 안정적인 object/code key에서 결정적으로 생성한다.

## 4. 작업 분해

### WP02-A. checker registry

- geometry: duplicate, zero-length, orphan, disconnected, crossing-unjoined
- property: material/section/local-axis/release/offset/panel-zone
- support/constraint: insufficient restraint, mechanism, diaphragm/MPC cycle
- story: elevation, membership, unassigned nodes
- load/mass/combo: orphan, duplicate, double self-weight, unit/direction, missing case
- analysis preflight: capability/unsupported combination

### WP02-B. Issue Center UI

- severity/category/story/object/search filter
- issue row→select/isolate/zoom→context inspector
- blocker/warning/waived 상태를 색+icon+text로 표시
- issue detail에 rule, affected run, report link와 manual next step 제공

### WP02-C. repair registry

- auto-safe: unused orphan purge, exact duplicate merge 후보, generated duplicate cleanup 등 M0 승인 목록
- review-required: support, release, section, local axis, diaphragm 재배정
- preview에 삭제·merge·reference remap·issue delta와 affected result 표시
- Apply 하나=transaction 하나=Undo 하나

### WP02-D. waiver·provenance

- warning waiver는 reviewer, reason, timestamp, revision/model hash와 결속
- model change 후 해당 check를 재실행하고 stale waiver를 자동 재사용하지 않음
- issue와 waiver를 run/report/Agent API에서 동일 ID로 노출

## 5. 검증·정량 수용기준

- P13-MC-01: BM/load-audit golden fixture expected issue recall 100%
- P13-MC-02: blocker false green 0
- P13-MC-03: 동일 model hash의 issue ID·정렬 결정성 100%
- P13-MC-04: objectRef 없는 location-required issue 0
- P13-MC-05: issue click target parity 100%, p95 250 ms 이하
- P13-MC-06: repair preview diff와 applied diff parity 100%
- P13-MC-07: Undo 후 model hash 원상복구 100%
- P13-MC-08: failed repair partial mutation 0
- P13-MC-09: stale waiver 자동 승인 0
- P13-MC-10: UI/API/report issue·severity·status parity 100%

## 6. failure injection

- repair 중 validation failure, reference conflict, worker cancel
- 삭제 대상이 다른 collection에서 참조됨
- issue 선택 중 object가 concurrent edit로 사라짐
- waiver 이후 model revision 변경

모든 경우 model과 마지막 current run을 보존하고 명확한 reason code를 반환한다.

## 7. evidence·완료판정

- `p13-m2-model-check-repair.json`
- auto-safe 목록의 독립 code review와 undo/migration/browser E2E PASS
- blocker가 preflight를 우회하지 못할 때 `qualification-complete`

## 8. 비범위·잔여 위험

- 구조 시스템을 자동으로 설계하거나 지점을 추론해 확정하지 않는다.
- near-singular warning은 원인을 좁혀도 공학 판단을 대신하지 않는다.

## 9. 2026-08-05 UI 통합 결과

- 실제 실무 워크벤치의 `모델 검토` 영역에 severity/search 필터, 이슈 선택, 객체 선택 연동과 Inspector를 연결했다.
- repairable issue는 변경 목록·before/after hash·예상 issue delta를 미리 본 뒤 한 transaction으로만 적용한다.
- Apply 뒤 기존 탄성해석 케이스를 즉시 `Stale`로 만들며 자동 재해석하지 않는다.
- Undo는 수정 전 model hash를 복원하고, 복원된 hash를 기준으로 기존 run의 Current 여부를 다시 판정한다.
- warning Waiver는 검토자·사유·시각·revision·model hash·project ID와 결속하며, model hash 변경 뒤 자동 승인되지 않는다.
- `tests/p13-m2-index-model-check-ui.mjs`에서 preview/apply/stale/undo/waiver 만료를 검증했고 실제 앱에서 clean-model 0 issue와 반응형 UI를 확인했다.
- `getPhase13ModelCheck`, `getPhase13IssueWaivers`를 Bridge·Agent API read surface에 추가하고 detailed report·calculation package에 동일 snapshot을 삽입했다.
- `tests/p13-m2-agent-report-parity.mjs`에서 UI·Agent API·보고서의 issue ID, severity, waiver가 100% 동일함(P13-MC-10)을 검증했다.
- 제품 코드와 전용 evidence는 `implementation-complete`다. packaged restart·접근성·전체 회귀·office qualification은 별도 release gate에서 계속 차단한다.
