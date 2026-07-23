# P11-M2 Code Review — Korean/English Localization · Dual HTML

```yaml
review: P11-M2
date: 2026-07-23
verdict: PASS
milestone_status: qualification-complete
dedicated_gate: PASS
full_regression: PASS
release_qualification: BLOCKED
release_qualified: false
critical_findings_open: 0
high_findings_open: 0
evidence_artifact: reports/validation-evidence/phase11/p11-m2-bilingual-rendering.json
evidence_records: 19
artifact_hash: 494b82c82f1b8a08f4729457e9a30c05cc920e1d4950fe35602191f3d2aad232
```

## 결론

하나의 immutable snapshot에서 `ko-KR`과 `en-US` HTML을 동시에 만드는 공통 renderer가
구현됐다. 두 문서는 snapshot·semantic·숫자·기술 ID가 동일하며 자연어 catalog만 다르다.
PDF font embedding과 화면 figure는 각각 M8, M3~M4 범위로 유지한다.

## 검토 결과

- Localization: 46개 message key의 한·영 key set과 placeholder signature 차이가 0이다.
- Parity: snapshot hash, semantic hash, raw numeric sequence와 기술 ID 순서가 동일하다.
- Technical integrity: 조합·부재·검토 ID와 verdict reason code는 번역하지 않는다.
- Injection: project display 문자열과 placeholder는 HTML escape된다.
- Font readiness: 한국어 font fallback stack과 검색·복사 glyph probe를 HTML에 포함한다.
- Fail closed: 지원하지 않는 locale, 누락 key/placeholder, invalid snapshot과 parity drift는 예외다.
- Compatibility: 기존 영문 calculation package API와 HTML은 변경하지 않았다.
- Scope truthfulness: `P11-RPT-04` figure 배치는 M4로 deferred했으며 M2 PASS로 과장하지 않았다.

## 검증

- `npm run test:p11:m2`
- `npm run evidence:p11:m2`
- `node tests/m42-calculation-package.mjs`
- `node tests/m43-calculation-package-ui.mjs`
- `npm test`

## 잔여 위험

- PDF에 실제 한글 font가 embed되고 검색·복사되는지는 M6 생성 후 M8에서 검증한다.
- 현재 M2 HTML은 화면 이미지가 없는 구조이며 7개 필수 장면은 M3~M4에서 추가한다.
- 독립 기준해가 없으므로 파일럿 verdict는 계속 `CONDITIONAL_PASS`다.
