# Phase 5 UI Architecture

status: active

## 1. Injection Model (기존 패턴 계승)

Phase 5 UI는 `index.html`의 난독화 모델러를 건드리지 않고, `installIndexEngineBridge`가 이미 하는 방식으로 ESM native 모듈을 주입한다.

```text
index.html (난독화 모델러, model()/reanalyze() 노출)
  └─ <script type="module" src="./src/ui/indexBridge.js">
       installIndexEngineBridge(window)
         ├─ SStructuresEngine = bridge   (엔진 API: analyzeModel, getLastResult, runPushover, …)
         ├─ installIndexNativeRibbon      (상단/서브바 리본)
         ├─ installIndexNativeResultControls
         ├─ installIndexNativeAdvancedAnalysis  (pushover/modal 리포트 — 확장 대상)
         └─ installIndexAnalysisCenter    ← Phase 5 신규
              installIndexLoadEditors     ← Phase 5 신규
              installIndexHingeAssign     ← Phase 5 신규
              installIndexResultViews     ← Phase 5 신규
```

각 신규 모듈은 기존 모듈처럼 `install...(target, { bridge })` 시그니처를 따르고, `bridge`로 엔진에 접근한다. DOM 주입 지점은 `#topbar`/`#subbar`/`#palette`/`#propPanel`/신규 도크.

## 2. Analysis Case Data Model

핵심 신규 스키마. `src/core/analysisCase.js`에 정의하고 model에 `analysisCases: []`를 추가, migration으로 구모델에 빈 배열을 채운다.

```js
// model.analysisCases[i]
{
  id: 'AC1',
  name: '모달 12모드',
  kind: 'static' | 'modal' | 'responseSpectrum' | 'buckling' | 'linearTha' | 'pushover' | 'nlth',
  settings: { /* kind별 (아래) */ },
  input: { combos?: ['E1'], loadCase?: 'D', massSource?: {...} },
  status: 'not-run' | 'running' | 'ok' | 'failed',
  lastRun: { at, ok, message, resultRef, summary } | null,
}
```

kind별 settings 계약 (specs/SPEC-A 상세):

| kind | settings 주요 필드 | 실행 엔진 함수 |
| --- | --- | --- |
| static | `{ pDelta: bool }` | `analyzeModel` (+ pDelta 옵션) |
| modal | `{ modeCount }` | `analyzeDynamics` |
| responseSpectrum | `{ spectrum, directions, combination: 'SRSS'\|'CQC' }` | `runResponseSpectrum` |
| buckling | `{ referenceCombo, modeCount }` | `estimateGlobalBucklingTrace` |
| linearTha | `{ record, dt, direction, dampingRatio }` | `runModalSuperpositionTha` |
| pushover | `{ direction, pattern, control, steps, targetDisp }` | `runPushover` |
| nlth | `{ record, scaling, rayleigh, dt }` | `runNewmarkNlth` |

**재현성(NFR-04)**: 케이스는 순수 데이터라 저장/재로드/에이전트 실행이 동일 결과를 낸다. 결과(resultRef)는 런타임 캐시를 가리키며 저장 대상이 아니다 (재실행으로 재현).

## 3. Auto Preview vs Explicit Analysis (공존 규칙)

오너 확정: 자동 정적해석은 **미리보기**로 유지, 정식 해석은 **명시적 실행**.

| 구분 | 트리거 | 대상 | 결과 위치 |
| --- | --- | --- | --- |
| 자동 미리보기 | 모델 편집 시 `reanalyze` | 정적(첫 조합/현재 조합) | 서브바 상태 + 3D 변형 (기존) |
| 명시적 해석 | 해석 센터 [실행] | 해당 케이스 종류 | 케이스 결과 핸들 + 결과 뷰 |

규칙:
1. 자동 미리보기는 정적만 하고 UI를 막지 않는다 (기존 반응성 유지).
2. 명시적 해석 결과는 케이스에 귀속되며 자동 미리보기가 덮어쓰지 않는다.
3. 정적 케이스를 명시 실행하면 자동 미리보기와 같은 엔진 경로(`analyzeModel`)를 쓰되, 결과를 케이스에 고정한다.
4. 모델이 바뀌면 케이스 상태는 `not-run`으로 표시(stale)되어 재실행을 유도한다 — 결과와 모델의 불일치 방지.

## 4. Result Handle

해석 케이스 실행 결과는 `SStructuresAnalysisResults`(런타임 맵)에 케이스 id로 저장한다.

```js
window.SStructuresAnalysisResults = Map<caseId, {
  kind, ranAt, ok, summary,
  payload,        // kind별 원자료 (byCombo / dynamics.modes / rsa / buckling / curve / timeHistory)
  view,           // 3D/차트 렌더용 정규화 데이터
}>
```

결과 뷰(P5-D)는 이 핸들만 소비한다 — 엔진을 다시 호출하지 않는다.

## 5. Module Boundaries

| 모듈 | 책임 | 금지 |
| --- | --- | --- |
| `src/core/analysisCase.js` | 케이스 스키마·검증·기본값·migration | DOM·엔진 실행 |
| `src/ui/indexAnalysisCenter.js` | 케이스 목록 UI, 실행 오케스트레이션 | 해석 이론 |
| `src/ui/analysisRunners.js` | kind→엔진 함수 매핑, 결과 정규화 | DOM |
| `src/ui/indexLoadEditors.js` | 하중/지지 입력 UI → model 변경 | 엔진 실행 |
| `src/ui/indexHingeAssign.js` | 힌지 배정 UI → model 변경 | 해석 |
| `src/ui/indexResultViews.js` | 결과 핸들 → 3D/차트 | 엔진 재호출 |

`analysisRunners.js`가 엔진과 UI를 잇는 유일한 지점이다 — kind가 늘어도 여기만 확장한다.

## 6. Agent Contract Extension

신규 read/execute (P5 각 트랙에서 등재):

```text
execute: addAnalysisCase, updateAnalysisCase, deleteAnalysisCase, runAnalysisCase, runAllAnalysisCases,
         setSpringSupport, setSettlement, addTemperatureLoad, addPartialLoad, setMemberBehavior,
         assignHinge, removeHinge
read:    listAnalysisCases, getAnalysisCaseResult, getHingeAssignments
```

기존 `runAnalysis`/`runPushover`는 유지(하위호환) 하되, 내부적으로 해석 케이스 경로로 수렴시킨다.

## 7. Testing Strategy

| 계층 | 대상 | 방법 |
| --- | --- | --- |
| 스키마 | analysisCase 검증·migration | 단위 (`tests/p5-analysis-case.mjs`) |
| runner | kind→엔진 매핑, 결과 정규화 | 단위 (엔진 stub/실호출) |
| UI | 케이스 목록/실행/상태, 하중 입력, 힌지 배정 | fake DOM (`tests/helpers/fakeIndexDom.mjs` 확장) |
| e2e | 프리뷰 브라우저 실행 시나리오 | preview 도구 + 콘솔 에러 0 증빙 |
| 회귀 | 기존 native 모듈 | 무수정 green |

## 8. Risks

| 위험 | 완화 |
| --- | --- |
| 난독화 모델러의 자동 reanalyze와 명시 해석 충돌 | §3 공존 규칙 + stale 표시. 자동은 정적 미리보기로 한정 |
| fake DOM이 실제 index DOM과 괴리 | 신규 DOM id를 spec에 고정, e2e로 실검증 |
| 해석 케이스 스키마가 기존 저장 모델과 비호환 | migration으로 빈 배열 주입, 결과는 비저장 |
| 엔진 함수 시그니처가 UI 기대와 불일치 | runner 계층에서 흡수, 불일치는 엔진 티켓 분리 |
