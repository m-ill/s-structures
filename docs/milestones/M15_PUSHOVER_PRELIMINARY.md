# M15 Preliminary Pushover

작성일: 2026-06-25  
대상: 자체 엔진 기반 pushover capacity curve와 소성힌지 상태 추적 초판

## 1. 목표

M15의 목표는 비선형 해석으로 확장하기 위한 첫 실행 가능한 pushover 경로를 만드는 것이다.

이번 단계는 완전한 강성저하 반복 비선형 프레임 해석이 아니라, 다음 기능을 갖는 초판이다.

- 단계별 수평 하중 패턴 생성
- 각 단계 선형 해석 실행
- control node 변위 추적
- base shear - control displacement capacity curve 생성
- 부재단 소성힌지 yield/ultimate 상태 판정
- agent API에서 pushover 실행

## 2. 구현 파일

```text
src/nonlinear/pushover.js
src/index.js
src/ui/indexBridge.js
tests/m15-pushover.mjs
```

## 3. 제공 API

코어 API:

```js
import { runPushover, buildLateralPatternLoads } from './src/index.js';
```

Agent API:

```js
window.SStructuresAgent.runPushover({
  controlNodeId: 'N2',
  direction: '+x',
  referenceBaseShear: 20,
  maxLoadFactor: 6,
  steps: 12
})

window.SStructuresAgent.execute('runPushover', { direction: '+x' })
```

## 4. 해석 흐름

`runPushover(model, options)`는 다음 순서로 동작한다.

1. control node와 수평 방향 결정
2. 기준 base shear와 load factor 단계 생성
3. 각 단계별 수평 하중 패턴 생성
4. 기존 선형 해석기에서 `extraLoads`로 단계 하중 적용
5. control node 변위 계산
6. 부재단 모멘트와 소성모멘트 용량 비교
7. capacity curve와 최종 hinge state 반환

## 5. 소성힌지 판정

기본 소성모멘트 용량:

```text
My = Zy * Fy
Mz = Zz * Fy
```

테스트와 민감도 검토를 위해 `plasticMomentScale` 옵션을 제공한다.

상태 판정:

```text
ratio < 1.0       elastic
1.0 <= ratio < 1.5 yielded
ratio >= 1.5      ultimate
```

## 6. 반환 구조

주요 반환 필드:

```js
{
  version,
  type,
  controlNodeId,
  direction,
  firstYield,
  summary,
  curve,
  memberStates,
  warnings
}
```

`curve` 항목:

```js
{
  step,
  loadFactor,
  baseShear,
  controlDisplacement,
  plasticMemberCount,
  yieldedMemberCount,
  ultimateMemberCount,
  ok
}
```

## 7. 코드 리뷰 메모

이번 단계에서 확인한 주요 위험과 조치:

- 비선형 초판을 과장하지 않도록 타입을 `lumped_hinge_preliminary_pushover`로 명시했다.
- 완전한 tangent stiffness 업데이트는 아직 구현하지 않고, 단계별 선형 결과에서 hinge 상태를 추적하는 방식으로 제한했다.
- 첫 소성 발생 판정은 `yielded`뿐 아니라 `ultimate`도 포함해야 하므로, yield 이상 상태 전체를 `firstYield`로 처리하도록 수정했다.
- 수평 하중 패턴은 `extraLoads`로만 넣어 기존 모델 하중과 분리했다.
- agent가 같은 API를 호출할 수 있도록 `runPushover` method와 `execute('runPushover')`를 모두 제공했다.

## 8. 완료 기준

- 단순 캔틸레버 기둥 모델에서 pushover curve가 생성된다.
- control displacement와 base shear가 단계별로 증가한다.
- 소성힌지 상태가 yield 이상으로 판정된다.
- agent API에서 pushover 결과를 읽을 수 있다.
- M0-M15 전체 테스트 묶음에 포함된다.
- 금지 문자열 검사를 통과한다.

## 9. 다음 단계

다음 단계에서는 M15 결과를 실제 비선형 반복해석으로 확장한다.

- hinge stiffness degradation
- tangent stiffness 재조립
- displacement control 제약식
- 수렴 실패와 step size reduction
- pushover 결과 탭과 curve 표시
