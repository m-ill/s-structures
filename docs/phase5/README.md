# Phase 5 Development Hub — 전문 구조해석 UI 완성

phase: 5
status: active (planning)
start: 2026-07-04
mission: 이미 구현된 **자체 해석·설계 엔진**을 사용자가 화면에서 명시적으로 조작할 수 있는 전문 구조해석 프로그램으로 완성한다.

> **엔진은 100% 자체 구현이다.** 강성행렬 조립·선형 풀이·모달·RSA·좌굴·corotational 비선형·Newmark NLTH까지 `src/solver`·`src/dynamics`·`src/nonlinear`(합계 6,000줄+)에 직접 작성되어 있고, OpenSees를 비롯한 어떤 외부 해석 엔진에도 의존하지 않는다(zero-dependency, node_modules 없음). 아래에서 OpenSees·Perform-3D를 언급하는 것은 **UI/워크플로를 어떻게 구성할지에 대한 참고 사례**일 뿐, 그 엔진을 채택한다는 뜻이 전혀 아니다.

## Why Phase 5

Phase 4까지 엔진은 상용 구조해석 프로그램에 근접한 범위를 갖췄다 — 스프링/침하/트러스/온도/부분분포 하중, 모달·응답스펙트럼·좌굴·선형 시간이력, 정식 pushover·PMM 힌지·fiber·NLTH, RC/철골/기초 설계. 그러나 **UI 표면이 엔진을 따라가지 못한다.** 실사용 결과 확인된 문제:

1. **해석 실행 버튼이 없다.** 해석은 모델을 편집하면 자동으로 돌아가며(`reanalyze`), 해석 종류를 고르고 실행하는 명시적 제어가 없다. 모달·RSA·좌굴·pushover·NLTH는 화면에서 실행할 방법이 사실상 없다.
2. **하중 조건이 기본형만 노출된다.** 팔레트 하중 도구는 집중/등분포/모멘트 3종뿐. 엔진의 스프링·침하·온도·부분분포·트러스·하중케이스 관리·KDS 자동산정은 UI에서 접근 불가.
3. **비선형 성능평가 흐름이 없다.** 힌지 배정→해석→성능점 판정을 잇는 워크플로가 화면에 없다.

이 격차의 정량화는 `CURRENT_UI_GAP_ASSESSMENT.md`에 고정한다.

## Direction (오너 확정, 2026-07-04)

| 결정 항목 | 확정 |
| --- | --- |
| 해석 실행 방식 | **해석 실행 센터 신설** — 자동 정적해석은 빠른 미리보기로 유지하되, 정식 해석은 종류(정적·모달·RSA·좌굴·pushover·NLTH)를 고르고 [실행]으로 돌린 뒤 결과를 관리하는 전용 화면 |
| 범위 | **4개 영역 전부** 순차 완성: ① 해석 제어 UI ② 하중 조건 확장 ③ 비선형 성능평가 워크플로 ④ 결과·계산서 강화 |
| UI 참고 사례 | OpenSees(명시적 해석 케이스·요소/재료/해석 조합의 UX)와 Perform-3D(성능기반 GUI 워크플로)를 **화면 구성 참고용으로만** 본다. 해석은 우리 자체 엔진이 수행. 완전 명령형이 아니라 **명시적 해석 케이스 + GUI 워크플로**의 절충 |

## Core Concept: Analysis Case

Phase 5의 중심 개념은 **해석 케이스(Analysis Case)**다. OpenSees의 analysis object와 Perform-3D의 analysis series에 대응한다.

```text
Analysis Case = {
  종류: static | modal | responseSpectrum | buckling | pushover | nlth
  설정: 해석 종류별 파라미터 (모드 수, 스펙트럼, 힌지 패턴, 지진파, 제어 방식 …)
  입력 참조: 하중조합 또는 하중 케이스, 질량 소스
  상태: not-run | running | ok | failed
  결과: 결과 핸들 (변위/부재력/모드/곡선/시간이력)
}
```

모델은 여러 해석 케이스를 갖고, 사용자는 해석 센터에서 케이스를 만들고 실행하고 결과를 비교한다. 이것이 "버튼을 눌러 해석하는" 경험의 기반이다.

## Phase 5 Tracks

| Track | 목적 | 세부 명세 |
| --- | --- | --- |
| P5-A 해석 실행 센터 | 해석 케이스 관리 + 종류별 실행/설정/상태/결과 | `specs/SPEC-A-analysis-center.md` |
| P5-B 하중 조건 확장 | 스프링/침하/온도/부분분포/트러스 입력 UI + 하중 케이스 매니저 + KDS 산정 패널 | `specs/SPEC-B-load-conditions.md` |
| P5-C 비선형 성능평가 | 힌지 배정 UI → pushover/NLTH 실행 → capacity/성능점/힌지 상태 | `specs/SPEC-C-nonlinear-workflow.md` |
| P5-D 결과·계산서 강화 | 부재력/응력비/힌지 분포 시각화, 해석 케이스별 결과, 계산서 통합 | `specs/SPEC-D-results-reporting.md` |

## Document Set

| 문서 | 역할 |
| --- | --- |
| `CURRENT_UI_GAP_ASSESSMENT.md` | 2026-07-04 UI 격차 진단 스냅샷 (Phase 5 근거) |
| `PRODUCT_REQUIREMENTS.md` | Phase 5 PRD — 사용자·시나리오·FR/NFR·벤치마크·비목표 |
| `ARCHITECTURE.md` | UI 레이어 아키텍처, 해석 케이스 데이터 모델, 자동↔명시 해석 공존 규칙 |
| `ROADMAP.md` | P5-M0~M12 마일스톤과 exit criteria |
| `IMPLEMENTATION_BACKLOG.md` | P5-T## 티켓 (수용 기준 포함) |
| `specs/SPEC-A..D-*.md` | 영역별 세부 기능 명세 (화면·요소·동작·엔진 연결·수용 기준) |
| `workpackages/WP-*.md` | 실행 단위 작업 패키지 |

## Reading Order

1. `CURRENT_UI_GAP_ASSESSMENT.md` — 무엇이 안 보이는가
2. `PRODUCT_REQUIREMENTS.md` — 무엇을 만드는가
3. `ARCHITECTURE.md` — 어떻게 얹는가 (해석 케이스 모델)
4. 착수 트랙의 `specs/SPEC-*.md` — 화면·동작 상세
5. `ROADMAP.md` / `IMPLEMENTATION_BACKLOG.md` — 순서와 티켓

## Working Agreements

Phase 4 게이트를 계승하고 추가한다.

1. **엔진 재사용 우선**: Phase 5는 원칙적으로 신규 해석 로직을 만들지 않는다. 이미 있는 엔진 함수(`analyzeModel`, `analyzeDynamics`, `runResponseSpectrum`, `estimateGlobalBucklingTrace`, `runPushover`, `runNewmarkNlth` 등)를 UI로 노출한다. 엔진 결함 발견 시 별도 티켓·커밋.
2. **난독화 모델러 불가침**: `index.html`의 난독화 인라인 모델러는 수정하지 않는다. 모든 신규 UI는 ESM native 모듈(`src/ui/index*.js`)로 주입한다 — 기존 `installIndexEngineBridge` 패턴 계승.
3. **명세 우선**: 각 화면은 `specs/`에 요소·동작·엔진 연결·수용 기준이 정의된 뒤 구현한다.
4. **agent 계약 동기**: 새 UI action/read API는 `agent-contract.json`·capability manifest에 등재, 기능 설명서(featureCatalog)에 반영.
5. **브라우저 실검증 필수**: 각 화면은 fake DOM 테스트 + 프리뷰 브라우저 실동작(콘솔 에러 0) 증빙.
6. **회귀 불변**: `npm test` full green이 merge 조건. 기존 native 모듈 테스트(m22·m25·m29 등) 무수정 통과.
