# M14 Report Export

작성일: 2026-06-25  
대상: 해석/설계 결과를 계산서 초안 형태로 출력하기 위한 보고서 데이터와 HTML export

## 1. 목표

M14의 목표는 현재 엔진 결과를 보고서로 재사용 가능한 데이터 구조로 정리하고, 브라우저에서 바로 열 수 있는 HTML 계산서 초안을 생성하는 것이다.

이 단계의 보고서는 최종 구조계산서 대체물이 아니라, 모델 검토와 결과 공유를 위한 초안이다.

## 2. 구현 파일

```text
src/report/htmlReport.js
src/index.js
src/ui/indexBridge.js
tests/m14-report-export.mjs
```

## 3. 제공 API

코어 API:

```js
import { buildReportData, createHtmlReport, renderHtmlReport } from './src/index.js';
```

Agent API:

```js
window.SStructuresAgent.getReport()
window.SStructuresAgent.getReport({ resultId: 'ENVELOPE' })
```

반환값:

```js
{
  data,
  html
}
```

## 4. Report Data

`buildReportData(model, analysis, options)`는 다음 정보를 만든다.

- 보고서 버전과 생성 시각
- 모델 요약: 절점, 부재, 하중, 하중 케이스, 조합 수
- 모델 경계 크기와 단위계
- 하중 케이스별 하중 개수
- 하중 조합 계수
- 해석 상태, 최대 변위, 최대 설계비
- P-Delta 요약
- 모달 해석 요약
- 부재력 포락 표
- 설계 검토 표
- 경고와 오류 메시지
- 제한사항

## 5. HTML Report

`renderHtmlReport(report)`는 단일 HTML 문자열을 생성한다.

포함 섹션:

- 상단 요약 카드
- Model Summary
- Load Cases
- Load Combinations
- Analysis Summary
- Member Force Envelope
- Design Summary
- Messages
- Limitations

HTML 출력에서는 프로젝트명 등 외부 입력값을 escape 처리한다.

## 6. 코드 리뷰 메모

이번 단계에서 확인한 주요 위험과 조치:

- 보고서가 해석을 다시 수행하면 화면 결과와 불일치할 수 있으므로, 이미 생성된 `analysis` 객체를 입력으로 받도록 했다.
- 프로젝트명 등 문자열은 HTML escape를 적용해 보고서 markup이 깨지지 않도록 했다.
- P-Delta 경고는 summary가 아니라 조합별 결과에 저장되므로 조합별 `warnings`를 순회하도록 보완했다.
- 보고서에는 “최종 구조계산서 대체물이 아님”과 “지원되지 않는 검토는 별도 확인 필요” 제한사항을 기본 포함했다.
- agent API에는 전체 HTML과 구조화 데이터를 함께 반환해 화면 자동화와 파일 저장 흐름 모두에 대응할 수 있게 했다.

## 7. 완료 기준

- `buildReportData()`로 모델/하중/조합/해석/설계 요약을 만들 수 있다.
- `createHtmlReport()`로 단일 HTML 계산서 초안을 만들 수 있다.
- `window.SStructuresAgent.getReport()`에서 같은 결과를 읽을 수 있다.
- M14 테스트에서 HTML escape와 보고서 주요 섹션을 검증한다.
- M0-M14 전체 테스트 묶음에 포함된다.
- 금지 문자열 검사를 통과한다.
