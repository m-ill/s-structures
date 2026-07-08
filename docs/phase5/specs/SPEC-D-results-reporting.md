# SPEC-D · 결과·계산서 강화

track: P5-D / milestones: P5-M9, P5-M10, P5-M11 / status: spec
관련: FR-23~26, 결과 핸들 `ARCHITECTURE.md` §4

## D.0 목적

해석 케이스별 결과를 3D/차트로 전환 표시하고, 부재 검정비를 시각화하며, 케이스 결과를 계산서에 편입한다. 결과 뷰는 결과 핸들만 소비하고 엔진을 재호출하지 않는다.

## D.1 케이스 결과 3D 전환 (P5-M9)

- 해석 센터에서 케이스 선택 → 3D 뷰가 해당 결과로 전환.
- 종류별 3D:
  | kind | 3D 표시 |
  | --- | --- |
  | static | 변형/부재력 다이어그램 (기존 서브바 토글 재사용) |
  | modal | 모드 형상 (모드 선택 슬라이더 `#ssResModeSlider`) |
  | buckling | 좌굴 모드 형상 |
  | pushover | 힌지 상태 색상 (스텝 슬라이더 C.2와 공유) |
- DOM: `#ssResultCaseSel`(케이스 선택), `#ssResModeSlider`(모드/스텝).
- 난독화 모델러의 3D 렌더는 건드리지 않고, 표시용 데이터(변위 벡터/모드 형상)를 결과 핸들에서 계산해 오버레이 계층으로 전달. 오버레이는 기존 `indexResultOverlay`/`indexResultVisuals` 계약 확장.

## D.2 부재 검정비 색상 맵 (P5-M10)

- 부재 설계 검정비(D/C ratio)를 색으로: 안전(녹)~한계(황)~초과(적).
- DOM: 서브바 `data-res="ratio"` 토글 추가. 색상 스케일 범례 `#ssRatioLegend`.
- 데이터: `bridge.getMemberDesignTraceReport`/설계 결과의 부재별 ratio. 결과 핸들에 정규화.

## D.3 결과 차트 (P5-M10)

- 자체 SVG 차트(zero-dependency):
  | 차트 | 데이터 | DOM |
  | --- | --- | --- |
  | capacity curve | pushover curve | `#ssChartCapacity` |
  | 시간이력 | nlth/tha timeHistory | `#ssChartTimeHistory` |
  | 응답스펙트럼 | rsa spectrum·층응답 | `#ssChartSpectrum` |
  | 모드 참여 | modal 질량참여율 | `#ssChartModal` |
- 차트 모듈 `src/ui/resultCharts.js`: 데이터→SVG path/축/범례. 순수 함수(테스트 용이).

## D.4 계산서 편입 (P5-M11)

- 해석 케이스 결과가 계산서 해당 장에 편입:
  | 케이스 | 계산서 장 |
  | --- | --- |
  | modal | 동적특성 (주기·참여질량 표) |
  | responseSpectrum | 지진해석 (층응답·scaling) |
  | buckling | 좌굴검토 (λcr·모드) |
  | pushover | 성능평가 (capacity·성능점·힌지) — preliminary 표기 |
  | nlth | 시간이력 (응답 envelope) — preliminary 표기 |
- 기존 `createCalculationPackageHtml` 데이터에 `analysisCases` 결과를 주입. 미실행 케이스는 "not run"으로 표기(숨기지 않음).
- 계산서 회귀: 대표건물 계산서에 케이스 장 추가 후 스냅샷 갱신.

## D.5 Acceptance Criteria

M9: 케이스 선택→3D 전환(모달 형상/좌굴 모드/힌지 분포). 모드 슬라이더. 브라우저 실동작.
M10: 검정비 색상 맵·범례. capacity/시간이력/스펙트럼/모달 차트(자체 SVG). 브라우저 실동작.
M11: 케이스 결과가 계산서 장에 편입, 미실행은 not-run 표기. 계산서 회귀 green.
공통: `getAnalysisCaseResult` read API 계약 등재, resultCharts 순수함수 단위 테스트, full suite green.
