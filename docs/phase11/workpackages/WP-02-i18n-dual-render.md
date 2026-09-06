# WP-02 — 한·영 현지화 · Dual HTML

```yaml
wp: WP-02
milestone: P11-M2
status: qualification-complete
contracts: [message catalog, locale formatter, dual renderer]
depends: [WP-01]
```

## 배경

현재 `calculationPackage.js`의 자연어가 영문으로 하드코딩돼 있어 번역을 추가하면 템플릿과
수치 로직이 복제될 위험이 있다.

## 작업

1. `ko-KR`, `en-US` message catalog와 key naming 규칙 작성.
2. key set·placeholder signature·unused key lint 구현.
3. status, verdict reason, caption, 날짜·숫자·단위 formatter 작성.
4. report renderer의 자연어 literal을 translation key로 이동.
5. 기술 ID·식·조합·부재 식별자 번역 방지.
6. 한 번의 API 호출로 두 HTML을 생성하는 dual render 계약 작성.
7. 한국어 font stack과 glyph probe 작성.
8. locale별 일반 문자 잔류 detector와 allowlist 작성.

## 제품 표면

report API에 locale/pair option을 추가한다. 아직 PDF 자동 저장은 하지 않는다.

## 게이트

- `P11-I18N-01~12`, `P11-PAR-01~06`
- `tests/p11-m2-bilingual-rendering.mjs`
- key/placeholder 차이 0
- numeric/ID/order parity 100%
- 미번역·한글 glyph 오류 0
- HTML injection 0

## Evidence

`verification/evidence/validation/phase11/p11-m2-bilingual-rendering.json`

## Review Log

[P11-M2 Code Review](../reviews/P11-M2-CODE-REVIEW.md): PASS, Critical/High 0.

완료 산출물:

- `src/report/phase11/i18n.js`
- `src/report/phase11/bilingualReport.js`
- `tests/p11-m2-bilingual-rendering.mjs`
- `tools/run-p11-m2-evidence.mjs`
- `verification/evidence/validation/phase11/p11-m2-bilingual-rendering.json`

`P11-RPT-04`의 실제 figure 배치는 M4 범위이므로 M2 evidence에서 거짓 PASS 없이
`DEFERRED_TO_P11_M4`로 기록했다.
