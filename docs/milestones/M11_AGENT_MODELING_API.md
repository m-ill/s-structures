# M11 Agent Modeling API

작성일: 2026-06-25  
대상: 기존 `index.html` UI를 AI agent와 API가 안정적으로 조작하기 위한 모델링 액션 계약

## 1. 목표

M11의 목표는 AI agent가 화면 조작 없이도 S-Structures 모델을 생성, 수정, 검증, 해석할 수 있는 API 액션을 제공하는 것이다.

M9-M10은 기존 UI에 엔진과 결과 도크를 연결했다. M11은 그 다음 단계로, agent가 같은 모델 객체를 직접 조작하고 기존 UI의 재해석 흐름을 호출하도록 만든다.

## 2. 구현 파일

```text
src/ui/indexAgentActions.js
src/ui/indexBridge.js
tests/m11-agent-modeling.mjs
```

## 3. 설계 원칙

- 모든 agent 모델 변경은 현재 UI가 사용하는 모델 객체를 직접 수정한다.
- 모델 변경 후에는 기존 `reanalyze(true)` 흐름을 호출한다.
- agent 전용 선택 상태는 `__SStructuresAgentState.selection`에 저장한다.
- 원본 `index.html` 내부 선택 상태는 난독화된 단일 스크립트 내부에 있으므로 강제로 접근하지 않는다.
- API 선택 상태와 모델 ID 목록은 `getSnapshot()`으로 읽을 수 있다.

## 4. Agent Snapshot 확장

`window.SStructuresAgent.getSnapshot()` 결과에 다음 블록을 추가했다.

```js
agent: {
  selection: {
    type,
    id,
    exists,
    connectedMemberIds,
    loadIds,
    nodeIds
  },
  entities: {
    nodeIds,
    memberIds,
    loadIds,
    loadCaseIds,
    combinationIds,
    sectionIds,
    materialIds
  }
}
```

## 5. 지원 액션

선택:

```js
execute('selectEntity', { type: 'member', id: 'M1' })
execute('clearSelection')
```

절점:

```js
execute('addNode', { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' })
execute('updateNode', { id: 'N1', x: 1 })
execute('deleteNode', { id: 'N1' })
execute('setSupport', { nodeId: 'N1', support: 'custom', fix: [true, true, true, false, false, false] })
execute('setNodeMass', { nodeId: 'N2', mass: [5, 5, 5] })
execute('updateNode', { id: 'N2', panelZone: { tp: 0.012, db: 0.55, dc: 0.6, axis: 'z' } })
```

부재:

```js
execute('addMember', { id: 'M1', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300' })
execute('updateMember', { id: 'M1', secId: 'h400' })
execute('deleteMember', { id: 'M1' })
execute('setMemberSection', { memberId: 'M1', secId: 'h300' })
execute('setMemberMaterial', { memberId: 'M1', matId: 'steel' })
execute('assignSection', { memberIds: ['M1', 'M2'], secId: 'h300' })
execute('updateMember', {
  id: 'M1',
  endOffset: { i: { dx: 0, dy: 0.2, dz: 0 }, j: 0.25, frame: 'global' },
  insertionPoint: 'top-center'
})
```

`updateMember`의 `releases`는 중첩 patch다. `releases.spring.{ryI,rzI,ryJ,rzJ}`는 기존 i/j 및
다른 spring 축을 보존하며, `spring:null`은 전체 회전스프링 삭제, `spring.{축}:null`은 해당 축만 삭제한다.
`endOffset:null`, `insertionPoint:null`, `panelZone:null`은 각각 M4 입력을 삭제한다. 벡터 오프셋은
`local|global` frame과 유한 숫자 성분만 허용하며 `rigidFactor<1`은 차단한다.

하중:

```js
execute('addLoad', { id: 'L1', type: 'nodal', node: 'N2', P: 10, dir: '-x', case: 'W' })
execute('addLoad', { id: 'L2', type: 'udl', member: 'M1', w: 8, dir: '-z', case: 'D' })
execute('updateLoad', { id: 'L1', value: 12 })
execute('deleteLoad', { id: 'L1' })
```

하중 케이스/조합:

```js
execute('addLoadCase', { id: 'W', name: 'Wind', type: 'wind' })
execute('updateLoadCase', { id: 'W', name: 'Wind X' })
execute('addLoadCombination', { id: 'CO-W', factors: { D: 1, W: 1 } })
execute('updateLoadCombination', { id: 'CO-W', factors: { D: 1, W: 1.3 } })
```

## 6. 안전장치

M11 액션은 다음 조건을 검사한다.

- 중복 ID 금지
- 없는 절점/부재/하중 참조 금지
- 같은 절점으로 부재 생성 금지
- custom support는 6개 boolean fix 배열 필요
- point load 위치 `t`는 0~1 범위로 제한
- node 삭제 시 연결 부재와 관련 하중을 함께 삭제
- member 삭제 시 관련 하중 삭제

## 7. 완료 기준

- agent가 빈 모델에서 절점, 부재, 하중을 만들 수 있다.
- agent가 단면/지점/질량/하중 값을 수정할 수 있다.
- agent가 선택 상태와 모델 ID 목록을 읽을 수 있다.
- 모델 변경 후 기존 UI 재해석 흐름이 호출된다.
- M0-M11 테스트가 모두 통과한다.
- 금지 문자열 검사를 통과한다.

## 8. 코드 리뷰 메모

이번 단계에서 검토한 주요 위험은 다음과 같다.

- 기존 UI 내부 선택 상태에 직접 접근하면 원본 단일 스크립트와 강하게 결합된다.
- `value` 기반 하중 수정이 P/M/w를 동시에 바꿀 수 있으므로 하중 타입별로 하나만 수정하도록 제한했다.
- 삭제 액션은 고아 하중을 만들지 않도록 연결 하중을 함께 제거한다.

## 9. 다음 단계

M12에서는 모델링 생산성을 높인다.

- 층/그리드/경간 기반 모델 생성 action
- 층 복사
- 부재 역할 자동 분류
- 하중 템플릿
- 질량 자동 생성
