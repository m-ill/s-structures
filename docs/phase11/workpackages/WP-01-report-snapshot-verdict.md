# WP-01 — ReportSnapshot · Verdict Engine

```yaml
wp: WP-01
milestone: P11-M1
status: planned
contracts: [ReportSnapshot, ReportVerdict, canonical hash]
depends: [WP-00]
```

## 배경

현재 계산서는 render 시 model과 analysis를 직접 조합하고 문자열·판정을 함께 만든다.
양 언어 수치 동일성과 진실한 결론을 보장하려면 언어 중립 snapshot이 선행돼야 한다.

## 작업

1. versioned `ReportSnapshot` schema와 validator 작성.
2. canonical serialization·SHA-256과 hash 제외필드 정의.
3. 기존 detailed/calculation package adapter 작성.
4. model/result/source revision/run provenance 결속.
5. `ReportVerdict` 4축과 reason code registry 구현.
6. independent reference, Phase 10 eligibility, audit, limitations 판정 연결.
7. stale result와 post-freeze mutation 차단.
8. 기존 단일 report API compatibility facade 연결.

## 제품 표면

기존 영문 report 결과는 유지하고 내부 source만 snapshot으로 전환한다.

## 게이트

- `P11-DATA-01~10`, `P11-RPT-01~03`
- `tests/p11-m1-report-snapshot-verdict.mjs`
- 100회 snapshot hash 일치
- locale/time/display path 영향 0
- 독립검증 없음→최대 `CONDITIONAL_PASS`
- 기존 원 수치 regression drift 0

## Evidence

`reports/validation-evidence/phase11/p11-m1-report-snapshot-verdict.json`

## Review Log

구현 착수 후 기록한다.

