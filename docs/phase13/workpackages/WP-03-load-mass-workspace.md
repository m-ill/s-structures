# WP-03 — Load·Mass·수동 조합 Workspace

```yaml
milestone: P13-M3
status: implementation-complete
depends_on: [P13-M1, P13-M2]
release_impact: core-blocking
```

## 1. 목표와 사용자 결과

전역 D/L 숫자 입력을 실무 하중표와 모델 위 검토 흐름으로 바꾸고, 슬래브 면하중이 어느 부재로 얼마만큼
전달되는지 적용 전에 확인한다. 이 단계의 조합은 수동·프로젝트 승인 조합이며 자동 KDS 절차는 M4가 소유한다.

## 2. 재사용 자산

- `src/loads/massSource.js`, `slabLoadGeneration.js`, `loadCombinationChangeSet.js`
- `src/loads/loadAudit.js`, `loadsV2.js`, `loadCaseMetadata.js`
- `src/modeling/transaction.js`, selection/filter 자산
- Phase 10 `LG-01~04` slab load equilibrium·mass dedup evidence

## 3. 목표 데이터·UI

- Load Cases, Loads, Slab Panels, Mass Sources, Manual Combinations, Audit 탭
- case/source/story/zone/member/panel 기반 filter와 totals footer
- active/all case viewport layer, 방향·좌표계·value·source legend
- `LoadChangeSet`, `SlabPanelChangeSet`, `MassSourceChangeSet`의 공통 Preview/Apply/Undo
- CSV/clipboard value mapping; workbook formula·macro는 실행하지 않음

## 4. 작업 분해

### WP03-A. 공통 table·change-set

- schema column, unit parser, validation state와 row-level issue
- paste/fill/delete/scale/copy와 filtered selection scope
- generated/custom/imported ownership과 lock/conflict 정책
- 하나의 Apply는 하나의 stale event와 하나의 undo entry만 생성

### WP03-B. Load viewport

- nodal/member/temperature/settlement/area-derived 표시
- local/global 방향, partial range와 active case legend
- label collision·threshold·selected-only 모드
- viewport 합계와 table 합계 parity

### WP03-C. Slab Load Panel

- 4절점 panel 생성·edge 지원대상·1/2방향·D/L 등 case 지정
- tributary polygon, 삼각/사다리꼴 equivalent member load preview
- 보 없는 edge의 wall/direct-column fallback과 경고
- `qA`, transferred total, centroid moment와 residual audit
- generated key dedup과 user override 보존

### WP03-D. Mass Source

- self/member/load-case component와 factor table
- physical mass와 self-weight conversion double-count 검사
- 층별 mass·center preview, skipped/invalid row와 reason
- modal/RSA case가 선택 mass source snapshot을 참조

### WP03-E. Manual Combination

- strength/service/user/envelope group
- factor matrix, case coverage, duplicate·empty·orphan 검사
- project-approved 조합과 candidate/generated 조합을 구분
- KDS rule pack apply target interface는 제공하되 rule 계산은 M4에 둠

## 5. 검증·정량 수용기준

- P13-LM-01: table/viewport/solver/report total load parity 100%
- P13-LM-02: one-way/two-way fixture `Σ전달=qA` engineering tolerance PASS
- P13-LM-03: force·centroid moment equilibrium PASS
- P13-LM-04: generated reapply duplicate 0, custom silent overwrite 0
- P13-LM-05: physical member mass·self-weight mass double count 0
- P13-LM-06: mass preview와 assembled mass parity 100%
- P13-LM-07: failed/cancelled change-set model hash 변화 0
- P13-LM-08: CSV unit/direction/unmapped column 미검출 0
- P13-LM-09: formula/macro execution 0
- P13-LM-10: 250 panel preview p95 2초 이하, cancel acknowledgement 2초 이하
- P13-LM-11: save/reopen logical parity 100%
- P13-LM-12: load edit당 stale event exactly one

## 6. failure injection·보안

- self-intersecting panel, missing support edge, duplicate generated key
- unknown unit, mixed delimiter/encoding, oversized paste와 invalid number
- Apply 도중 validation error/cancel과 undo stack failure
- mass source가 missing case 또는 shell experimental load를 참조

실패는 partial model mutation 없이 row·source 단위 reason을 반환한다.

## 7. evidence·완료판정

- `p13-m3-load-mass-workspace.json`
- LG-01~04 parity, browser selection, migration와 report total PASS
- UI가 Slab Load Panel을 shell design으로 오인시키지 않을 때 `qualification-complete`

## 8. 비범위·잔여 위험

- KDS 공식 자동값 계산과 source approval은 M4
- shell FEM meshing·plate local result는 M8
- arbitrary Excel formula evaluation과 live workbook link는 비범위

## 9. 2026-08-05 실제 UI 통합 결과

- 실제 index 워크벤치의 `하중·질량` 영역을 Load Cases, Loads, Slab Panels, Mass Sources, Manual Combinations, Audit의 6개 탭으로 연결했다.
- Slab Panel은 generated load 변경, `qA` force, centroid moment, duplicate key와 user override 충돌을 Apply 전에 검토한다.
- Apply와 마지막 변경 Undo를 각각 하나의 model transaction과 하나의 stale 전환으로 처리하며 자동 재해석하지 않는다.
- 수동 조합 편집은 KDS·import 등 generated 조합 ID를 잠그고 그대로 보존한다. 수동 조합만 교체하며 empty·duplicate·orphan factor를 차단한다.
- CSV/clipboard 입력은 행 검토까지만 수행하며 formula·macro를 실행하지 않는다.
- `tests/p13-m3-index-load-workspace-ui.mjs`에서 6-tab UI, slab Apply, generated 조합 보존, Undo, unsafe paste 차단을 검증했다.
- viewport/solver/report total-load resultant audit, mass-source 조립 parity, 250-panel 성능과 save/reopen logical parity를 추가해 M3를 `implementation-complete`로 전환했다. Packaged full regression 자격은 M9에서 판정한다.
