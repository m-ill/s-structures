# M10 Index Results UI

작성일: 2026-06-25  
대상: 기존 `index.html` UI의 엔진 결과 표시 강화

## 1. 목표

M10의 목표는 M9에서 연결한 모듈형 엔진 결과를 기존 S-Structures UI 안에서 더 읽기 쉽게 표시하는 것이다.

기존 3D 캔버스, 도구 팔레트, 하중조합 UI는 유지한다. 새 기능은 기존 `canvasWrap` 위에 결과 도크를 추가하는 방식으로 구현한다.

## 2. 구현 파일

```text
src/ui/indexResultsPanel.js
src/ui/indexBridge.js
tests/m10-index-results-panel.mjs
```

## 3. 결과 도크

브라우저에서 `index.html`이 로드되면 M9 브리지가 M10 결과 도크를 자동 설치한다.

도크 ID:

```text
engineResultsDock
```

Agent 식별자:

```text
data-agent-id="engine-results-dock"
```

도크 탭:

- Summary
- P-Delta
- Modal
- Design

## 4. Summary 탭

표시 항목:

- 해석 상태
- 조합 개수
- 최대 변위
- 최대 설계비
- 지배 부재/조합
- 경고 개수
- 부재력 포락 요약

부재력 포락 요약은 다음 값을 표시한다.

- Member
- Ratio
- N
- My
- Mz

## 5. P-Delta 탭

표시 항목:

- P-Delta 해석 상태
- 최대 증폭률
- 지배 조합
- 수렴 조합 수
- Global P-Delta response curve
- load step 슬라이더
- 조합별 현재 load step의 `λ`, roof displacement, base shear, 증폭률 표

P-Delta 탭의 그래프는 iteration history가 아니라 load step별 수렴 결과를 표시한다. x축은 roof displacement, y축은 base shear이며 1차 해석과 2차 P-Delta 결과를 함께 그린다. 내부 반복 이력은 수렴 진단 trace로 남고, 결과 패널에서는 response curve로 노출하지 않는다.

P-Delta load step 슬라이더는 추후 기존 player bar와 더 깊게 연결할 수 있는 중간 계약이다.

Agent action:

```js
window.SStructuresAgent.execute('setPDeltaStep', { step: 3 })
```

## 6. Modal 탭

표시 항목:

- 모달 해석 상태
- 모드 개수
- 1차 주기
- RSA Y방향 SRSS 변위
- 모드별 주기 막대 그래프
- 모드별 주기, 진동수, X/Y 질량참여율 표

## 7. Design 탭

표시 항목:

- 설계 검토 상태
- 최대 설계비
- 지배 부재/검토식
- 검토 부재 수
- 상위 부재 설계비 막대
- 부재별 재료계열, 설계비, 지배 검토식, 상태 표

이번 단계에서는 기존 3D 캔버스의 색상 작도까지 직접 교체하지 않는다. 대신 결과 도크가 설계비와 지배 부재를 명확히 노출한다. 캔버스 컬러맵 심화는 다음 단계에서 진행한다.

## 8. Agent API 확장

M10에서 추가한 API:

```js
window.SStructuresAgent.getResultView()
window.SStructuresAgent.execute('setResultTab', { tab: 'modal' })
window.SStructuresAgent.execute('setPDeltaStep', { step: 2 })
```

`getSnapshot()`에는 다음 요약이 추가된다.

```js
resultView: {
  activeTab,
  status,
  pDeltaEnabled,
  pDeltaMaxStep,
  modalModeCount,
  designRows
}
```

## 9. 완료 기준

- 기존 `index.html`에서 결과 도크가 자동 생성된다.
- Summary, P-Delta, Modal, Design 탭이 엔진 결과를 표시한다.
- P-Delta load-step response curve와 모달 주기 그래프가 SVG로 출력된다.
- Agent가 결과 탭과 P-Delta load step을 API로 제어할 수 있다.
- M0-M10 테스트가 모두 통과한다.
- 금지 문자열 검사를 통과한다.

## 10. 다음 단계

M11에서는 agent 조작 계약을 모델링 동작까지 확장한다.

- 선택 객체 읽기
- 절점/부재 생성 action
- 하중/단면/지점 입력 action
- 화면 클릭과 API action의 상태 동기화 검증

M12에서는 기존 3D 캔버스 작도 자체를 더 깊게 정리한다.

- 설계비 컬러맵 캔버스 통합
- P-Delta load step별 변형 형상 표시
- Modal shape 표시
- 부재력도 작도 개선
