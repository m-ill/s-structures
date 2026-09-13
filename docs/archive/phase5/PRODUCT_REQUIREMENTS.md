# Phase 5 Product Requirements (PRD)

status: active
source: 오너 방향 확정 2026-07-04

## Product Statement

S-Structures를 **구조 엔지니어가 화면에서 해석 종류를 고르고 실행하며 결과를 검토하는 전문 구조해석 프로그램**으로 완성한다. 해석은 전적으로 **자체 엔진**(`src/solver`·`src/dynamics`·`src/nonlinear`, 외부 의존성 0)이 수행한다. OpenSees(명시적 해석 도메인)와 Perform-3D(성능기반 내진 GUI)는 **UI/워크플로를 어떻게 구성할지 참고하는 사례**이지 채택하는 엔진이 아니다. Phase 5는 신규 해석 이론을 추가하지 않고, 이미 구현된 자체 엔진을 완전한 조작 UI로 노출한다.

## UI Concept 대응 (엔진 채택 아님, 화면 구성 참고)

| 개념 | OpenSees | Perform-3D | S-Structures Phase 5 |
| --- | --- | --- | --- |
| 해석 정의 | analysis object (constraints/system/algorithm/integrator) | Analysis Series | **Analysis Case** (종류+설정+입력참조) |
| 해석 실행 | `analyze N` | Run | 해석 센터 [실행] 버튼 |
| 결과 수집 | recorder | Load/Time-history results | 케이스별 결과 핸들 + 3D/차트 |
| 비선형 요소 | element/section/material | Component (강도저하) | 힌지 배정 + 재료 backbone |
| 성능 판정 | (사용자 후처리) | Limit State / Usage Ratio / Performance Level | 성능점·사용비·IO/LS/CP 판정 |
| 하중 | pattern/timeSeries | Load Pattern / Ground Motion | 하중 케이스 매니저 + 지진파 |

위 표의 왼쪽 두 열은 "이런 화면·개념이 있더라"는 참고일 뿐이다. 우리 해석 케이스가 [실행]을 누르면 호출하는 것은 전부 우리 엔진 함수(`analyzeModel`, `analyzeDynamics`, `runResponseSpectrum`, `estimateGlobalBucklingTrace`, `runPushover`, `runNewmarkNlth`)다. 완전 명령형(tcl 콘솔)은 채택하지 않는다 — 오너가 "해석 실행 센터(GUI)" 방향을 확정. 단, 각 해석 케이스는 재현 가능한 데이터로 모델에 저장되어 스크립트/에이전트로도 동일 실행이 가능해야 한다.

현재 브리지가 모든 core 함수를 직접 노출하지는 않는다. Phase 5 runner는 브리지 화면 상태가 필요한 경우만 `bridge`를 쓰고, 순수 core 함수는 `src/index.js` export를 직접 import해서 호출한다. 또한 RSA·pushover·NLTH는 현재 엔진의 preliminary trace 범위를 결과/계산서에 그대로 표시한다.

## Target Users

| 사용자 | 니즈 |
| --- | --- |
| 구조 엔지니어 | 모델 작성 후 원하는 해석을 골라 실행하고 결과를 즉시 검토 |
| 내진 검토자 | pushover/NLTH로 성능평가, 힌지 상태와 성능점 확인 |
| 검토자/소장 | 해석 케이스별 결과가 계산서에 추적되어 검토 가능 |
| AI 에이전트 | 해석 케이스를 만들고 실행하는 액션 계약 |

## Core Scenarios

### S1. 명시적 해석 실행 (핵심)
1. 모델·하중·조합 준비 (편집 중 자동 정적 미리보기가 계속 갱신).
2. 해석 센터를 열어 "모달 해석" 케이스 추가 → 모드 수 12 설정 → [실행].
3. 상태가 running→ok로 바뀌고, 결과 탭에서 주기·질량참여율·모드 형상 확인.
4. 이어서 "응답스펙트럼" 케이스 추가 → 스펙트럼·방향 설정 → [실행] → 방향별 modal/combined 응답 확인. 층응답은 Phase 5 후처리 가능 범위부터 표시.
5. 케이스 목록에서 정적·모달·RSA 결과를 전환하며 비교.

### S2. 실무 하중 입력
1. 하중 케이스 매니저에서 D/L/W/E 케이스 구성.
2. 팔레트에서 스프링 지지 도구로 기초 절점에 지반 스프링 입력.
3. 부분분포·온도 하중을 부재에 재하.
4. KDS 산정 패널에서 풍/지진 하중 자동 생성 → 케이스 편입.

### S3. 비선형 성능평가
1. 힌지 배정 화면에서 기둥·보 단부에 M-θ 힌지 배정 (재료 backbone 참조).
2. pushover 케이스 추가 → 방향·하중패턴·제어방식·목표변위 설정 → [실행].
3. capacity curve, 힌지 상태 진전(항복→극한), 성능점·사용비 확인.
4. NLTH 케이스 추가 → 지진파 선택·scaling → [실행] → 현재 SDOF/bilinear Newmark trace 기반 시간이력 응답 검토(preliminary 표기).

### S4. 결과·계산서
1. 각 해석 케이스 결과를 3D(모드 형상/힌지 분포, 좌굴은 trace 제공 범위)와 차트(곡선/시간이력)로 확인.
2. 부재 검정비 색상 맵으로 취약 부재 식별.
3. 해석 케이스별 결과가 계산서 해당 장에 편입되어 출력.

## Functional Requirements

| ID | 요구사항 | Track | 우선순위 |
| --- | --- | --- | --- |
| FR-01 | 해석 케이스 데이터 모델 (schema + migration) | A | P0 |
| FR-02 | 해석 센터 UI — 케이스 목록/추가/삭제/실행/상태 | A | P0 |
| FR-03 | 정적 해석 케이스 (명시적 실행, 자동 미리보기와 공존) | A | P0 |
| FR-04 | 모달 해석 케이스 (모드 수, 결과: 주기/참여율/형상) | A | P0 |
| FR-05 | 응답스펙트럼 케이스 (스펙트럼/방향/조합법, modal/combined 응답; 층응답은 후처리 범위부터) | A | P0 |
| FR-06 | 선형 좌굴 케이스 (기준하중, 좌굴계수/모드) | A | P1 |
| FR-07 | P-Delta 옵션 (정적 케이스의 2차효과 토글) | A | P1 |
| FR-08 | 선형 시간이력 케이스 (지반가속도, 응답) | A | P1 |
| FR-09 | 해석 케이스 실행 상태·오류 표시 (수렴 로그) | A | P0 |
| FR-10 | 스프링 지지 입력 UI | B | P0 |
| FR-11 | 지점 침하 입력 UI | B | P1 |
| FR-12 | 온도 하중 입력 UI (균일/구배) | B | P1 |
| FR-13 | 부분/사다리꼴 분포하중 입력 UI | B | P1 |
| FR-14 | 트러스/인장전담 부재 지정 UI | B | P1 |
| FR-15 | 하중 케이스 매니저 (생성/타입/편집) | B | P0 |
| FR-16 | KDS 자동 하중산정 패널 (입력→생성→trace) | B | P1 |
| FR-17 | 층 질량·편심 생성 패널 | B | P1 |
| FR-18 | 힌지 배정 UI (부재 단부, backbone 선택) | C | P0 |
| FR-19 | Pushover 케이스 (방향/패턴/목표변위/현 엔진 지원 제어) + 실행 | C | P0 |
| FR-20 | Capacity curve·힌지 상태 진전 뷰 | C | P0 |
| FR-21 | 성능점·사용비·성능수준(IO/LS/CP) 판정 | C | P1 |
| FR-22 | NLTH 케이스 (지진파/scaling/감쇠, SDOF/bilinear Newmark trace preliminary) + 실행 | C | P1 |
| FR-23 | 해석 케이스별 결과 3D 전환 (모드/좌굴/힌지) | D | P0 |
| FR-24 | 부재 검정비 색상 맵 | D | P1 |
| FR-25 | 결과 차트 (곡선/시간이력/스펙트럼) | D | P1 |
| FR-26 | 해석 케이스 결과의 계산서 편입 | D | P1 |
| FR-27 | 해석 케이스 agent action/read API + 기능 설명서 등재 | A~D | P0 |

## Non-Functional Requirements

| ID | 항목 | 기준 |
| --- | --- | --- |
| NFR-01 | 난독화 모델러 불가침 | index.html 인라인 스크립트 무수정 (ESM 주입만) |
| NFR-02 | 자동 미리보기 성능 | 편집 중 자동 정적해석은 기존 반응성 유지 |
| NFR-03 | 명시적 해석 응답성 | 대표건물 모달/RSA 5초 내, pushover 60초 내 (기존 예산 계승) |
| NFR-04 | 재현성 | 해석 케이스는 모델에 저장되어 재로드·에이전트로 동일 실행 |
| NFR-05 | 회귀 안정성 | 기존 native UI 테스트(m22·m25·m26·m29 등) 무수정 green |
| NFR-06 | zero-dependency | 차트/뷰는 자체 SVG/Canvas (외부 라이브러리 없음) |
| NFR-07 | 이중 엔트리 | index.html 단독 + 앱 셸 iframe 양쪽에서 동작 |

## Explicit Non-Goals

1. 신규 해석 이론/요소/재료 추가 (엔진은 동결 — 결함 수정만).
2. OpenSees tcl 같은 텍스트 명령 콘솔 (GUI 해석 케이스로 대체).
3. 완전 자유 유한요소 메쉬 편집 (기존 격자/부재 모델 유지).
4. 실시간 협업 편집 (Phase 4 저장/리비전 체계 유지).
5. GPU 대규모 렌더 (기존 Canvas/WebGL2 범위).

## Success Criteria

| Check | Pass 조건 |
| --- | --- |
| 명시적 해석 | 해석 센터에서 6종 해석 케이스를 만들고 실행해 결과 확인. preliminary 엔진은 limitation 표기 (브라우저 실동작) |
| 하중 완전성 | 스프링·침하·온도·부분분포·트러스·KDS산정을 모두 UI로 입력 가능 |
| 비선형 워크플로 | 힌지 배정→pushover 실행→capacity/성능점을 한 흐름으로 |
| 결과 | 해석 케이스별 결과가 3D/차트로 전환되고 계산서에 편입 |
| 계약 | 신규 UI action/API가 agent-contract·featureCatalog에 등재, full suite green |
