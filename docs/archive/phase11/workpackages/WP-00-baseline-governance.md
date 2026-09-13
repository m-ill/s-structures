# WP-00 — Baseline · 범위 · Governance

```yaml
wp: WP-00
milestone: P11-M0
status: qualification-complete
contracts: [baseline evidence, ADR, artifact retention, release manifest skeleton]
depends: []
```

## 배경

현재 pilot은 해석·영문 HTML·PDF까지 성공하지만 한·영 parity와 화면 증거의 production 계약은 없다.
구현 전에 실제 상태를 hash와 evidence로 고정한다.

## 작업

1. `PILOT-OFFICE-01` model·load·analysis·HTML·PDF baseline 고정.
2. current report strings, API, UI, result scene, desktop, prototype tool inventory 작성.
3. GAP-01~14의 owner·target milestone·release 영향 확정.
4. ADR-001/002의 대안·결정·결과 검토 및 승인.
5. raw PNG/PDF, summary/hash, CI/release artifact 보존정책 작성.
6. Phase 11 evidence schema와 release manifest skeleton 작성.
7. 신규 dependency/font 필요성을 조사하되 승인 전 추가하지 않음.

## 제품 표면

현재 보고서 UI·파일 형식·solver 동작은 변경하지 않는다.

## 게이트

- `P11-BASE-01~06`, `P11-REL-01`
- `tests/p11-m0-baseline-governance.mjs`
- baseline 수치·page/A4/text marker·hash 재현
- gap owner/target coverage 100%
- Critical/High 0

## Evidence

`verification/evidence/validation/phase11/p11-m0-baseline-governance.json`

## Review Log

[P11-M0 Code Review](../reviews/P11-M0-CODE-REVIEW.md): PASS, Critical/High 0.

완료 산출물:

- `src/report/phase11/governance.js`
- `tools/run-p11-m0-baseline.mjs`
- `tests/p11-m0-baseline-governance.mjs`
- `verification/specs/phase11/evidence-schema.json`
- `verification/specs/phase11/release-manifest.json`
- `verification/evidence/validation/phase11/p11-m0-baseline-governance.json`
