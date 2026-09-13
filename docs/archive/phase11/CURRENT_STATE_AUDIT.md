# Phase 11 Current State Audit

```yaml
version: p11-current-state-v1
audited_at: 2026-07-23
status: baseline-observed
scope: bilingual visual calculation report productionization
```

## 1. 확인된 현재 자산

| 영역 | 현재 자산 | 코드 근거 | 판정 |
| --- | --- | --- | --- |
| 계산서 데이터 | 상세보고서와 8장 계산 패키지 데이터 생성 | `src/report/detailedReport.js`, `src/report/calculationPackage.js` | 재사용 |
| 계산서 HTML | A4 `@page`, 장별 page break, 표·감사·제한사항 | `src/report/calculationPackage.js` | 재사용·확장 |
| 품질감사 | 하중 산정근거, 조합, 부재, 기초, 통합결과 등 감사 | `src/report/calculationPackage.js`의 `auditPackage` | 재사용·확장 |
| UI 보고서 | 계산서 modal 표시와 인쇄/PDF 버튼 | `src/ui/indexReportHooks.js`, `index.html` | 재사용·교체 |
| 결과 장면 데이터 | 변형, 이용률, 반력, 하중, 라벨용 scene 데이터 | `src/ui/indexResultVisuals.js`, `src/ui/indexResultOverlay.js` | 재사용 |
| 결과 차트/표 | 변형·반력·이용률·층간변위 화면 | `src/ui/elasticResultVisualization.js`, `src/ui/indexResultsPanel.js` | 재사용 |
| Desktop | Electron wrapper와 local server | `desktop/main.mjs` | PDF service 확장 |
| Pilot runner | 4층 사무실 모델, 추적 하중, 28개 조합 계산서 생성 | `tools/generate-pilot-office-report.mjs` | baseline fixture |
| PDF 후처리 | 페이지 번호·metadata 추가 | `tools/finalize-pilot-office-pdf.py` | prototype, production owner 필요 |

## 2. 2026-07-23 pilot baseline

`PILOT-OFFICE-01`의 현재 smoke 결과:

- 4층, 평면 12 m × 10 m, 높이 14.4 m
- 절점 45, 부재 84
- 하중 240, 하중 케이스 6, 조합 28
- 해석 오류 0, 경고 0, 실패 조합 0
- 최대 변위 5.749 mm
- 최대 이용률 0.394
- 최대 평형잔차 `5.542148285615899e-15`
- 현재 계산 패키지 품질감사 PASS
- 현재 PDF 22쪽 A4, 표 잘림·겹침 없음

이 baseline은 **프로그램 smoke 검증**이며 독립 정답 모델과의 구조공학적 일치 검증이 아니다.

## 3. 현재 격차

| ID | 격차 | 영향 | Phase 11 owner |
| --- | --- | --- | --- |
| GAP-01 | `calculationPackage.js`에 영문 문자열이 직접 하드코딩 | 한국어판 불가, 언어별 drift 위험 | M1~M2 |
| GAP-02 | 언어 중립·불변 report snapshot 없음 | 양 언어의 수치 동일성 증명 불가 | M1 |
| GAP-03 | 종합 결론이 첫 페이지에 없고 verdict 규칙이 없음 | 사용자가 제한사항보다 상세표를 먼저 봄 | M1, M5 |
| GAP-04 | `qualityAudit.ok`와 공학적 검증 상태가 분리되지 않음 | 과장된 PASS 가능 | M1 |
| GAP-05 | 모델·하중·변형·반력·이용률 화면이 계산서에 없음 | 결과 이해와 증거 추적성 부족 | M3~M4 |
| GAP-06 | capture spec, 카메라, 조합, 배율, hash manifest 없음 | 재현성·stale 검출 불가 | M3 |
| GAP-07 | 브라우저 `window.print()` 중심 | 두 PDF 자동·원자적 생성 불가 | M6 |
| GAP-08 | Electron에 제한된 PDF IPC/export service 없음 | 제품 one-click 내보내기 불가 | M6~M7 |
| GAP-09 | 현재 Python 후처리 도구가 one-off이고 runtime owner가 불명확 | 배포환경 일관성 부족 | M6 |
| GAP-10 | 한글 font embedding·깨짐 자동검사 없음 | PDF에서 한글 tofu/추출오류 위험 | M2, M8 |
| GAP-11 | 최종 PDF의 로컬 URL·사용자 경로 누출 gate 없음 | 개인정보·배포 품질 위험 | M6, M8 |
| GAP-12 | PDF visual regression과 capture blank 검출 없음 | 빈 그림·표 잘림을 release에서 놓칠 수 있음 | M3, M8 |
| GAP-13 | UI와 Agent가 같은 export job 계약을 사용하지 않음 | 제품 경로별 결과 불일치 | M7 |
| GAP-14 | 원본 이미지·PDF·summary/hash 보존정책 없음 | 저장소 비대화 또는 evidence 손실 | M0, M9 |

## 4. 계승해야 할 계약

- 해석·조합·평형·설계 결과는 기존 `analysis`와 `detailedReport`를 단일 원본으로 사용한다.
- 기존 `escapeHtml`과 report formatting owner를 우회하는 별도 템플릿을 만들지 않는다.
- 결과 장면은 `indexResultVisuals`와 `indexResultOverlay`의 scene 계약을 확장한다.
- Phase 7 run provenance와 Phase 10 design/release eligibility를 보고서에 그대로 전달한다.
- unsupported 결과와 limitation을 숨기지 않는다.
- report refactor가 solver 또는 model schema를 변경하지 않는다.

## 5. baseline 판정

현재 코드는 단일 영문 계산서를 만들고 브라우저에서 PDF로 저장할 수 있으므로 기능 prototype은 존재한다.
그러나 공통 스냅샷, 한·영 parity, 결정론적 화면 증거, 원자적 PDF pair, 제품 export job,
font·privacy·visual release gate가 없으므로 **production-qualified bilingual visual report는 미구현**이다.

