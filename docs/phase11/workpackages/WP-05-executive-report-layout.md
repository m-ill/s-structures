# WP-05 — 첫 페이지 결론 · Production Layout

```yaml
wp: WP-05
milestone: P11-M5
status: planned
contracts: [executive summary, report information architecture, print CSS]
depends: [WP-02, WP-04]
```

## 배경

현재 계산서는 표지와 상세표 중심이며 최종 결론·검증 상태·제한사항을 첫 페이지에서 판단하기 어렵다.

## 작업

1. page 1 상단 overall verdict와 4축 상태 배치.
2. 핵심 metric, governing result, audit, scope card 구현.
3. 독립검증 부재와 시공용 사용 불가를 첫 페이지에 표시.
4. TOC와 model/load/analysis/reaction/member/audit/appendix 순서 재구성.
5. figure/table 번호와 cross-reference 구현.
6. repeated table header, break control, widow/orphan 방지.
7. page footer, report metadata와 hash short ID 구현.
8. searchable text, heading/table semantics, color-independent status 적용.

## 제품 표면

production report preview를 우선 표시하고 기존 detailed report는 migration 기간 유지한다.

## 게이트

- `P11-RPT-10~22`, `P11-VIS-01~08`, `P11-A11Y-01~05`
- `tests/p11-m5-executive-report-layout.mjs`
- 첫 페이지 필수 verdict/metric/scope coverage 100%
- clipping·overlap·tofu·black square 0
- figure/table/footer numbering 오류 0

## Evidence

`reports/validation-evidence/phase11/p11-m5-executive-report-layout.json`

## Review Log

구현 착수 후 기록한다.

