# U-shaped school wing

## 검토 개요

- 대표 유형: school
- 형상 설명: Three-story U-shaped education building around an open courtyard.
- 모델링 방식: 3D frame elastic model
- 층수: 3
- 노드/부재/하중: 40 / 57 / 114

## 해석 결과

- 해석 상태: OK
- 최대 변위: 0.007404
- 최대 검토비: 0.082646
- 예비 설계 상태: OK

| 조합 | 상태 | 최대 변위 | 최대 검토비 | 평형 오차 |
| --- | --- | ---: | ---: | ---: |
| EL-DL | OK | 5.847e-4 | 0.0686 | 2.216e-16 |
| EL-WX | OK | 0.007404 | 0.082646 | 2.917e-15 |
| EL-WY | OK | 0.00201 | 0.05754 | 4.410e-16 |

## 검증 포인트

- 향후 도면 이미지 또는 MGT 변환기는 이 모델과 같은 schema version 3 데이터를 생성해야 한다.
- 자동 모델링 결과를 `model.json`과 비교해서 노드, 부재, 하중, 조합의 누락 여부를 검토한다.
- 보고서 검토는 `report.html`에서 수행한다.
