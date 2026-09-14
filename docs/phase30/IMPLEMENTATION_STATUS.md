# Phase30 진행 상태

2026-09-14 · **M0~M6 완료**

오너 결정 두 건이 확정돼 착수했다.

| 결정 | 확정 |
| --- | --- |
| 수렴 판정 | 부재력 잔차와 단면 무변화를 **둘 다 요구하되 따로 보고** |
| 비용 상한 | `maxGlobalIterations` 기본 **6**, 상한 **12** |

## M0 · 실측이 계획을 바꿨다

계획서는 "자중을 루프 안에서 다시 만들지 않는다"까지만 알고 있었다. 실제로 재보니 끊어진 변이 **더 좁고 더 분명했다.**

**자중은 이미 살아 있다.** `createSelfWeightLoads`가 매번 `density × 총단면적`을 읽으므로, 단면이 바뀌면 자중은 따라온다. 새 기계가 필요 없다.

**끊어진 곳은 루프가 단면 변경을 아예 실을 수 없다는 것이다.** 휨 프로파일은 휨강성만 나르고 각 값은 총단면 값 이하로 제한되며, 원본 모델은 해시로 고정돼 단면이 바뀌면 `STALE_FLEXURAL_PROFILE`로 거부된다.

**이건 누락이 아니라 설계 결정이다.** 강성 반복 도중에 구조가 움직이면 안 되기 때문이다. 그래서 M2의 방향이 정해졌다 — **안쪽 핀을 푸는 게 아니라, 바깥 루프가 새 모델로 다시 들어간다.**

기준선 시험을 쓰면서 픽스처에 대해 두 가지도 같이 고정했다. 단면 성능은 **파생값**이라 모델 레코드의 `properties.A`나 치수를 덮어써도 `sectionOf`가 해석하는 값은 안 바뀐다 — 그래서 시험은 실제 카탈로그 단면 두 개를 비교한다. 밀도도 레지스트리가 공급하므로 절대값이 아니라 비례성으로 검증한다.

## M1 · 되먹임 경로 선언 — `designFeedbackPaths.js`

`inputIdentity`와 `sourceModelHash`는 "입력이 바뀌었나"에 답하지만 **"얼마나 멀리 번지나"**에는 답하지 않는다.

간선마다 변경·무효화 대상·기전·근거 코드를 한 행에 둔다. 전이 도달은 직접 간선에서 **파생**하므로 한쪽에만 추가하고 잊을 수 없다.

```
단면치수 → 자중 → [조건부] 지진질량 → 밑면전단 → 부재력 → 설계단면 → 단면치수
```

지진 분기는 **조건부**로 표시된다 — 질량원이 `includeSelfWeight`를 선언할 때만 존재하고, 조건부를 빼고 물으면 그 가지만 정확히 빠진다.

`check-feedback-path-evidence`가 게이트를 건다. Phase28 조항 검사와 같은 비대칭 원칙이다 — **코드를 가리키는 근거가 사라지면 실패**, 코드를 안 가리키는 근거(KDS 조항, 후속 마일스톤)는 보고하고 허용. 붙이자마자 선언되지 않은 간선 대상 2건을 잡았다.

**시험이 고정한 성질 하나**: 고리가 닫히면 **전이 도달은 포화된다.** 배근은 자중에 직접 간선이 없지만, 설계 결정을 거쳐 단면을 바꾸므로 결국 자중에 닿는다. 포화된 도달은 아무것도 답하지 않는다 — 그래서 추론에 쓸 것은 **직접 간선**이고, 수렴 판정도 "하류에서 뭐라도 바뀌었나"가 될 수 없다.

## M2~M4 · 바깥 루프 — `globalDesignIteration.js`

```
model → evaluate(해석+검사) → applyDesign → model′ → ...
```

각 재진입이 **새 해시에 대한 새 내부 실행**이다. 자중은 특별 취급이 없다 — 해석 네트워크를 만들 때마다 총단면적에서 다시 나온다.

### 수렴은 두 판정을 모두 요구하고 따로 보고한다

```
forceConverged   부재력 잔차 ≤ 허용오차     수요가 멈췄나
designStable     설계 상태가 직전과 동일     선택이 멈췄나
```

한쪽만으로는 안 되는 이유가 시험에 고정돼 있다. **힘만 보면** D22 ↔ D25로 튀는 설계를 수렴으로 읽는다(힘은 거의 안 움직이므로). **단면만 보면** 아무것도 재설계 안 된 1회차가 수렴이 된다.

### 네 가지 상태

| 상태 | 뜻 |
| --- | --- |
| `CONVERGED` | 두 판정 모두 충족 |
| `FORCE_CONVERGED_SECTION_OSCILLATING` | 힘은 수렴, 규격이 계속 변함 |
| `CYCLE_DETECTED` | 설계 상태가 순환 |
| `ITERATION_LIMIT_REACHED` | 상한·시간 도달, 판정 미완 |
| `NOT_CHECKED` | 평가가 불완전 (미수렴과 구분) |

**순환은 잔차 크기로 추정하지 않고 설계 상태 해시의 재방문으로 검출한다.** 순환을 만나면 상한을 다 쓰지 않고 즉시 멈추고 순환 구간(`firstSeenAt`, `revisitedAt`, `length`)을 보고한다. **완화계수로 억지 수렴시키지 않는다.**

### 종료 보장

반복 상한(기본 6, 상한 12)과 시간 상한(기존 `maxEvaluationMillis` 120,000 ms 재사용) 둘 다. 상한 초과 요청은 `GLOBAL_DESIGN_ITERATION_BOUND_INVALID`로 즉시 거부한다.

### 닫힌 변, 실제 자중으로 확인

시험이 진짜 `createSelfWeightLoads`를 통과시킨다. 루프가 부재를 키우면:

```
rc3050 → rc4060 → rc5080
11.547 → 18.476 → 30.793  kN/m
```

비율 30.793 / 11.547 = 2.667 = 0.40 / 0.15 — **면적비 그대로다.** 루프는 자중을 한 번도 직접 계산하지 않는다. 각 반복의 모델 해시도 서로 다르다(안쪽 핀을 재진입한 것이지 푼 것이 아니다).

## M5 · 등록과 게이트

- 비용 상한을 `practicalDesignLimits.js`에 등록(`p30-bounded-profile-v3-global-iteration`)
- 시험이 파일명 규칙으로 자동 편입(872개, 고아 0)
- 되먹임 근거 게이트가 `p30-m1` 시험에 편입

## M6 · 워크플로 연결

오너 결정 세 건이 확정돼 진행했다.

| 결정 | 확정 |
| --- | --- |
| 기동 | 명시 호출 |
| 설계변수 | 단면치수 포함 + **허용 범위 선언** |
| 차단 | `CONVERGED` 외 전부 차단, 사유 표면화 |

### 리사이징 권한 — `globalResizeScope.js`

```js
{ sets: [{ memberIds: ['G1','G2'], sectionLadder: ['rc3050','rc4060','rc5080'] }] }
```

사다리는 **총단면적 순증가 강제**다. 순서가 없으면 "수요 증가 → 다음 단면"의 방향이 정의되지 않고 진동 검출이 무의미해진다. 한 부재를 두 집합이 점유하면 스텝이 순회 순서에 의존하므로 거부한다.

스코프 밖 부재는 `nextSectionUp`과 `resizeCommands` **양쪽에서** 차단된다 — 호출자가 목록을 따로 조립해도 도달 불가다.

### 두 가지 구동 형태

**`globalDesignDriver`** — 자율 루프. 해석 콜백을 받아 스스로 돈다.

**`globalIterationSession`** — 단계형. 이쪽이 서비스에 연결된 형태다.

서비스가 자율 루프를 쓸 수 없는 이유는 분명하다. `evaluate()`는 조합별 **완료된 해석 run id**를 요구하고, 서비스는 해석 실행 생명주기를 소유하지 않는다 — `applyCandidateAndReview`가 해석을 직접 돌리지 않고 `new-analysis-and-design-evaluation`을 반환하는 것과 같은 이유다. 그래서 세션이 루프 상태를 호출 사이에 보관하고, 해석은 호출자가 돌린다. `plan → start → apply`와 같은 형태다.

```
open(scope) → submit(evaluation) → 명령 적용 + 재해석 → submit → ...
```

판정은 `judgeIteration`으로 **추출해 양쪽이 공유**한다. 세션과 자율 루프가 수렴을 다르게 판정하면 Phase28이 막으려던 바로 그 드리프트가 된다.

### 드라이버가 구분해야 하는 두 상황

원시 판정으로는 불가능한 것이다.

| 상황 | 원시 판정 | 실제 |
| --- | --- | --- |
| 사다리 소진 + 여전히 NG | 설계 불변 → **CONVERGED 오독** | `RESIZE_LADDER_EXHAUSTED_WHILE_FAILING` |
| 스코프 밖 부재가 NG | 동일 오독 | `FAILING_MEMBER_OUTSIDE_RESIZE_SCOPE` |

### 전달 차단 — 서비스의 기존 어휘

| 상태 | requiredNext |
| --- | --- |
| `CONVERGED` | `independent-review-and-artifacts` |
| `CYCLE_DETECTED` | `resolve-design-state-cycle` |
| `ITERATION_LIMIT_REACHED` | `raise-iteration-bound-or-revise-design` |
| `FORCE_CONVERGED_SECTION_OSCILLATING` | `choose-between-oscillating-sections` |

네 번째는 부재력 잔차가 허용오차 이내인데 이산 규격 채택이 미정인 상태다. 구조적으로 어느 쪽 rung이든 성립할 수 있으나 **무엇을 채택했는지가 결정되지 않았으므로** 결과가 아니라 결정 대상이다.

### 노출

| 계층 | 추가 |
| --- | --- |
| 서비스 | `openGlobalIteration` · `submitGlobalIteration` · `getGlobalIteration` |
| 브리지 | `openGlobalDesignIteration` 외 2 |
| WebMCP | `open_global_design_iteration` · `submit_global_design_iteration` · `get_global_design_iteration` |
| 능력 목록 | optimization 모듈 + 제약 문구 |

스키마의 `maxGlobalIterations` 상한은 **기본값 6이 아니라 하드캡 12**다 — 호출자가 `practicalDesignLimits`를 넘겨 요청할 수 없다. `submit` 스키마는 부재별 `secId`를 필수로 요구한다. 설계 상태 해시가 단면에 의존하므로, 단면 없이 비율만 받으면 정착한 설계가 영원히 미정착으로 보인다.

신설 배관은 없었다. `designInputCommands`의 `member-assignment`가 이미 리사이징 경로이고, 자중은 `createSelfWeightLoads`가 조립 시마다 총단면적을 읽는다.

## 경계

수렴을 보장한다고 주장하지 않는다. 이 페이즈가 하는 일은 **수렴 여부를 판정하고 정직하게 보고하는 것**이다. 수렴하지 않는 설계 문제는 실제로 존재하며, 그 경우 수렴하지 않았다고 말하는 것이 옳은 답이다.
