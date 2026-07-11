# M9 Index UI Engine Bridge

작성일: 2026-06-25  
대상: 기존 `index.html` UI와 `src/` 구조해석 엔진 연결

## 1. 목표

M9의 목표는 기존 S-Structures UI를 유지하면서, M0-M8에서 만든 모듈형 해석 엔진을 기존 화면의 해석 호출 흐름에 연결하는 것이다.

기존 `m3.html`은 엔진 검증용 프로토타입으로 유지하고, 최종 사용 화면은 기존 `index.html` 구조를 따른다.

## 2. 적용 범위

이번 단계에서 적용한 범위는 다음과 같다.

- 기존 UI의 `analyzeModel(model)` 호출을 `src/index.js` 엔진으로 연결
- 기존 UI의 `validateModel(model)` 호출을 `src/core/validation.js` 검증기로 연결
- 기존 UI 결과 표시가 기대하는 `disp`, `nodeDisplacements`, `reactions`, `memberResults`, `envelope` 형태 유지
- 기존 UI 조작을 AI agent가 식별할 수 있도록 주요 버튼과 토글에 `data-agent-id` 부여
- `window.SStructuresEngine`과 `window.SStructuresAgent` 전역 API 제공
- M9 전용 회귀 테스트 추가

## 3. 브리지 구조

브리지 파일:

```text
src/ui/indexBridge.js
```

핵심 공개 함수:

```js
analyzeForIndex(model, options)
validateForIndex(model)
normalizeIndexResult(result, metadata)
installIndexEngineBridge(window)
createIndexAgentApi(window, bridge)
decorateAgentControls(document)
listAgentControls(document)
```

브라우저에서 `indexBridge.js`가 로드되면 자동으로 `installIndexEngineBridge(window)`가 실행된다.

## 4. 기존 UI 연결 방식

`index.html` 하단에 다음 모듈 스크립트를 추가했다.

```html
<script type="module" src="./src/ui/indexBridge.js"></script>
```

기존 UI 내부는 대형 단일 스크립트이므로 직접 대규모 수정하지 않았다. 대신 전역으로 노출된 기존 함수 이름을 브리지에서 교체한다.

교체 대상:

- `window.analyzeModel`
- `window.validateModel`

보존 대상:

- 기존 3D 캔버스
- 기존 팔레트
- 기존 속성 패널
- 기존 하중조합 UI
- 기존 보고서 UI
- 기존 저장/불러오기 흐름

## 5. Agent API

M9에서는 추후 computer use와 API 제어를 위한 최소 API를 열었다.

```js
window.SStructuresAgent.getSnapshot()
window.SStructuresAgent.getModel()
window.SStructuresAgent.setModel(model)
window.SStructuresAgent.getResults()
window.SStructuresAgent.runAnalysis()
window.SStructuresAgent.execute(action, payload)
```

지원 action:

```text
runAnalysis
setModel
setAnalysisSetting
setNodeMass
```

`getSnapshot()`은 AI agent가 화면을 직접 읽지 않고도 현재 모델 규모, 해석 상태, 주요 컨트롤 목록, 가능한 액션을 확인할 수 있게 한다.

## 6. UI 식별자 정책

브리지는 다음 요소에 `data-agent-id`를 자동 부여한다.

- 주요 상단 버튼
- 구조 도구 버튼
- 결과 토글
- 뷰 전환 버튼
- 하중조합 선택
- 보고서/검증/설정 메뉴
- 3D 내비게이션 버튼

예:

```html
data-agent-id="tool-member"
data-agent-id="result-M"
data-agent-id="view-iso"
```

이 값은 화면 텍스트가 바뀌어도 agent가 안정적으로 조작할 수 있는 계약으로 사용한다.

## 7. 완료 기준

M9 완료 기준은 다음과 같다.

- 기존 `index.html`에서 모듈형 엔진 브리지가 로드된다.
- 기존 UI 해석 호출이 `src/` 엔진으로 연결된다.
- M0-M9 테스트가 모두 통과한다.
- 코드 범위에 금지 문자열이 남지 않는다.
- 브라우저에서 `window.SStructuresEngine`과 `window.SStructuresAgent`가 존재한다.

## 8. 다음 단계

M10에서는 기존 UI 결과 표시를 더 깊게 연결한다.

- P-Delta 내부 반복 재생을 기존 player bar에 연결
- 모달/RSA 결과 패널 추가
- 설계비 컬러맵 개선
- 부재력도와 반력 표시를 새 엔진 결과 기준으로 정리

M11에서는 agent 조작 계약을 더 넓힌다.

- 선택 객체 읽기
- 부재/절점 생성 action
- 하중/단면/지점 입력 action
- UI 상태와 API 상태의 동기화 검증
