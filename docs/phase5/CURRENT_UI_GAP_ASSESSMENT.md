# Current UI Gap Assessment

snapshot: 2026-07-04 (main HEAD 기준)
status: 고정 스냅샷 — Phase 5 계획의 근거. 이후 변경은 ROADMAP/BACKLOG에 반영하고 이 문서는 수정하지 않는다.

## 전제: 해석 엔진은 100% 자체 구현

2026-07-04 확인: `package.json`에 dependencies 없음, `node_modules` 없음, OpenSees/OpenSeesPy/tcl/ABAQUS/SAP2000/ETABS/Perform-3D 참조 0건. 선형 풀이(`solveLinear`), 강성 조립(`assembleStiffness3D`), 반력 회복(`recoverReactions`), 스프링 지지(`applyNodeSprings`), 모달/RSA, corotational 비선형, Newmark NLTH가 `src/solver`(2,643줄)·`src/dynamics`(710줄)·`src/nonlinear`(2,728줄)에 직접 작성. **Phase 5는 이 자체 엔진을 UI로 노출하는 작업이며, 외부 엔진 도입이 아니다.**

## 진단 방법

`src/platform/featureCatalog.js`의 기능별 `relatedActions`에서 native UI 경로(`native*` 접두 = index.html 리본/팔레트, `run*` = 실행 액션)를 가진 기능과, agent/자동 경로로만 접근되는 기능을 분리해 집계했다. UI DOM 구조는 `index.html`의 `#topbar`/`#subbar`/`#palette`에서 직접 확인했다.

## 현재 UI 구조 (index.html)

| 영역 | 위치 | 노출 내용 |
| --- | --- | --- |
| 상단 탭 (`#topbar`) | 파란 바 | 메뉴, 모드 탭(모델링·탄성해석·비선형해석·태블릿메모), 페이지 네비, 계정 |
| 서브바 (`#subbar`) | 흰 바 | 보기(3D/평면/정면/측면), 펜, **결과 표시 토글 14종**, 조합 선택, 상태 |
| 팔레트 (`#palette`) | 좌 202px | 모델링 도구 12종 (아래) |
| 속성 (`#propPanel`) | 우측 | 선택 개체 속성 |
| 리포트 (`#reportModal`) | 모달 | 상세보고서·계산서·pushover/modal 리포트 |

팔레트 도구 12종: `smove(이동)` `member(부재)` `column(기둥)` `addnode(절점)` `pin(힌지)` `roller(롤러)` `fixed(고정)` `pload(집중하중)` `udl(등분포)` `mload(모멘트)` `boxsel(박스선택)` `sdelete(삭제)`.

**결정적 관찰**: 서브바에는 "결과를 어떻게 볼지"만 있고 "해석을 어떻게 실행할지"가 없다. 해석 실행은 모델 편집 시 자동(`reanalyze`, 코드 내 52곳)으로만 일어난다.

## 격차 1 — 해석 실행 (11개 기능 중 UI 버튼 3개)

| 해석 기능 | 엔진 함수 | UI 버튼 | 상태 |
| --- | --- | --- | --- |
| 선형 정적 | `analyzeModel` | 자동(reanalyze) | 버튼 없음, 자동만 |
| 모델 검증 | `validateModel` | `mValidate` | ✅ 있음 |
| P-Delta | `analyzePDeltaCombinations` | — | **UI 없음** |
| 모달 | `analyzeDynamics` | (리포트 버튼만) | **실행 UI 없음** |
| 응답스펙트럼 RSA | `runResponseSpectrum` | — | **UI 없음** |
| 선형 시간이력 | `runModalSuperpositionTha` | — | **UI 없음** |
| 선형 좌굴 | `estimateGlobalBucklingTrace` | — | **UI 없음** |
| Pushover | `runPushover` | `ssRunPushover`(실험 패널) | 부분 (experimental_ui 플래그) |
| PMM 힌지/fiber | (nonlinear/*) | — | **UI 없음** |
| NLTH | `runNewmarkNlth` | — | **UI 없음** |
| 탄성 확장 trace | `buildAdvancedElasticTrace` | — | 판독 API만 |

요약: **모달·RSA·좌굴·선형THA·P-Delta·NLTH·fiber를 화면에서 실행할 수단이 없다.** pushover는 `?experimental_ui=1` 플래그가 있어야 패널이 뜬다.

## 격차 2 — 하중 조건 (7개 기능 중 팔레트 버튼 2개)

| 하중 기능 | 엔진 지원 | 팔레트/UI 버튼 | 상태 |
| --- | --- | --- | --- |
| 하중 케이스 관리 | schema loadCases | (조합 모달 일부) | **전용 UI 없음** |
| 절점 하중 | LOAD_TYPES nodal/nmoment | `pload`, `mload` | ✅ 있음 |
| 부재 하중 (등분포) | udl | `udl` | ✅ 있음 |
| 부분/사다리꼴 분포 | udl-partial, trapezoid | — | **UI 없음** |
| 온도 하중 | temperature, tgradient | — | **UI 없음** |
| 스프링 지지 | support:spring | — | **UI 없음** (팔레트는 고정/힌지/롤러만) |
| 지점 침하 | node.settlement | — | **UI 없음** |
| 트러스/인장전담 | member.type | — | **UI 없음** |
| KDS 자동산정 | `applyDesignBasisLoads` | (에이전트만) | **UI 없음** |
| 층 질량/편심 | `generateFloorMass` | — | **UI 없음** |

요약: **실무 하중 입력의 절반 이상이 UI에 없다.** 특히 스프링/침하는 팔레트 지지 도구가 고정·힌지·롤러 3종뿐이라 입력 경로 자체가 없다.

## 격차 3 — 비선형 성능평가 워크플로

엔진에는 소성힌지(M-θ), PMM 힌지, fiber 단면, pushover(하중/변위/arc-length 제어), NLTH(Newmark)가 있으나, 이를 잇는 **워크플로 UI가 없다**:
- 힌지를 부재에 배정하는 화면 없음
- 성능점(performance point)·사용비(usage ratio)·성능수준(IO/LS/CP) 판정 화면 없음
- capacity curve·힌지 상태 진전을 보는 전용 뷰 없음 (pushover 리포트 모달만 부분 존재)

## 격차 4 — 결과·계산서

결과 표시는 서브바 토글(변형/M/Q/N/반력)로 탄성 정적 결과만 3D에 그린다. 부족한 것:
- 해석 케이스별 결과 전환 (모달 형상, RSA 층응답, 좌굴 모드, pushover 곡선을 3D/차트로)
- 부재 응력비·검정비의 색상 맵
- 힌지 분포·상태 3D 표시
- 해석 케이스 결과가 계산서에 케이스별로 편입

## 결론

엔진은 전문 프로그램 범위를 갖췄으나 **UI가 "탄성 기본 모델링 + 자동 정적해석"에 멈춰 있다.** Phase 5는 신규 해석 로직 없이, 이 엔진을 화면으로 끌어올리는 작업이다. 중심축은 **해석 케이스**(격차 1 해소)이며, 이것이 서면 나머지 3격차(하중·비선형·결과)가 케이스 입력/실행/출력으로 자연히 연결된다.
