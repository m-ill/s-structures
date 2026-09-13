# WP-07 — 검토 패키지·revision·제한된 MGT Import

```yaml
milestone: P13-M7
status: implementation-complete
depends_on: [P13-M2, P13-M3, P13-M4, P13-M5, P13-M6]
release_impact: core-conditional
```

## 1. 목표와 사용자 결과

현재 모델·run·issue에서 계산서와 검토도면을 만들고 revision 변경의 영향을 추적한다. MGT는 최초 frame/truss
subset만 자체 parser로 읽으며 지원하지 않는 record를 숨기지 않는다.

## 2. 재사용 자산

- Phase 11 `ReportSnapshot`, capture, production report와 qualification
- Phase 12 revision/approval/stale/audit·backup 계약
- `src/report/calculationPackage.js`
- `src/platform/importExportContract.js`, import candidate/review pattern
- 기존 MGT exporter의 실제 지원 subset

## 3. 작업 분해

### WP07-A. Review Package

- section composer: project/model/check/load/run/result/limitation/appendix
- live preview와 최종 immutable report snapshot
- plan/elevation의 member mark, load, reaction, utilization, issue layer
- PDF/SVG/DXF/CSV/JSON artifact manifest·hash
- current/stale/historical watermark와 export eligibility

### WP07-B. Revision Diff·Review Issue

- model/material/section/support/release/load/mass/combo/criteria/run/result diff
- add/delete/change/mapping-change와 governing change 구분
- issue owner/status/action/closure/reason/history
- model revision 변경 시 approval·review package stale
- 과거 승인 package와 artifact는 immutable 보존

### WP07-C. MGT lexer/parser

- source version/encoding/unit/block/line provenance
- resource limit가 있는 lexer, AST와 block registry
- 파일 내용으로 subprocess·external application·macro를 실행하지 않음
- malformed/truncated/oversized/unknown block fail-closed

### WP07-D. Mapping·Preview

- 필수 최초 subset: node, frame/truss member, support, material, section, nodal/member basic load
- 조건부 subset: release, offset, rigid link, load combination은 fixture와 parity가 있는 항목만
- wall/shell, nonlinear, design result와 unknown constraint는 unsupported로 보존
- unit/axis/local-axis/ID/property/load mapping diff와 unresolved blocker
- ImportCandidate를 새 draft revision에만 원자 commit

### WP07-E. Round-trip·수치 검토

- own exporter supported subset의 import→export topology/property/load parity
- imported model의 Model Check·self solver run과 report provenance
- 외부 해석 실행은 금지; 독립 fixture artifact는 offline reference로만 사용

## 4. 검증·정량 수용기준

- P13-REV-01: model/load/criteria/result diff golden parity 100%
- P13-REV-02: revision 변경 후 current approval/package stale 100%
- P13-RPT-01: package artifact run/report hash parity 100%
- P13-RPT-02: stale current package 발행 0, partial final artifact 0
- P13-RPT-03: required plan/elevation layer와 limitation 누락 0
- P13-MGT-01: supported fixture mapping loss 0
- P13-MGT-02: unsupported/approximated record·source line 노출 100%
- P13-MGT-03: unresolved material/section commit 0
- P13-MGT-04: cancel/failure current project hash 변화 0
- P13-MGT-05: source hash/encoding/unit/parser version 기록 100%
- P13-MGT-06: supported subset round-trip topology/property/load parity 100%
- P13-SEC-IMP-01: path traversal/code/macro/formula execution 0

## 5. failure injection·보안

- hostile encoding, huge count, deep/recursive record, duplicate ID와 NaN/overflow
- path-like text, HTML/SVG injection, CSV formula injection
- disk full/report renderer crash/import commit conflict
- parse 뒤 model revision이 변경된 stale candidate Apply

실패 시 임시 revision·artifact만 정리하고 current model/run/review history를 보존한다.

## 6. migration·rollback

- Import는 기존 revision을 덮지 않고 새 draft revision을 생성한다.
- feature flag off에서도 imported canonical model은 보존·열람 가능해야 한다.
- review/package schema는 additive migration과 N-1 reader 정책을 가진다.
- downgrade가 새 schema를 파괴할 수 있으면 자동 downgrade하지 않고 recovery copy를 만든다.

## 7. evidence·완료판정

- `p13-m7-review-mgt.json`
- parser fuzz/resource tests, round-trip, browser preview, report render와 privacy scan PASS
- 최초 subset 밖 record를 지원한다고 주장하지 않을 때 `qualification-complete`

## 8. 비범위·잔여 위험

- MGT 전체 문법과 모든 MIDAS 버전·요소·설계결과
- external application round-trip 자동화
- BIM/DWG 전체 import와 최종 구조도면 자동생성

## 9. 2026-08-05 구현 결과

- Immutable review package, canonical revision diff와 제한 MGT candidate/draft workflow를 실제 검토·보고서 UI에 통합했다.
- parser resource budget, source provenance, unsupported record 보존과 deterministic round-trip을 검증했다.
- 현재 모델 직접 변경과 외부 application·subprocess·formula·macro 실행을 모두 차단한다.
