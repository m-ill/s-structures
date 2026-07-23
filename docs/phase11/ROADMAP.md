# Phase 11 Roadmap — 마일스톤 · 수용 게이트 · 의존

```yaml
doc: roadmap
phase: 11
date: 2026-07-23
status: in-progress
governing_plan: MILESTONE_EXECUTION_PLAN.md
cycle: 착수 → 구현 → focused test → /code-review high → 수정 → 전용 gate → 전체 회귀 → evidence → milestone commit
```

## 마일스톤

| M | 이름 | WP | 선행 | 핵심 수용 게이트 |
| --- | --- | --- | --- | --- |
| **P11-M0** qualification-complete | Baseline·범위·governance | [WP-00](workpackages/WP-00-baseline-governance.md) | — | current pilot·22쪽 PDF baseline 재현, GAP owner 100%, ADR·retention·evidence schema |
| **P11-M1** qualification-complete | ReportSnapshot·verdict | [WP-01](workpackages/WP-01-report-snapshot-verdict.md) | M0 | 불변·언어중립 snapshot, hash 결정성, 독립검증 없음→최대 CONDITIONAL_PASS |
| **P11-M2** planned | 한·영 현지화·dual HTML | [WP-02](workpackages/WP-02-i18n-dual-render.md) | M1 | catalog/placeholder 100%, numeric parity 100%, 미번역 0 |
| **P11-M3** planned | 결정론적 visual capture core | [WP-03](workpackages/WP-03-visual-capture-core.md) | M1 | CaptureSpec·compositor·manifest, 1600×900, blank/stale 검출 100% |
| **P11-M4** planned | 필수 scene·본문 embedding | [WP-04](workpackages/WP-04-scene-evidence-embedding.md) | M2, M3 | required scene 7/7, figure/hash/caption 연결, ko/en asset parity |
| **P11-M5** planned | 첫 페이지 결론·production layout | [WP-05](workpackages/WP-05-executive-report-layout.md) | M2, M4 | page 1 verdict·근거·제한, page raster defect 0 |
| **P11-M6** planned | 원자적 dual-PDF service | [WP-06](workpackages/WP-06-pdf-export-service.md) | M5 | ko/en PDF+manifest 동시 성공, metadata/font/footer/privacy/failure gate |
| **P11-M7** planned | UI·Agent·export history | [WP-07](workpackages/WP-07-product-agent-workflow.md) | M6 | UI/Agent plan hash·status·artifact 동일, progress/cancel/reason |
| **P11-M8** planned | 시각·성능·보안 qualification | [WP-08](workpackages/WP-08-qualification-hardening.md) | M4, M6, M7 | p95≤30초, memory≤1GiB, visual/font/privacy/failure matrix PASS |
| **P11-M9** planned | Office pilot·release gate | [WP-09](workpackages/WP-09-pilot-release.md) | M8 | 3회 parity, PDF pair·manifest hash, full regression, Critical/High 0 |

## 의존 그래프

```text
M0 → M1 ─┬→ M2 ─┬→ M4 → M5 → M6 → M7 ─┐
         └→ M3 ─┘                       ├→ M8 → M9
                              M4 ────────┘
```

- M2와 M3은 병렬 가능하다.
- M4는 현지화와 capture 계약을 모두 필요로 한다.
- M5는 실제 figure가 포함된 문서로 page-break를 확정한다.
- M8은 제품 UI·Agent 경로까지 존재한 뒤 최종 qualification한다.

## 공통 게이트

1. 기존 solver/model 원 수치 무손상
2. snapshot·evidence·artifact hash 재현성
3. ko/en 수치 parity
4. missing translation/scene/evidence fail-closed
5. Critical/High code-review finding 0
6. performance·memory·file-size telemetry
7. UI·Agent/API·문서·feature catalog 동기화
8. 전용 evidence와 milestone commit

## 테스트·evidence 네이밍

- 테스트: `tests/p11-m0-*.mjs` … `tests/p11-m9-*.mjs`
- evidence: `reports/validation-evidence/phase11/p11-mN-*.json`
- review: `docs/phase11/reviews/P11-MN-CODE-REVIEW.md`
- raw qualification artifact: `reports/phase11/<project>/<run>/`
- PDF: `output/pdf/phase11/`

계획 단계에는 PASS review/evidence를 미리 만들지 않는다.
