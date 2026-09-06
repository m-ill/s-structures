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
| 한·영 PDF 보고서 | `planReportExport()` → `runReportExport()` | 동일 snapshot의 결론·화면 증거·상세표를 한국어/영어 PDF로 원자 게시 |

기존 계산서 패키지는 HTML과 브라우저 수동 인쇄 fallback으로 유지한다. 이 경로는 PDF 자동 저장
성공으로 판정하지 않는다. Phase 11 한·영 보고서는 데스크톱 export service에서 두 PDF와
artifact manifest가 모두 검사된 경우에만 완료된다.

### 한·영 PDF 내보내기

1. `preflightReportExport`에서 해석 snapshot, 최종 결론, 필수 화면 7개와 보고서 qualification 상태를 확인한다.
2. `planReportExport`로 plan hash를 고정하고 `runReportExport`를 실행한다.
3. `getReportExportStatus`에서 진행률·실패 reason·remediation을 확인한다. 실행 중에는
   `cancelReportExport`를 사용할 수 있다.
4. 완료 후 `getReportExportArtifacts`로 한국어/영어 PDF의 SHA-256·쪽수·크기와 manifest를
   확인하고 `openReportExportArtifact`로 연다.
5. `listReportExports`는 동일 프로젝트의 완료·실패·취소 이력을 반환한다.

일반 브라우저에서는 한·영 print-ready HTML을 각각 수동 인쇄할 수 있지만, 프로그램은 이를
자동 PDF 저장 성공으로 표시하지 않는다. 독립 구조공학 기준이 없는 보고서는 프로그램 검사가
PASS여도 최종 결론을 `CONDITIONAL_PASS`로 유지한다.

현재 native qualification profile은 Windows Chromium·Poppler·pypdf다. 실제 한·영 PDF 5회
출력의 p95, 작업집합, 파일 크기, 전 페이지 raster, 한글 검색/복사, 내장 font, A4/footer,
개인정보·경로 누출과 실패 정리를 검사한다. `BLOCKED` qualification이 전달되면 preflight는
`P11_REPORT_EXPORT_QUALIFICATION_BLOCKED`와 해결 안내를 표시하고 실행하지 않는다.

Phase 11 보고서 출력은 `PILOT-OFFICE-01`을 세 번 독립 실행해 model/snapshot/numeric/scene
선택 parity와 각 PDF의 실제 SHA-256을 재검증한 Windows profile에서 release-qualified 됐다.
최종 검증 산출물은 `output/pdf/phase11/PILOT-OFFICE-01/P11-M9-R03/`에 있다. 이 판정은
보고서 생성 기능에 대한 것이며, 독립 구조공학 정답이 없으므로 보고서 결론은
`CONDITIONAL_PASS`이고 Phase 10 외부 교차검증 blocker도 그대로 유지된다.

자동 생성된 기존 대표 건물 검토 PDF는 `output/pdf/m42-representative-packages/`에 위치한다.

## Generated Review Folders

| 폴더 | 내용 |
| --- | --- |
| `reports/representative-building-calculation-packages/` | 10종 대표 건물 계산서 HTML/JSON |
| `output/pdf/m42-representative-packages/` | 10종 대표 건물 PDF 검토본 |
| `reports/stabilization-harness/` | 모델링/해석/보고서 안정화 검증 산출물 |

보고서는 아직 최종 인허가용 구조계산서가 아니다. 설계자가 검토할 수 있는 산정 근거와 누락 항목을 드러내는 계산 보조 산출물로 본다.
