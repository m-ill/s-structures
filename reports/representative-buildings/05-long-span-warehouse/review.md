# Long-span warehouse

## 검토 개요

- 대표 유형: industrial
- 형상 설명: Single-story long-span industrial warehouse with wide transverse bays.
- 모델링 방식: 3D frame elastic model
- 층수: 1
- 노드/부재/하중: 30 / 37 / 74

## 해석 결과

- 해석 상태: OK
- 최대 변위: 0.002312
- 최대 검토비: 0.109755
- 예비 설계 상태: OK

| 조합 | 상태 | 최대 변위 | 최대 검토비 | 평형 오차 |
| --- | --- | ---: | ---: | ---: |
| EL-DL | OK | 0.002312 | 0.109755 | 1.462e-16 |
| EL-WX | OK | 0.002126 | 0.09756 | 1.254e-15 |
| EL-WY | OK | 0.002159 | 0.101908 | 3.290e-16 |

## 검증 포인트

- 향후 도면 이미지 또는 MGT 변환기는 이 모델과 같은 schema version 3 데이터를 생성해야 한다.
- 자동 모델링 결과를 `model.json`과 비교해서 노드, 부재, 하중, 조합의 누락 여부를 검토한다.
- 보고서 검토는 `report.html`에서 수행한다.
