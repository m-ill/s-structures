# 03 Loads Design And Reports

## Design-Basis Load Input

`탄성해석` 탭의 설계기준 입력 영역은 자동 하중 생성 전용이다. 입력값을 preview하면 모델에는 설계기준 상태만 저장되고, apply를 눌러야 실제 하중 entity가 생성된다.

| 입력 | 의미 | 저장 위치 |
| --- | --- | --- |
| `occupancy` | 용도 preset | `model.designBasis.occupancy` |
| `floorArea` | 기준층 면적 | `model.designBasis.floorArea` |
| `roofArea` | 지붕 면적 | `model.designBasis.roofArea` |
| `deadLoad` | 고정하중 강도 | `model.designBasis.deadLoad` |
| `liveLoad` | 활하중 강도 | `model.designBasis.liveLoad` |
| `roofLiveLoad` | 지붕 활하중 강도 | `model.designBasis.roofLiveLoad` |
| `windPressureX/Y` | 등가 풍하중 압력 | `model.designBasis.windPressureX/Y` |
| `seismicCoefficientX/Y` | 등가 지진계수 | `model.designBasis.seismicCoefficientX/Y` |
| `seismicLiveLoadFactor` | 지진중량 활하중 참여계수 | `model.designBasis.seismicLiveLoadFactor` |

## Preview And Apply

| 버튼/API | 동작 |
| --- | --- |
| Preview | `model.designBasis` 저장, 예상 하중 산정 결과 미리보기 |
| Apply | 하중케이스와 하중 entity 생성, `model.loadEstimation` 저장, 재해석 |

AI agent 기준 action은 다음과 같다.

```js
window.SStructuresAgent.execute('setDesignBasisInput', {
  designBasis: {
    occupancy: 'office',
    floorArea: 144,
    roofArea: 120,
    deadLoad: 4.9,
    liveLoad: 2.6,
    windPressureX: 0.75,
    seismicCoefficientX: 0.11,
    seismicLiveLoadFactor: 0.25
  }
});

window.SStructuresAgent.execute('applyDesignBasisLoads', {
  designBasis: {
    occupancy: 'office',
    floorArea: 144,
    roofArea: 120
  }
});
```

## Load Derivation Trace

자동 생성 하중은 계산 trace를 가진다. 현재 trace group은 다음과 같다.

| group | 내용 |
| --- | --- |
| `basis` | 용도 preset, 기준층 면적, 지붕 면적 |
| `gravity` | 층별 고정/활하중 산정 |
| `wind` | 층별 등가 풍하중 산정 |
| `seismic` | 유효중량, 밑면전단력, 층별 분배 |
| `distribution` | 층 총하중을 보 등분포하중 또는 노드하중으로 배분 |

대표 trace row ID는 다음과 같다.

| row ID | 식 |
| --- | --- |
| `D-ST1` | `A * qD` |
| `L-ST1` | `A * qL` |
| `WX-ST1` | `pWX * width * storyHeight` |
| `EX-BASE` | `CsX * sum(Wi)` |
| `D-DIST-ST1` | `Dstory / sum(Lbeam)` |
| `EX-NODE-ST1` | `EXstory / nNodes` |

생성된 하중은 가능한 경우 `load.derivation.traceRowId`로 trace row와 연결된다.

## KDS-Style Load Combinations

현재 조합 생성은 구조설계사무소의 업무 흐름을 닮게 만들기 위한 예비 구현이다.

| API/action | 설명 |
| --- | --- |
| `createKdsLoadCombinations` | preset 기반 조합 생성 |
| `createKdsRuleBasedLoadCombinations` | load case를 읽고 부호/방향 조합 확장 |
| `applyKdsLoadCombinations` | 현재 모델 조합을 preset으로 교체 또는 append |
| `applyKdsRuleBasedLoadCombinations` | 현재 모델 조합을 rule 기반으로 교체 또는 append |
| `getKdsLoadStandardAudit` | 조합 생성 근거와 coverage 확인 |

주의: 현재 KDS-style은 완전한 법규 절차 엔진이 아니라 구조화된 preset/rule/audit layer다. 세부 노출계수, 지반분류, 중요도계수, 적설, 토압, 시공하중 등은 추후 확장 대상이다.

## Reports

| 보고서 | API | 사용 목적 |
| --- | --- | --- |
| 기본 보고서 | `getReport()` | 빠른 해석/설계 요약 |
| 상세 보고서 | `getDetailedReport()` | 모델, 하중, 조합, 부재검토 trace |
| 계산서 패키지 | `getCalculationPackage()` | 표지, 목차, 상세 trace, appendix 포함 HTML |
| 층간변위 보고 | `getServiceabilityDriftReport()` | 사용성 drift 검토 |
| 부재 설계 trace | `getMemberDesignTraceReport()` | 부재별 검토식과 action matrix |

계산서 패키지는 HTML 기준이며, PDF는 브라우저 인쇄 기능으로 만든다. 자동 생성된 대표 건물 검토 PDF는 `output/pdf/m42-representative-packages/`에 위치한다.

## Generated Review Folders

| 폴더 | 내용 |
| --- | --- |
| `reports/representative-building-calculation-packages/` | 10종 대표 건물 계산서 HTML/JSON |
| `output/pdf/m42-representative-packages/` | 10종 대표 건물 PDF 검토본 |
| `reports/stabilization-harness/` | 모델링/해석/보고서 안정화 검증 산출물 |

보고서는 아직 최종 인허가용 구조계산서가 아니다. 설계자가 검토할 수 있는 산정 근거와 누락 항목을 드러내는 계산 보조 산출물로 본다.
