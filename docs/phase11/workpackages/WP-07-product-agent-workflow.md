# WP-07 — Product UI · Agent · Export History

```yaml
wp: WP-07
milestone: P11-M7
status: planned
contracts: [report export workflow, Agent/API parity, artifact history]
depends: [WP-06]
```

## 배경

UI와 Agent가 renderer·print를 각자 호출하면 같은 요청에서도 snapshot과 artifact가 달라질 수 있다.

## 작업

1. `한·영 보고서 내보내기` action과 preflight 구현.
2. snapshot/verdict/scene readiness 표시.
3. progress, cancel, failure reason, remediation UI 구현.
4. ko/en preview와 완료 artifact 열기 구현.
5. export history와 manifest 조회 구현.
6. Agent/API plan/run/status/cancel/artifacts action 구현.
7. idempotency, stale result, unsupported adapter 처리.
8. feature catalog, Agent manifest, user manual 갱신.
9. 기존 인쇄/PDF 버튼을 명시적 browser fallback으로 정리.

## 제품 표면

사용자와 Agent가 같은 export service와 artifact manifest를 사용한다.

## 게이트

- `P11-UI-01~12`, `P11-API-01~12`, `P11-PAR-08`
- `tests/p11-m7-product-agent-export.mjs`
- UI/Agent plan·snapshot·artifact hash 일치
- cancel acknowledgement ≤2초
- reason/remediation 누락 0
- unsupported 경로 false success 0

## Evidence

`reports/validation-evidence/phase11/p11-m7-product-agent-export.json`

## Review Log

구현 착수 후 기록한다.

