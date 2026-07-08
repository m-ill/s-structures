# Phase 5 Roadmap

status: active
start: 2026-07-04

4개 트랙(A 해석센터 · B 하중 · C 비선형 · D 결과), 13개 마일스톤(P5-M0~M12). 각 마일스톤은 기계 확인 가능한 exit criteria + 브라우저 실동작 증빙을 갖는다. 크기: S 며칠 / M 1-2주 / L 2-4주.

## Milestone Summary

| Milestone | 트랙 | 크기 | 목표 | 세부 명세 |
| --- | --- | --- | --- | --- |
| P5-M0 | — | S | Phase 5 기준선 (문서 세트, analysisCase 스키마+migration) | ARCHITECTURE §2 |
| P5-M1 | A | L | 해석 센터 골격 + 정적/모달/RSA 케이스 실행 | SPEC-A |
| P5-M2 | A | M | 좌굴·P-Delta·선형THA 케이스 + 실행 상태/오류 | SPEC-A |
| P5-M3 | B | M | 지지 확장 (스프링·침하) 입력 UI | SPEC-B |
| P5-M4 | B | M | 부재 하중 확장 (부분/사다리꼴/온도) + 트러스 지정 | SPEC-B |
| P5-M5 | B | M | 하중 케이스 매니저 + KDS 산정 패널 + 층질량 | SPEC-B |
| P5-M6 | C | M | 힌지 배정 UI (backbone 참조) | SPEC-C |
| P5-M7 | C | L | Pushover 케이스 실행 + capacity/힌지 진전 뷰 | SPEC-C |
| P5-M8 | C | M | 성능점·사용비·성능수준 판정 + NLTH 케이스 | SPEC-C |
| P5-M9 | D | M | 해석 케이스별 결과 3D 전환 (모드/좌굴/힌지) | SPEC-D |
| P5-M10 | D | M | 부재 검정비 색상 맵 + 결과 차트 | SPEC-D |
| P5-M11 | D | M | 해석 케이스 결과의 계산서 편입 | SPEC-D |
| P5-M12 | — | S | 통합 실검증 + 기능 설명서/agent 계약 동기 + 출시 | README |

병렬성: M1 완료(해석 케이스 기반) 후 B·C·D 트랙 병렬 가능. B는 A와 독립 착수 가능(하중 입력은 케이스 없이도 유효). C는 M6→M7→M8 순차. D는 M1 결과 핸들에 의존.

## Exit Criteria

### P5-M0 Baseline
1. `docs/phase5/` 문서 세트(README/진단/PRD/ARCHITECTURE/ROADMAP/BACKLOG/specs A-D) 커밋.
2. `src/core/analysisCase.js` 스키마·검증·기본값 + migration(구모델에 `analysisCases: []`). 단위 테스트.
3. full suite green.

### P5-M1 해석 센터 + 정적/모달/RSA (핵심)
1. 해석 센터 도크: 케이스 목록, [케이스 추가](종류 선택), [실행], 상태 뱃지(not-run/running/ok/failed).
2. `analysisRunners.js`: static→`analyzeModel`, modal→`analyzeDynamics`, rsa→`runResponseSpectrum` 매핑 + 결과 정규화.
3. 정적 명시 실행이 자동 미리보기와 공존(§3 규칙). 모달 실행 시 주기/참여율 결과 표시. RSA 실행 시 층응답.
4. **브라우저 실동작**: 3종 케이스 추가·실행·결과 확인, 콘솔 에러 0 (스크린샷 증빙).
5. agent: addAnalysisCase/runAnalysisCase/listAnalysisCases + 계약 등재. full suite green.

### P5-M2 좌굴·P-Delta·THA
1. 좌굴 케이스(좌굴계수/모드), 정적 케이스 P-Delta 토글, 선형 THA 케이스(지반가속도 입력).
2. 실행 실패 시 사유·수렴 로그 표시. stale(모델 변경 후 재실행 유도) 동작.
3. 브라우저 실동작 + full suite green.

### P5-M3 지지 확장
1. 팔레트에 스프링 지지 도구 + 스프링 계수(kx…krz) 입력 속성. 지점 침하 입력.
2. 스프링 반력이 결과/평형에 반영됨을 확인. 브라우저 실동작.

### P5-M4 부재 하중 확장
1. 부분/사다리꼴 분포하중(from/to/w1/w2), 온도(균일/구배) 입력 UI. 트러스/인장전담 부재 지정.
2. 입력 후 하중 표시·해석 반영. 브라우저 실동작.

### P5-M5 하중 케이스/KDS/질량
1. 하중 케이스 매니저(생성/타입/편집). KDS 산정 패널(입력→생성→trace). 층질량·편심 생성.
2. 생성 하중이 케이스·조합에 편입. 브라우저 실동작.

### P5-M6 힌지 배정
1. 부재 단부 힌지 배정 UI(재료 backbone 선택, i/j단). 배정 3D 표시.
2. 배정이 pushover/NLTH 입력으로 소비됨을 확인.

### P5-M7 Pushover 케이스 + 뷰
1. pushover 케이스(방향/패턴/제어/목표변위) 실행. capacity curve 차트, 힌지 상태 진전 뷰.
2. 실험 플래그 없이 정규 UI로 동작(기존 experimental 경로 대체/흡수). 브라우저 실동작.

### P5-M8 성능 판정 + NLTH
1. 성능점·사용비·성능수준(IO/LS/CP) 판정 표시. NLTH 케이스(지진파/scaling/감쇠) 실행.
2. 시간이력 응답 뷰. 브라우저 실동작.

### P5-M9 결과 3D 전환
1. 케이스 결과를 3D로 전환: 모드 형상, 좌굴 모드, 힌지 분포, 정적 변형.
2. 케이스 선택 ↔ 3D 표시 연동. 브라우저 실동작.

### P5-M10 색상 맵 + 차트
1. 부재 검정비 색상 맵(취약 부재 식별). 결과 차트(곡선/시간이력/스펙트럼) 자체 SVG.
2. 브라우저 실동작.

### P5-M11 계산서 편입
1. 해석 케이스별 결과가 계산서 해당 장에 편입(모달표/RSA/좌굴/pushover 장).
2. 계산서 회귀 + 케이스 trace 확인.

### P5-M12 출시
1. 통합 시나리오 S1~S4 브라우저 실검증(콘솔 에러 0).
2. 신규 action/API가 agent-contract·featureCatalog·help.html에 등재(빌드 동기 테스트).
3. full suite green. STATUS_AND_LIMITS 갱신.

## Progress

| Milestone | Status | 완료일 | 비고 |
| --- | --- | --- | --- |
| P5-M0 | in-progress | - | 문서 세트 작성 중 |
| P5-M1~M12 | not-started | - | - |
