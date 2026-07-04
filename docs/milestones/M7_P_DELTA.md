# M7 P-Delta

문서 버전: 0.1  
작성일: 2026-06-24  
대상: S-Structures M7 P-Delta 반복해석 및 그래프 출력

## 1. 목적

M7의 목적은 선형 3D 프레임 해석 결과 위에 2차효과를 반영하는 P-Delta 반복해석을 추가하는 것이다. 이 단계의 구현은 자체 행렬해석 엔진 안에서 수행되며, 외부 해석엔진을 사용하지 않는다.

## 2. 구현 범위

이번 단계에서 구현한 범위:

- P-Delta 반복해석 엔진
- 조합별 P-Delta 결과 생성
- P-Delta Envelope 생성
- P-Delta 결과를 설계검토 입력으로 사용
- 반복별 변위 증폭률 기록
- 수렴 여부와 증폭률 경고 기록
- M3 화면의 P-Delta on/off 토글
- 결과 모드에 `P-Delta Envelope`, `P-Delta 조합 결과` 추가
- 반복별 증폭률 SVG 그래프 출력

## 3. 주요 파일

- [linear3d.js](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/solver/linear3d.js>)
- [schema.js](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/core/schema.js>)
- [m3State.js](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/ui/m3State.js>)
- [m3App.js](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/ui/m3App.js>)
- [m3.css](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/ui/m3.css>)
- [m7-pdelta.mjs](</C:/Users/mill/Downloads/dcr/S-Structures-main/tests/m7-pdelta.mjs>)

## 4. 해석 방식

M7의 P-Delta는 다음 반복 절차로 계산한다.

1. 기존 직접강성법으로 1차 선형해석을 수행한다.
2. 각 수직 부재의 축력과 층간 횡변위를 읽는다.
3. `P * Delta / L` 형태의 등가 2차 횡하중을 생성한다.
4. 원 하중과 2차 횡하중을 함께 다시 해석한다.
5. 최대 변위 변화율이 허용오차 이하가 될 때까지 반복한다.
6. 반복 결과를 조합별 결과와 P-Delta Envelope로 저장한다.

이 방식은 초기 M7 범위의 sway P-Delta 근사다. 부재 내부 곡률에 의한 P-small-delta, 정밀 기하강성 행렬, arc-length 해석은 후속 단계에서 확장한다.

## 5. 결과 구조

해석 설정에서 `includeGeometricStiffness`가 켜져 있으면 결과에 다음 블록이 추가된다.

```js
analysis.pDelta = {
  enabled: true,
  ok: true,
  byCombo: {
    CO1: {
      converged: true,
      amplification: 1.401,
      iterations: [
        { iteration: 0, maxDisplacement: 0.029, amplification: 1.0 },
        { iteration: 1, maxDisplacement: 0.037, amplification: 1.285 }
      ],
      result: {}
    }
  },
  envelope: {},
  summary: {
    maxAmplification: 1.401,
    governing: { comboId: "CO1", amplification: 1.401 }
  }
};
```

## 6. 그래프 출력

M3 화면의 `P-Delta` 섹션에는 다음 정보가 표시된다.

- P-Delta 상태
- 최대 증폭률
- 지배 조합
- 수렴 조합 수
- 반복 횟수별 변위 증폭률 그래프

그래프는 별도 라이브러리 없이 SVG로 렌더링한다. 한 조합 이상이 있으면 조합별 선 그래프로 표시한다.

## 7. 설정값

기본 해석 설정:

- `includeGeometricStiffness`: `false`
- `pDeltaMaxIterations`: `12`
- `pDeltaTolerance`: `1e-4`
- `pDeltaMaxAmplification`: `2.5`

## 8. 검증

검증 명령:

```powershell
npm.cmd run test:m7
```

검증 항목:

- P-Delta opt-in 동작
- P-Delta 결과 블록 생성
- 선형해석 대비 변위 증폭
- 반복 이력 기록
- 2차 횡하중 생성
- 직접 P-Delta facade 결과와 `analyzeModel()` 결과 일치
- UI 그래프 데이터 series 생성
