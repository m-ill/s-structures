# M13 Result Visuals API

작성일: 2026-06-25  
대상: 기존 `index.html` 3D UI와 AI agent가 공통으로 사용할 결과 시각화 데이터 계약

## 1. 목표

M13의 목표는 해석 결과를 3D 캔버스나 agent가 바로 사용할 수 있는 구조화 데이터로 변환하는 것이다.

기존 UI의 3D 렌더러를 무리하게 교체하지 않고, 다음 단계 렌더링 개선이 안전하게 붙을 수 있도록 순수 데이터 레이어를 먼저 만든다.

## 2. 구현 파일

```text
src/ui/indexResultVisuals.js
src/ui/indexBridge.js
tests/m13-index-result-visuals.mjs
```

## 3. 제공 API

Agent API:

```js
window.SStructuresAgent.getResultVisuals()
window.SStructuresAgent.getResultVisuals({ resultId: 'ENVELOPE' })
window.SStructuresAgent.getResultVisuals({ resultId: 'CO1', deformScale: 10 })
```

Snapshot 요약:

```js
window.SStructuresAgent.getSnapshot().resultVisuals
```

요약 필드:

```js
{
  available,
  version,
  resultId,
  nodeCount,
  memberCount,
  reactionCount,
  loadGlyphCount,
  modalShapeCount,
  pDeltaSeriesCount,
  deformScale,
  maxDisplacement
}
```

## 4. 시각화 데이터 구조

`buildIndexResultVisuals(model, analysis, options)`는 다음 데이터를 반환한다.

```js
{
  version,
  resultId,
  ok,
  deformScale,
  maxDisplacement,
  bounds,
  nodes,
  deformedNodes,
  members,
  reactions,
  loads,
  modal,
  pDelta
}
```

주요 항목:

- `nodes`: 원형상 절점 좌표
- `deformedNodes`: 변위가 반영된 절점 좌표
- `members`: 부재 양 끝 절점, 설계비, 상태, 색상
- `reactions`: 지점 반력 벡터와 모멘트 벡터
- `loads`: 절점/부재 하중 glyph 생성용 데이터
- `modal.modes`: 모드별 변형 형상 좌표
- `pDelta.series`: 조합별 반복 단계, 증폭률, 잔차

## 5. Result ID 규칙

지원하는 `resultId`:

- `ENVELOPE`: 선형/기본 포락 결과
- `PDELTA_ENVELOPE`: P-Delta 포락 결과
- `CO1`, `SLS1` 등 조합 ID
- `PDELTA:CO1` 형식의 P-Delta 조합 결과

`resultId`가 없으면 P-Delta 포락, 일반 포락, 첫 조합 결과 순서로 선택한다.

## 6. 색상 규칙

부재 색상은 현재 설계비 또는 부재 결과 비율로 결정한다.

```text
ratio <= 0     gray
0 < ratio < .7 green
.7 <= ratio <= 1 amber
ratio > 1      red
```

이 규칙은 기존 캔버스 렌더러가 부재 색상을 바꿀 때 그대로 사용할 수 있다.

## 7. 코드 리뷰 메모

이번 단계에서 확인한 주요 위험과 조치:

- 기존 3D 캔버스 내부 로직은 원본 코드 결합도가 높으므로 직접 수정하지 않고 데이터 계약을 먼저 만들었다.
- 변형 형상은 모델 크기와 최대 변위를 기준으로 자동 스케일을 계산한다.
- 모달 형상은 해석 엔진의 정규화된 mode shape를 별도 스케일로 변환한다.
- 반력과 하중은 렌더러가 벡터 glyph를 만들 수 있도록 방향과 크기를 분리했다.
- agent snapshot에는 전체 좌표 배열 대신 요약만 넣어 응답 크기를 제한했다.

## 8. 완료 기준

- `getResultVisuals()`로 변형 형상, 부재 색상, 반력, 하중, 모달 형상, P-Delta series를 읽을 수 있다.
- M13 테스트에서 결과 데이터 개수와 변형 좌표를 검증한다.
- M0-M13 전체 테스트 묶음에 포함된다.
- 금지 문자열 검사를 통과한다.
