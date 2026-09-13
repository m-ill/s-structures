# WP-05 — 첫 페이지 결론 · Production Layout

```yaml
wp: WP-05
milestone: P11-M5
status: qualification-complete
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

`verification/evidence/validation/phase11/p11-m5-executive-report-layout.json`

## Review Log

- 2026-07-23: 한·영 각 14쪽 실제 PDF를 90 dpi 전 페이지 raster 검토했다.
- 첫 페이지 필수 marker 7/7, 필수 figure 7/7, footer·페이지 번호 오류 0을 확인했다.
- 빈 페이지, clipping, overlap, tofu, replacement character, edge ink는 모두 0이다.
- PDF pair의 원자적 최종 배포와 artifact manifest는 WP-06 범위로 유지한다.
