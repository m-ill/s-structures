# P17-M0 Code & Artifact Review Addendum R3

```yaml
reviewed_at: 2026-08-28
milestone: P17-M0
review_revision: 3
baseline_evidence_revision: 2
status: COMPLETE_WITH_SOURCE_BLOCKERS
m1_entry_allowed: true
release_allowed: false
final_design_transfer_allowed: false
solver_runs_in_scope: 0
```

## 결론

P17-M0의 목적은 공식 21개를 해석해 PASS시키는 것이 아니라 이후 검증에서 사용할 source custody, 판본 권위, 사례 순서, 역사 산출물과 claim 경계를 동결하는 것이다. 이 기술 계약은 닫혔고 P17-M1 framework 개발은 시작할 수 있다. 다만 독립 승인과 STRIX raw runtime provenance가 없으므로 제품 release와 최종 설계 전용은 계속 금지한다.

R2 baseline은 append-only로 유지한다. 이 R3 addendum과 `p17-m0-validation-closure-r3.json`은 R2를 삭제하거나 판정값을 바꾸지 않고, 구현 재현성·보고서 QA·blocker 의미를 보충한다.

## 재현 가능한 원자료 대조 결과

| 감사 항목 | 결과 | claim 한계 |
| --- | --- | --- |
| 공식 source manifest | 51/51, 4,613,613 B, mismatch 0 | 공개 파일 custody 검증 |
| 공식 case lock | 21/21, manual 순서·해시 고정 | 구조해석 PASS 아님 |
| HTML metadata presence | 42/42 | title·verdict 존재 확인 |
| HTML scalar presence | 393/393 | STRIX·Reference·Δ 표시 문자열 존재 확인 |
| HTML ordered result-row sequence | 131/131 | catalog 순서대로 증가하는 visible-text match offset을 요구 |
| case PDF global text value presence | 391/393 | document-global text presence이며 row-local PDF parity 아님 |
| manual locked start-page title | 21/21 | 목차가 아니라 lock의 본문 시작 PDF page index에서 확인 |
| SH1 시각 검토 | 마지막 PCHIP 2개 행 불완전 표시 | row 10은 label만 보이고 row 11은 표에서 보이지 않음 |

정본 감사 산출물은 `verification/evidence/validation/phase17/p17-m0-source-value-presence-audit-r3.json`이다. 최초 R1은 document-global PDF presence를 완전 전사처럼 표현하고 SH1 clipping을 한 행처럼 축소했다. R2는 claim을 좁혔지만 HTML 행의 페이지 내 존재만 확인해 순서를 강제하지 않았다. R3는 각 행의 증가하는 match offset을 기록하고 R2 경로·파일 해시·audit hash·정정 이유를 보존한다.

R2 source lock의 `contentAudit` 세 필드는 별도 시각·manual 대조에서 사실과 일치했지만, 동일 수준의 재현 가능한 행별 evidence가 lock 안에 보존되지 않았다. 따라서 `p17-m0-r2-claim-qualification-r1.json`이 해당 세 필드를 현재 proof로 직접 인용하지 못하게 제한하고 R3 audit의 좁은 claim으로 대체한다. R2의 source hash·locator·page count·ordinal·runtime provenance는 계속 정본이다.

## 코드리뷰 finding 폐쇄

| ID | finding | 조치 | 상태 |
| --- | --- | --- | --- |
| CR-01 | 기준 HEAD만 기록해 dirty P17 구현을 재현할 수 없음 | R3 closure에 `baseRevision`, worktree status digest와 P17 코드·schema·문서·evidence·report 전체 content inventory를 결속 | CLOSED IN R3 CLOSURE |
| CR-02 | required key 위주의 얕은 schema 검사 | dependency-free validator mechanics를 확장하고 R3 content audit·claim qualification·final manifest·closure nested records를 엄격히 계약화. 기존 R2 registry/lock/baseline의 일부 깊은 객체는 exact rebuild equality와 targeted assertions로 방어하며 완전 JSON Schema라고 주장하지 않음 | CLOSED FOR M0 BY LAYERED VALIDATION |
| CR-03 | 기본 test가 외부 sibling bundle에 하드 의존 | hermetic 기본 `npm test`와 외부-artifact `npm run test:p17`/`test:release:p17`을 분리하고 `P17_SOURCE_ROOT` 지원 | CLOSED BY CI POLICY |
| CR-04 | G05~G08 의미 검사가 얕음 | authority 문구·정확한 discrepancy ID·현재 파일 hash/size·정확한 역할/vocabulary를 검증; 독립 assignment는 G09에서 release-only blocker로 유지 | CLOSED |
| CR-05 | source-lock 폴더 extra entry를 놓침 | 모든 directory entry가 예상 21개 regular file인지 검사하고 extra directory negative test 추가 | CLOSED |
| CR-06 | `--check`가 snapshot directory를 생성 | directory 생성은 write mode로 제한 | CLOSED |
| AR-01 | HTML evidence parser가 마지막 동일 라벨에 의존 | 정확히 하나의 `dl.bm-evidence` scope와 각 필드 1개를 요구; footer/부록 동일 라벨 회귀 test 추가 | CLOSED |
| AR-02 | report runtime·source screenshot 재현성이 약함 | dependency exact pin, `P17_SOURCE_ROOT`, evidence/source PDF hash fail-closed 검사와 final-vs-fresh Markdown·추출 text·9쪽 pixel identity 검사를 추가. ReportLab metadata/trailer ID 때문에 PDF container byte identity는 주장하지 않고 sealed R2 hash를 보존 | CLOSED FOR CUSTODY AND SEMANTIC REPRODUCTION |
| AR-03 | visual QA가 최초 manifest에서 PENDING이고 tmp screenshot을 참조 | visual QA closure와 content-addressed 영구 PNG를 final R3 manifest로 결속 | CLOSED IN FINAL MANIFEST R3 |

## Gate 의미 검토

- `G05`: acceptance truth, STRIX published snapshot, archival narrative, runtime provenance, catalog와 MIDAS lane 여섯 역할을 모두 확인한다.
- `G06`: 단순 9개 개수가 아니라 `P17-D001`~`P17-D009` 정확한 순서를 확인한다.
- `G07`: Phase15 현재 JSON·Markdown·PDF의 실제 파일 hash·size를 다시 계산하고 content-addressed snapshot을 별도 검사한다.
- `G08`: 다섯 역할과 claim vocabulary의 정확한 목록을 검사한다. 독립 reviewer가 미배정인 상태를 PASS로 간주하지 않으며 별도 `G09=BLOCKED_RELEASE_ONLY`가 release를 차단한다.

## Blocker 재분류

R2 baseline과 PDF 9쪽의 flat `blockers` 목록은 보수적인 당시 표현이다. 다음처럼 해석해야 한다.

### Active release blockers

- 독립 reviewer 4개 역할(reference/model/numerical/structuralRelease) 승인 미완료
- STRIX raw record·evidence archive·published SHA 미공개

### Case-specific acceptance blockers

- `SB10` tolerance 정밀도 충돌
- 실제 사례별 독립 기준·모델 동등성·수치 허용오차 미승인
- 향후 해당 사례에서 요구되는 element·algorithm·output 미구현 또는 미검증

### Claim-specific historical findings

- P15-M0가 기록한 과거 PDF 바이너리 소실과 Markdown 미포착
- 현재 Phase15 PDF가 baseline 이후 재생성됨
- SH1 개별 PDF의 두 행 시각 clipping

역사 finding은 과거 산출물의 provenance 또는 해당 PDF 단독 완전성 주장을 영구 제한하지만, 새 P17 사례를 독립 기준과 새 append-only evidence로 처음부터 완주하는 것까지 영구 차단하지는 않는다. P17-M23은 각 blocker가 어느 claim을 차단하는지 다시 판정해야 한다.

## CI와 재현 정책

- `npm test`: 저장소 단독으로 실행하는 hermetic 기본 회귀이며 P17 외부 bundle job을 포함하지 않는다.
- `npm run test:p17`: `STRIX-verification-21` 원자료가 provision된 환경에서 source custody, contract, negative path와 value-presence audit을 실행한다.
- `npm run test:release:p17`: 전체 release 회귀 뒤 P17 외부-artifact job을 실행한다.
- `P17_SOURCE_ROOT`: 원자료 bundle의 물리 위치만 바꾸며 evidence의 논리 경로 `STRIX-verification-21/...`는 바꾸지 않는다.

## 보고서와 시각 QA

P17-M0 complete report R2는 9쪽이며 모든 페이지를 렌더링해 clipping, overflow, 글꼴, 한글 glyph, header/footer와 source screenshot legibility를 확인했다. 보고서 8쪽의 잘림은 보고서 layout 오류가 아니라 SH1 원자료 PDF의 결함을 의도적으로 보여주는 시각 증거다. M0에서는 S-Structures 모델·해석·결과 화면이 생성되지 않았으므로 그런 screenshot을 삽입하지 않았다.

봉인된 final PDF와 새 draft는 Markdown bytes, PDF 추출 text와 9쪽 rendered pixels가 모두 동일하다. ReportLab이 생성 시각과 trailer ID를 달리하므로 PDF container bytes 자체의 재생산은 요구하거나 주장하지 않는다. `npm run report:p17:m0:final`은 이제 봉인본을 덮어쓰려 하지 않고 이 semantic/pixel identity를 idempotent하게 검증한다.

## 다음 단계 승인

`P17-M1`은 결과값 없이 case contract, 공식 21개 scaffold, append-only writer, isolated runner, stable product adapter와 evidence/report contract를 구축한다. 첫 실제 사례는 `P17-M2 / SB1`이며 모델링 입력, 독립 기준, S-Structures raw result, 비교표, 화면 캡처, 완전한 Markdown/PDF 보고서와 review가 모두 닫힌 뒤에만 다음 사례로 이동한다.
