# AI Agent Guide

aiReadable: true
stableInterfaceFirst: true

이 문서는 AI agent, browser automation, computer-use controller가 S-Structures를 제어할 때 우선 읽어야 하는 빠른 참조다. 화면 텍스트보다 API method, action 이름, `data-agent-id`를 우선한다.

## Global Objects

| object | 역할 |
| --- | --- |
| `window.SStructuresAgent` | 모델 읽기, 해석, action 실행, 보고서 생성 |
| `window.SStructuresAgentCommandBridge` | DOM event, postMessage, URL hash 기반 명령 실행 |
| `#sstructuresAgentApi` | hidden response node. 마지막 command 결과가 JSON으로 기록됨 |
| `[data-agent-id]` | 화면 제어용 stable selector |

## First Calls

agent는 항상 아래 순서로 현재 상태를 읽는다.

```js
const caps = window.SStructuresAgent.getCapabilities();
const snapshot = window.SStructuresAgent.getSnapshot();
const screen = window.SStructuresAgent.getScreenState();
```

필수 확인값:

| field | 의미 |
| --- | --- |
| `caps.readApis` | 호출 가능한 읽기 API |
| `caps.executeActions` | 실행 가능한 action |
| `caps.uiContract.controls` | stable UI control 목록 |
| `snapshot.model` | node/member/load/combination 개수 |
| `snapshot.analysis?.ok` | 저장된 현재 해석의 성공 여부. 결과가 없으면 analysis는 null |
| `screen.nativeUi.activeMode` | 현재 상단 작업 탭 |

`caps.qaCommands` exposes the Phase 3 local QA commands. AI agents should read it before reporting Phase 3 readiness.

## Read APIs

| method | 반환 목적 |
| --- | --- |
| `getModel()` | 현재 schema-versioned model |
| `getSnapshot()` | 모델, 해석, 결과, agent 상태 요약 |
| `getScreenState()` | 현재 화면/리본/모달/컨트롤 상태 |
| `getResults()` | 현재 해석 결과 |
| `getResultView()` | 결과 panel/view-model |
| `getResultVisuals(options)` | 노드/부재 결과 시각화 데이터 |
| `getReport(options)` | 준비된 기본 HTML 보고서 조회 |
| `getDetailedReport(options)` | 준비된 상세 HTML 보고서 조회 |
| `getCalculationPackage(options)` | 준비된 계산서 패키지 HTML 조회 |
| `getDesignBasisInput(options)` | 설계기준 입력 상태와 preview |
| `getDesignBasisLoadEstimation(options)` | 자동 하중 산정 결과 |
| `getKdsLoadStandardAudit(options)` | KDS-style 조합 audit |
| `getMemberDesignTraceReport(options)` | 부재별 설계 trace |
| `getServiceabilityDriftReport(options)` | 층간변위 검토 |
| `getRuntimeDiagnostics()` | 원본 index runtime adapter 진단 |

## Phase 19 Result Preparation

Phase 19 M1부터 설계·보고서 계산형 `get*`는 준비된 결과를 읽는다. 결과가 없으면 `RESULT_REQUIRED`, 입력이나 해석 실행이 바뀌면 `STALE_INPUT`이다. `getSnapshot()`은 재해석을 실행하지 않는다.

```js
// 현재 개발 버전의 명시적 legacy 보고서 준비 경로
const agent = window.SStructuresAgent;
agent.runAnalysis();
agent.prepareResultView('getDetailedReport', { title: 'Review' });
const report = agent.getDetailedReport({ title: 'Review' });
```

조회와 준비에는 동일한 options를 사용한다. `prepareResultView`는 등록된 view만 지원하며 WebMCP v1 도구로 공개되지 않는다. 새 입력 식별·결과 API와 전체 준비 대상은 [M0~M1 계약](../phase19/M0_M1_CONTRACT.md)을 참고한다. 후속 M3에서 제품 실행 기록과 설계 서비스를 직접 연결한다.

## QA Commands

AI agents should read `window.SStructuresAgent.getCapabilities().qaCommands` before reporting Phase 3 readiness. The canonical commands are also stored in `docs/user-manual/agent-contract.json`.

For Phase 4 pre-beta documentation and release checks, use:

| command | purpose |
| --- | --- |
| `npm.cmd run check:agent-contract` | verify `agent-contract.json` matches current code |
| `npm.cmd run test:m109` | verify manual coverage map and agent contract |
| `npm.cmd run test:m110` | verify onboarding samples and tutorial links |
| `npm.cmd run test:m108` | verify release folder and zip creation |

## Phase 4 Shell Routes

| route | purpose |
| --- | --- |
| `#/local/modeler` | standalone local modeler entry |
| `#/projects` | project list after login |
| `#/p/:projectId/modeler` | native modeler host with server revision save |
| `#/p/:projectId/revisions` | revision list |
| `#/p/:projectId/library` | project material/section library shell view |
| `#/p/:projectId/import/:jobId` | import review overlay and confirmation |
| `#/p/:projectId/report` | project report shell |

| command key | purpose |
| --- | --- |
| `phase3Full` | run the full P3-M0 to P3-M20 gate |
| `phase3List` | list the exact milestone/test mapping |
| `phase3M6ToM20` | rerun the requested P3-M6 restart-to-launch range |
| `phase3RunnerContract` | verify the runner mapping contract |
| `phase3PlanAlignment` | verify the 14-document plan alignment contract |
| `phase3DocReferences` | verify referenced local files in Phase 3 docs exist |
| `phase3ServerRoutes` | verify server route declarations match the Phase 3 endpoint contract |

## Execute Actions

대표 action은 아래와 같이 묶어 사용한다.

| group | actions |
| --- | --- |
| 공통 해석 | `getAnalysisCapabilities`, `validateAnalysisRun`, `planAnalysisRun`, `startAnalysisRun`, `getAnalysisRunStatus`, `getAnalysisRunResult`, `getAnalysisResultSlice`, `getAnalysisRunReport`, `exportAnalysisTelemetry` |
| 레거시 동기 해석 | `runAnalysis`, `runPushover` - 호환 전용, GPU·설계전달 불가 |
| 화면 모드 | `setNativeMode`, `setNativeResultScale`, `setNativePDeltaEnabled`, `setNativePDeltaStep` |
| native 모델링 | `nativeClearPage`, `nativeDrawMember`, `nativeAddColumn`, `nativeSetSupport`, `nativeAddUdl`, `nativeAddNodalLoad`, `nativeMoveNode`, `nativeSelectMember`, `nativeDeleteElement` |
| 생산성 모델링 | `createGridFrame`, `copyStory`, `autoAssignMemberRoles`, `applyLoadTemplate`, `generateFloorMass` |
| 하중/조합 | `setDesignBasisInput`, `applyDesignBasisLoads`, `applyKdsLoadCombinations`, `applyKdsRuleBasedLoadCombinations` |
| 보고서 | `openNativeDetailedReport`, `openNativeCalculationPackage`, `openNativeDesignReport`, `runNativeValidation` |
| 예비 비선형 UI | `setPushoverOption`, `setPushoverPanelOpen`, `runNativePushoverReport` |
| 저장 | `loadNativeExample`, `exportNativeBook`, `importNativeBook`, `saveNativeAutosave`, `restoreNativeAutosave` |

## Direct API Pattern

```js
window.SStructuresAgent.execute('setNativeMode', { mode: 'modeling' });

window.SStructuresAgent.execute('createGridFrame', {
  baysX: 2,
  baysY: 1,
  stories: 2,
  bayX: 5,
  bayY: 4,
  storyH: 3,
  baseSupport: 'fixed'
});

window.SStructuresAgent.execute('autoAssignMemberRoles');
window.SStructuresAgent.execute('generateFloorMass', { massPerFloor: 18 });

window.SStructuresAgent.execute('applyLoadTemplate', {
  template: 'gravityUdl',
  case: 'D',
  w: 5
});

window.SStructuresAgent.execute('applyLoadTemplate', {
  template: 'windX',
  case: 'WX',
  total: 12
});

window.SStructuresAgent.execute('applyKdsRuleBasedLoadCombinations', {
  replace: true,
  includeService: true
});

const after = window.SStructuresAgent.runAnalysis();
```

## Command Bridge Pattern

DOM event:

```js
document.dispatchEvent(new CustomEvent('sstructures:agent-command', {
  detail: {
    id: 'run-analysis-1',
    method: 'runAnalysis'
  }
}));

const response = JSON.parse(document.getElementById('sstructuresAgentApi').textContent);
```

Execute action through bridge:

```js
document.dispatchEvent(new CustomEvent('sstructures:agent-command', {
  detail: {
    id: 'add-column-1',
    method: 'execute',
    action: 'nativeAddColumn',
    payload: {
      base: [0, 0, 0],
      height: 3,
      support: 'fixed'
    }
  }
}));
```

postMessage:

```js
window.postMessage({
  type: 'sstructures:agent-command',
  command: {
    id: 'screen-state-1',
    method: 'getScreenState'
  }
});
```

URL hash:

```text
#sstructures-command=%7B%22id%22%3A%22cap%22%2C%22method%22%3A%22getCapabilities%22%7D
```

## Recommended Elastic Workflow For AI

1. `getCapabilities()`로 현재 기능 확인.
2. `setNativeMode({ mode: 'modeling' })`.
3. 기존 모델을 쓸지, `nativeClearPage` 후 새 모델을 만들지 결정.
4. `createGridFrame` 또는 native action으로 모델 생성.
5. `autoAssignMemberRoles`.
6. `setDesignBasisInput`으로 값 preview.
7. `applyDesignBasisLoads`로 하중 생성.
8. `applyKdsRuleBasedLoadCombinations`.
9. `runAnalysis`.
10. `getResults`, `getServiceabilityDriftReport`, `getMemberDesignTraceReport`.
11. `getCalculationPackage`.
12. `snapshot.analysis.ok`, validation errors, report audit를 확인.

## Output Interpretation

| status | 처리 |
| --- | --- |
| `analysis.ok === true` | 해석 수치 계산은 성공. 보고서 검토로 넘어감 |
| validation error 존재 | 모델 입력을 먼저 수정 |
| `qualityAudit.ok === false` | 계산서의 누락 항목을 사용자에게 보고 |
| drift status `WARN` 또는 `NG` | 층간변위 제한, 조합, 횡하중 입력 재검토 |
| design status `NG` | 단면/재료/하중/조합 또는 설계식 trace 확인 |

## Do Not Assume

AI agent는 아래 항목을 자동으로 확정하지 않는다.

| 항목 | 이유 |
| --- | --- |
| 최종 인허가용 설계 적합성 | 현재 보고서는 preliminary calculation aid |
| 세부 KDS 풍/지진 절차 완료 | 현재는 KDS-style preset/rule/audit 수준 |
| 접합부/기초 최종 설계 | 현재는 예비 검토와 force trace 중심 |
| 정식 비선형 수렴 결과 | pushover는 preliminary |
| 도면 이미지 자동 모델링 | 향후 agentic vision import 대상 |
