# M7 P-Delta

문서 버전: 0.1
작성일: 2026-06-24
대상: S-Structures M7 P-Delta 반복해석 및 load-step 곡선 출력

## 1. 목적

M7의 목적은 선형 3D 프레임 해석 결과 위에 2차효과를 반영하는 P-Delta 반복해석을 추가하는 것이다. 이 단계의 구현은 자체 행렬해석 엔진 안에서 수행되며, 외부 해석엔진을 사용하지 않는다.

## 2. 구현 범위

이번 단계에서 구현한 범위:

- P-Delta 반복해석 엔진
- 조합별 P-Delta 결과 생성
- P-Delta Envelope 생성
- P-Delta 결과를 설계검토 입력으로 사용
- 하중조합별 `Design P-Delta Summary` 생성
- 층별 `θ`, `BΔ`, `PΔ shear`, `PΔ moment` 생성
- 1차/2차 부재력 비교용 member force row 생성
- 반복별 변위 증폭률 기록
- load step 기준 Global/Story/Member P-Delta 곡선 기록
- 수렴 여부와 증폭률 경고 기록
- M3 화면의 P-Delta on/off 토글
- 결과 모드에 `P-Delta Envelope`, `P-Delta 조합 결과` 추가
- Global P-Delta response SVG 그래프 출력

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

이 방식은 초기 M7 범위의 sway P-Delta 근사다. 현재 solver는 등가 2차 횡하중 반복 방식이며, 전체 tangent를 `Kt = Ke + Kg(N)`로 갱신하는 정식 기하강성 Newton 해석은 후속 단계 범위다. 여기서 `N`은 프로젝트 부호규약상 인장 양수이며 압축은 음수다. 기하강성 방식과 등가하중 방식을 동시에 적용하면 2차효과가 중복되므로 현재 구현은 한 가지 방식만 사용한다.

실무 설계값은 곡선의 중간 load step이 아니라 각 하중조합의 `λ = 1.0` 최종 수렴 결과에서 저장한다. 표시용 곡선은 반복 이력을 그대로 그리지 않는다. 반복 이력은 수렴 진단용 trace이고, P-Delta response curve는 `Fext = FG + λFH` load step별 수렴 결과를 후처리해 만든다.

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
      curve: {
        version: "pdelta-load-step-curves-v1",
        global: {
          title: "Global P-Delta Response Curve",
          points: [
            {
              loadFactor: 1.0,
              firstOrder: { roofDisplacement: 0.029, baseShear: 20.0 },
              secondOrder: { roofDisplacement: 0.041, baseShear: 25.8 }
            }
          ]
        },
        stories: [
          {
            storyId: "ST1",
            points: [
              { loadFactor: 1.0, storyDrift: 0.041, pDeltaShear: 8.1, stabilityIndex: 0.31 }
            ]
          }
        ],
        members: [
          {
            memberId: "M1",
            points: [
              { loadFactor: 1.0, axialForce: 800, localChordDriftY: 0.041, pDeltaShear: 8.1, axialRatio: 1.24 }
            ]
          }
        ]
      },
      result: {}
    }
  },
  envelope: {},
  design: {
    version: "pdelta-design-summary-v1",
    rows: [
      {
        comboId: "CO1",
        direction: "X",
        governingStory: "ST1",
        maxTheta: 0.031,
        maxBDelta: 1.032,
        maxPDeltaShear: 12.4,
        maxPDeltaMoment: 37.2,
        status: "OK"
      }
    ],
    storyRows: [
      {
        comboId: "CO1",
        direction: "X",
        storyId: "ST1",
        gravityLoad: 400,
        storyDrift: 0.012,
        height: 3.0,
        storyShear: 160,
        pDeltaShear: 1.6,
        pDeltaMoment: 4.8,
        theta: 0.01,
        bDelta: 1.01
      }
    ]
  },
  summary: {
    maxAmplification: 1.401,
    maxStoryStabilityIndex: 0.31,
    maxMemberAxialRatio: 1.24,
    governing: { comboId: "CO1", amplification: 1.401 }
  }
};
```

## 6. 그래프 출력

M3 화면의 `P-Delta` 섹션에는 다음 정보가 표시된다.

- P-Delta 상태
- 최대 증폭률
- 최대 층 안정계수 `θ`
- 최대 `BΔ`
- 지배 조합
- 수렴 조합 수
- Design P-Delta Summary: 조합/방향별 지배층, `θ`, `BΔ`, `PΔ shear`, `PΔ moment`, 상태
- Story Stability Table: 층별 `P`, `Δ`, `h`, `V`, `PΔ shear`, `θ`, `BΔ`
- Global P-Delta response curve: `roof displacement - base shear`
- 1차 해석과 2차 P-Delta 결과 곡선 비교

층별/부재별 곡선은 결과 도크와 부재 상세 패널에서 분리해 사용한다.

- Story P-Delta Stability: `λ - θ`, `θ = PΔ / (Vh)`
- Member P-Delta Contribution: 선택 부재의 `λ - Nδ/L`, `N/Pcr`, `B`

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
- load step 기준 Global/Story/Member 곡선 기록
- 부재별 P-Delta 기여도는 압축축력 기준으로 계산
- 하중조합별 최종 설계 summary와 story stability row 생성
- 설계검토는 최종 2차 부재력을 사용하고, 선택 부재 `Nδ/L`은 diagnostic으로만 표시
- 2차 횡하중 생성
- 직접 P-Delta facade 결과와 `analyzeModel()` 결과 일치
- UI 그래프 데이터 series가 iteration이 아니라 load factor를 x축으로 사용
