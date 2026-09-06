# Phase 5 Implementation Backlog

status: active
ticket format: P5-T## / 우선순위 P0(핵심)·P1(중요)·P2(후순위) / 크기 S·M·L
모든 티켓은 기계 확인 가능한 수용 기준(테스트 또는 브라우저 증빙)을 갖는다. 상태: open / in-progress / done(커밋).

## P5-M0 기준선

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P5-T01 | P0 | S | docs/phase5 문서 세트 (README/진단/PRD/ARCH/ROADMAP/BACKLOG/specs A-D) | 커밋 + docs 인덱스 반영 |
| P5-T02 | P0 | M | `src/core/analysisCase.js` 스키마·검증·기본값 | 단위 테스트 `tests/p5-analysis-case.mjs` + 상태(not-run/running/ok/failed/stale) 검증 |
| P5-T03 | P0 | S | migration: 구모델에 `analysisCases:[]`, schemaContract/roundtrip 반영 | 구모델 로드→배열 존재 + `m1-schema`/export-import green |

## P5-M1 해석 센터 + 정적/모달/RSA (Track A)

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P5-T04 | P0 | M | `src/ui/analysisRunners.js` — kind→엔진 매핑, 현재 파라미터 정규화, 결과 정규화 | static/modal/rsa runner 단위 테스트 (실엔진, bridge 없는 core import 경로 포함) |
| P5-T05 | P0 | L | `src/ui/indexAnalysisCenter.js` — 도크 UI, 케이스 CRUD, 실행 오케스트레이션 | fake DOM: 케이스 추가·실행·상태 전이 |
| P5-T06 | P0 | S | indexBridge에 installIndexAnalysisCenter 연결 | 주입 후 `#ssAnalysisCenter` 존재 |
| P5-T07 | P0 | M | 정적 명시 실행 ↔ 자동 미리보기 공존 (stale 로직) | 기존 m2/m26 green + stale 전이 테스트 |
| P5-T08 | P0 | M | RSA 모달 자동 선행 + modal/combined 응답 결과 | RSA 실행 시 모달 선행, 참여율/조합변위 표시 확인 |
| P5-T09 | P0 | S | agent action: addAnalysisCase/runAnalysisCase/listAnalysisCases | 계약 등재 + 액션 테스트 |
| P5-T10 | P0 | S | 브라우저 실검증 (3종 실행, 콘솔 0) | 스크린샷 증빙 |

## P5-M2 좌굴·P-Delta·THA (Track A)

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P5-T11 | P1 | M | buckling/linearTha runner + 케이스 설정 | criticalLoadFactor/THA rows 정규화 테스트 + 실행 |
| P5-T12 | P1 | S | 정적 케이스 P-Delta 토글 | P-Delta on/off 결과 차이 |
| P5-T13 | P1 | S | 실패 사유·수렴 로그 표시 | failed 케이스 message 렌더 |

## P5-M3~M5 하중 확장 (Track B)

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P5-T14 | P0 | M | 스프링 지지 팔레트 도구 + 계수 폼 | 입력→node.spring→반력 반영 |
| P5-T15 | P1 | S | 지점 침하 입력 | 침하→강제변위 해석 |
| P5-T16 | P1 | M | 부분/사다리꼴 분포 다이얼로그 | 입력→해석 반영 |
| P5-T17 | P1 | M | 온도 하중 다이얼로그 (균일/구배) | 입력→구속 축력 |
| P5-T18 | P1 | S | 부재 거동(트러스/인장전담) 지정 | member.type 지정→반복해석 |
| P5-T19 | P0 | M | 하중 케이스 매니저 | 케이스 CRUD + 조합 연동 |
| P5-T20 | P1 | M | KDS 산정 패널 (입력→적용→trace) | 생성 하중 케이스 편입 |
| P5-T21 | P1 | S | 층 질량·편심 생성 | 층질량 표 + 질량 소스 |
| P5-T22 | P0 | S | 하중 action 계약 등재 | setSpringSupport 등 등재 |

## P5-M6~M8 비선형 (Track C)

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P5-T23 | P0 | M | 힌지 배정 UI (backbone 참조, i/j) | `member.nonlinear.hinges` 배정 + 3D 마커 |
| P5-T24 | P0 | L | pushover 케이스 정규 UI (실험 플래그 흡수) | 실행→capacity curve |
| P5-T25 | P0 | M | capacity curve SVG + 힌지 진전 슬라이더 | 스텝별 힌지 상태 표시 |
| P5-T26 | P1 | M | 성능점·사용비·IO/LS/CP 판정 | 판정 표·뱃지 |
| P5-T27 | P1 | M | NLTH 케이스 (지진파/scaling/감쇠, SDOF/bilinear Newmark preliminary) | 실행→시간이력 응답 + limitation 표기 |
| P5-T28 | P0 | S | 비선형 action 계약 등재 | assignHinge 등 등재 |

## P5-M9~M11 결과 (Track D)

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P5-T29 | P0 | M | 케이스 결과 3D 전환 (모드/좌굴/힌지) | 케이스 선택→3D 갱신 |
| P5-T30 | P1 | S | 모드/스텝 슬라이더 | 형상 전환 |
| P5-T31 | P1 | M | 부재 검정비 색상 맵 + 범례 | ratio 토글→색상 |
| P5-T32 | P1 | M | `src/ui/resultCharts.js` (capacity/시간이력/스펙트럼/모달) | 순수함수 단위 테스트 |
| P5-T33 | P1 | M | 케이스 결과 계산서 편입 | 계산서 장 추가 + 회귀 |
| P5-T34 | P0 | S | getAnalysisCaseResult read API 등재 | 계약 테스트 |

## P5-M12 출시

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P5-T35 | P0 | S | 통합 시나리오 S1~S4 브라우저 실검증 | 콘솔 0 + 증빙 |
| P5-T36 | P0 | S | featureCatalog·help.html·agent-contract 동기 | 빌드 동기 테스트 green |
| P5-T37 | P0 | S | STATUS_AND_LIMITS 갱신 + full suite | full suite green |

## Out Of Scope (기능 동결 기록)

Phase 5 중 접수된 신규 해석 이론 요구는 여기 기록만. 구현은 오너 승인 후 별도.

| 일자 | 요구 | 판단 |
| --- | --- | --- |
| - | - | - |
