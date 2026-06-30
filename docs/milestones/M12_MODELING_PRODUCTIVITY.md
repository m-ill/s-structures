# M12 Modeling Productivity Actions

작성일: 2026-06-25  
대상: 기존 `index.html` UI와 agent API에서 반복 모델링 작업을 빠르게 수행하기 위한 생산성 액션

## 1. 목표

M12의 목표는 M11의 단일 객체 생성/수정 액션 위에, 건축 구조 모델링에서 반복되는 작업을 한 번의 API 호출로 처리하는 것이다.

대상 작업:

- 층, 경간 기반 3D 격자 골조 생성
- 기준 층 복사
- 부재 역할 자동 분류
- 중력/수평 하중 템플릿 적용
- 층 질량 자동 분배

이 액션들은 AI agent가 화면을 직접 클릭하지 않아도 현재 모델을 빠르게 구성하고 해석 가능한 상태로 만들기 위한 중간 계약이다.

## 2. 구현 파일

```text
src/ui/indexAgentActions.js
tests/m12-modeling-productivity.mjs
package.json
```

## 3. 추가 액션

### 3.1 `createGridFrame`

3D 직교 격자 골조를 생성한다.

```js
execute('createGridFrame', {
  baysX: 2,
  baysY: 1,
  stories: 2,
  bayX: 5,
  bayY: 4,
  storyH: 3
})
```

동작:

- `(baysX + 1) x (baysY + 1) x (stories + 1)` 절점 생성
- 최하층 절점은 기본 fixed 지점으로 생성
- 수직 부재는 `design.role = "column"`
- 각 층 수평 부재는 `design.role = "beam"`
- `replace !== false`이면 기존 절점, 부재, 하중을 비우고 새 모델을 만든다.

### 3.2 `copyStory`

특정 z 좌표의 층을 다른 z 좌표로 복사한다.

```js
execute('copyStory', {
  fromZ: 6,
  toZ: 9
})
```

동작:

- 동일 x/y 위치의 절점을 새 z 좌표에 생성
- 원본 층 내부 수평 부재를 복사
- 기본적으로 원본 층과 새 층 사이에 기둥을 연결
- 이미 같은 위치의 절점이나 같은 양 끝 절점의 부재가 있으면 중복 생성하지 않는다.

### 3.3 `autoAssignMemberRoles`

부재 방향으로 역할을 자동 분류한다.

```js
execute('autoAssignMemberRoles')
```

분류 기준:

- 수직 성분이 큰 부재: `column`
- 경사 부재: `brace`
- 수평 부재: `beam`

### 3.4 `applyLoadTemplate`

하중 템플릿을 적용한다.

```js
execute('applyLoadTemplate', {
  template: 'gravityUdl',
  case: 'D',
  w: 5
})

execute('applyLoadTemplate', {
  template: 'windX',
  case: 'W',
  total: 12
})
```

지원 템플릿:

- `gravityUdl`: beam 역할 부재에 등분포 하중 생성
- `windX`: 기준층을 제외한 절점에 X 방향 수평 하중 분배
- `windY`: 기준층을 제외한 절점에 Y 방향 수평 하중 분배

안전장치:

- 템플릿 하중에는 `source`를 기록한다.
- 기본값에서는 같은 `source`와 같은 하중 케이스의 기존 템플릿 하중을 제거한 뒤 다시 생성한다.
- `replace: false`를 넘기면 기존 템플릿 하중을 유지하고 추가 생성한다.
- 새 하중 케이스가 기존 조합에 포함되어 있지 않으면 단순 해석 조합을 자동 추가한다.

### 3.5 `generateFloorMass`

각 층의 절점에 집중 질량을 분배한다.

```js
execute('generateFloorMass', {
  massPerFloor: 18
})
```

동작:

- 기본적으로 기준층은 제외한다.
- 각 층의 절점 수로 `massPerFloor`를 균등 분배한다.
- 절점 질량은 `[mx, my, mz]` 배열로 저장한다.

## 4. 검증

M12 테스트는 다음 흐름을 검증한다.

1. 2 x 1 경간, 2층 골조 생성
2. 절점 18개, 부재 26개 생성 확인
3. 부재 역할 자동 분류 결과 확인
4. 2개 층에 질량 자동 분배 확인
5. 중력 하중 템플릿 적용 및 반복 적용 시 중복 방지 확인
6. 풍하중 템플릿 적용 및 풍하중 조합 자동 생성 확인
7. 최상층 복사 후 절점 24개, 부재 39개 확인
8. 최종 해석 성공 확인

실행:

```text
npm.cmd run test:m12
```

## 5. 코드 리뷰 메모

이번 단계에서 확인한 주요 위험과 조치:

- 대량 생성 액션은 한 번에 모델을 크게 바꾸므로 생성 개수를 테스트로 고정했다.
- 템플릿 하중을 agent가 반복 실행하면 같은 하중이 누적될 수 있으므로 `source` 기반 교체 동작을 추가했다.
- 새 하중 케이스만 만들고 조합에 넣지 않으면 해석 결과에 반영되지 않을 수 있으므로 활성 조합 자동 생성을 추가했다.
- 층 복사는 기존 절점/부재 중복 여부를 검사해 같은 위치의 중복 모델을 만들지 않도록 했다.

## 6. 완료 기준

- M12 생산성 액션이 `window.SStructuresAgent.execute(...)`에서 호출 가능하다.
- 격자 골조 생성, 층 복사, 역할 분류, 하중 템플릿, 질량 생성이 테스트로 검증된다.
- M0-M12 전체 테스트 묶음에 포함된다.
- 금지 문자열 검사를 통과한다.
