# WP-04 — 필수 Scene Evidence · 본문 Embedding

```yaml
wp: WP-04
milestone: P11-M4
status: qualification-complete
contracts: [required scene registry, figure manifest, report asset binding]
depends: [WP-02, WP-03]
```

## 배경

화면 이미지는 관련 조합·배율·결과 hash와 결속되고 본문의 수치 설명과 함께 배치돼야 증거가 된다.

## 작업

1. 필수 7개 scene registry와 selection rule 구현.
2. 등각 모델과 평면/입면 scene 배선.
3. 중력·횡하중 scene 배선.
4. 지배 변형·반력·이용률 scene 배선.
5. governing combo/member 선택 규칙을 snapshot과 공유.
6. figure 번호, locale caption, combo·scale·hash strip 구현.
7. ko/en이 같은 PNG asset을 참조하도록 manifest 연결.
8. missing/stale/duplicate figure와 broken reference gate 구현.

## 제품 표면

두 HTML preview에서 관련 장에 figure가 표시된다.

## 게이트

- `P11-CAP-15~24`, `P11-RPT-05~09`, `P11-PAR-07`
- `tests/p11-m4-scene-evidence-report.mjs`
- required coverage 7/7
- asset hash parity ko=en
- figure/caption/reference 누락 0
- combo·scale metadata drift 0

## Evidence

`reports/validation-evidence/phase11/p11-m4-scene-evidence-report.json`

## Review Log

2026-07-24 구현·실제 PILOT-OFFICE-01 capture·focused test·증적 검토를 완료했다.

- 구현: `src/report/phase11/sceneEvidence.js`, `src/report/phase11/bilingualReport.js`
- 테스트: `tests/p11-m4-scene-evidence-report.mjs`
- 증적: `reports/validation-evidence/phase11/p11-m4-scene-evidence-report.json`
- raw artifact: `reports/phase11/PILOT-OFFICE-01/m4/`
- 리뷰: [P11-M4-CODE-REVIEW.md](../reviews/P11-M4-CODE-REVIEW.md)
- 판정: `P11-CAP-15~24`, `P11-RPT-05~09`, `P11-PAR-07` PASS
- 범위 제한: 최종 pagination과 PDF 출력은 P11-M5·M6 소유
