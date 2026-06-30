# M16 Agent Capability Manifest

작성일: 2026-06-25  
대상: AI agent와 Computer Use가 S-Structures 화면/API를 안정적으로 파악하기 위한 capability manifest

## 1. 목표

M16의 목표는 agent가 조작을 시작하기 전에 현재 S-Structures가 제공하는 API, 실행 action, 화면 식별자 계약, 제한사항을 한 번에 읽을 수 있게 만드는 것이다.

이 단계는 M11-M15에서 추가한 agent 조작, 결과 시각화, 보고서, pushover API를 하나의 manifest로 묶는다.

## 2. 구현 파일

```text
src/ui/agentManifest.js
src/ui/indexBridge.js
src/index.js
tests/m16-agent-capabilities.mjs
```

## 3. 제공 API

코어 API:

```js
import { buildAgentManifest } from './src/index.js';
```

Agent API:

```js
window.SStructuresAgent.getCapabilities()
```

## 4. Manifest 구조

주요 필드:

```js
{
  version,
  product,
  bridgeVersion,
  modules,
  readApis,
  executeActions,
  uiContract,
  dataContracts,
  milestones,
  limitations
}
```

핵심 계약:

- 안정적인 화면 식별자는 `data-agent-id`를 사용한다.
- 모델 변경은 `executeActions`의 action으로 수행한다.
- 큰 데이터 읽기는 `readApis`로 수행한다.
- M15 pushover는 preliminary 상태로 명시한다.

## 5. Agent 사용 흐름

권장 순서:

1. `getCapabilities()`로 가능한 API와 action 확인
2. `getSnapshot()`으로 현재 모델/해석/화면 상태 확인
3. 필요 시 `execute(...)`로 모델 수정
4. `getResultVisuals()`로 3D 결과 시각화 데이터 확인
5. `getReport()`로 계산서 초안 생성
6. 비선형 검토가 필요하면 `runPushover()` 실행

## 6. 코드 리뷰 메모

이번 단계에서 확인한 주요 위험과 조치:

- action 목록이 snapshot과 manifest에서 달라지면 agent가 잘못된 action을 시도할 수 있으므로, 브리지 내부 `availableAgentActions()`를 공통으로 사용하게 했다.
- manifest에는 전체 좌표나 결과 배열을 넣지 않고, API 목록과 제한사항만 넣어 가볍게 유지했다.
- M15 pushover는 아직 preliminary이므로 manifest와 limitations에 명확히 표시했다.
- 화면 자동화는 텍스트보다 `data-agent-id`를 우선 사용하도록 계약을 명시했다.

## 7. 완료 기준

- `getCapabilities()`로 읽기 API, 실행 action, UI 계약, 제한사항을 확인할 수 있다.
- snapshot의 `availableActions`와 manifest의 `executeActions`가 일치한다.
- M16 테스트에서 manifest 버전과 action/read API 목록을 검증한다.
- M0-M16 전체 테스트 묶음에 포함된다.
- 금지 문자열 검사를 통과한다.
