# P11-M4 필수 Scene Evidence·본문 Embedding 코드리뷰

```yaml
milestone: P11-M4
reviewed_at: 2026-07-24
status: PASS
critical_findings: 0
high_findings: 0
release_qualified: false
```

## 결론

필수 7개 scene의 결정론적 선택 규칙, 지배 조합·부재·하중 케이스 추적, figure manifest,
한·영 HTML의 동일 PNG 자산 연결을 구현했다. PILOT-OFFICE-01을 실제 재해석하여 1600×900
PNG 7개를 생성했으며, figure·caption·reference 누락과 stale·duplicate 자산을 fail-closed로
차단했다.

## 검토 범위

- `src/report/phase11/sceneEvidence.js`
- `src/report/phase11/bilingualReport.js`
- `src/report/phase11/i18n.js`
- `tests/p11-m4-scene-evidence-report.mjs`
- `tools/run-p11-m4-evidence.mjs`

## 주요 판정

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| required scene coverage | PASS | model 2, load 2, result 3 = 7/7 |
| source selection | PASS | D/L과 지배 횡하중 EX, 지배 조합·부재 고정 |
| 실제 화면 자산 | PASS | PILOT-OFFICE-01 재해석 기반 1600×900 PNG 7개 |
| bilingual parity | PASS | ko/en의 asset path·SHA-256·figure 순서 동일 |
| 문맥 배치 | PASS | model·load·analysis 관련 본문에 figure 배치 |
| 무결성 gate | PASS | missing, duplicate, stale, broken reference 차단 |
| 접근성 | PASS | locale caption과 동일한 `alt` 대체 텍스트 |
| 보안 | PASS | manifest가 생성한 상대 asset path만 허용하고 HTML escape 적용 |

## 수정 반영

초기 실제 PNG 검토에서 변형 형상의 하단이 frame 밖으로 내려가는 문제를 발견했다. scene
viewport를 보고서 header와 분리하고 740px plotting 영역을 120px 아래에 배치해 clipping을
제거한 뒤 증적을 재생성했다.

## 잔여 범위

M4는 HTML figure binding까지의 qualification이다. 첫 페이지 결론 우선 layout, page break,
footer와 전체 raster 검토는 P11-M5, 원자적 PDF pair 출력은 P11-M6에서 완료한다.
