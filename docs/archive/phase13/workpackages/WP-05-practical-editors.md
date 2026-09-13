# WP-05 — 실무 모델·층·부재 편집기

```yaml
milestone: P13-M5
status: implementation-complete
depends_on: [P13-M1, P13-M2]
release_impact: core-blocking
```

## 1. 목표와 사용자 결과

Phase 10에 구현된 고급 탄성 속성을 JSON이나 Agent API 없이 선택·표·viewport에서 만들고 검토한다.
층과 다이어프램 입력을 먼저 안정화해 M6 결과가 실제 사용자 입력과 연결되게 한다.

## 2. 재사용 자산

- `src/modeling/gridStory.js`, `transaction.js`, `selection.js`
- `src/ui/indexNativeModeler.js`, `phase7ModelingWorkflow.js`, `phase7LibraryWorkflow.js`
- `src/solver/partialFixity.js`, `panelZone.js`, `taperedMember.js`
- `src/solver/domain/constraintSystem.js`, diaphragm core와 story/center modules
- Phase 10 schema/domain/result/report contracts

## 3. 공통 data-grid

- schema-driven column, editor, unit parser, validation과 error cell
- virtualization, search/filter/sort, copy/paste/fill, multi-select
- object ID·story·role·material·section·support/release filter
- table↔viewport selection/focus 동기화
- batch preview에 scope, row count, old/new, validation·stale 영향 표시

data-grid primitive는 M3·M4·M6도 재사용하며 별도 구현을 만들지 않는다.

## 4. 작업 분해

### WP05-A. Member/Node inspector

- material, section, role, orientation/local axis
- support, spring, settlement와 prescribed displacement
- binary release와 partial-fixity rotational spring 구분
- Timoshenko enable·section shear area provenance

### WP05-B. Advanced elastic geometry

- 3D offset, insertion point, rigid factor와 viewport rigid-arm glyph
- panel-zone property와 connected member 영향 preview
- MPC/rigid link master/slave, cycle check와 glyph
- tapered section endpoints/variation과 support 범위

### WP05-C. Story manager

- story ID/name/elevation/height/range, copy/visibility/lock
- story elevation metadata 수정과 node geometry 이동을 별도 command로 구분
- floor selection/isolation과 orphan story membership check

### WP05-D. Diaphragm manager

- rigid/semi-rigid group, master/slave assignment과 generated members
- mass source와 modal/RSA capability 연결
- CM/CR, eccentricity, principal axis와 unassigned node overlay
- conflicting/overlapping/cycle assignment preflight

### WP05-E. 저장·migration·Agent parity

- UI property input과 existing Agent action/API field parity
- save/reopen/migration round-trip
- feature flag off 시 field 보존, 표시만 legacy 경로로 전환

## 5. 검증·정량 수용기준

- P13-EDIT-01: 지원 Phase 10 field의 UI edit coverage 100%
- P13-EDIT-02: UI→model→solver fixture와 Agent-created fixture 수치 parity 100%
- P13-EDIT-03: feature unused 기존 fixture 수치 drift 0
- P13-EDIT-04: invalid batch partial apply 0
- P13-EDIT-05: Undo 후 model hash 원상복구 100%
- P13-EDIT-06: save/reopen/migration field loss 0
- P13-EDIT-07: table↔viewport object selection parity 100%
- P13-EDIT-08: story geometry/meta command 오동작 0
- P13-EDIT-09: diaphragm unassigned/overlap/cycle false green 0
- P13-EDIT-10: 1,000 row paste·validate p95는 M0 기준 대비 실무 budget 통과

## 6. fail-closed·failure injection

- unsupported release+P-Delta/buckling, invalid partial spring와 offset geometry
- MPC cycle, deleted master, overlapping diaphragm와 missing mass source
- ID rename reference conflict, unit overflow, mixed valid/invalid batch

미지원 조합은 solver에 전달하지 않고 reason code와 object list를 보여준다.

## 7. evidence·완료판정

- `p13-m5-practical-editors.json`
- Phase 10 dedicated regression parity, browser E2E와 project round-trip PASS
- 주요 속성을 개발자 도구 없이 생성·검토할 수 있을 때 `qualification-complete`

## 8. 비범위·잔여 위험

- arbitrary BIM property editor와 범용 CAD constraint system
- nonlinear hinge/fiber property UI 확장
- 자동 구조시스템 설계와 section optimization

## 9. 2026-08-05 구현 결과

- 부재·절점·층·diaphragm Preview/Apply/Undo, allowlist와 stale/부분 적용 차단을 실제 Practical Editors UI에 통합했다.
- diaphragm master/slave 누락·중복·cycle을 차단하고 표/viewport 선택 ID를 공유한다.
- 1,000-row preview 성능 검증을 통과했다.
