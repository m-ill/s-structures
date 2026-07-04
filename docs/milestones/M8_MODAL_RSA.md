# M8 Modal And RSA

문서 버전: 0.1  
작성일: 2026-06-24  
대상: S-Structures M8 고유치해석 및 응답스펙트럼해석

## 1. 목적

M8의 목적은 선형 3D 프레임 강성행렬 위에 질량행렬, 고유치해석, 응답스펙트럼해석을 추가하는 것이다. 이 단계도 외부 해석엔진 없이 자체 행렬 연산으로 수행한다.

## 2. 구현 범위

이번 단계에서 구현한 범위:

- 선형 해석기의 3D 프레임 강성행렬 조립 함수 재사용
- lumped mass 생성
- 절점 직접 질량 입력 지원
- 회전 자유도 정적축약
- Jacobi 고유치해석
- 모드별 주기, 진동수, 모드형상 산정
- 방향별 참여계수와 참여질량비 산정
- 응답스펙트럼 보간
- SRSS 조합
- M3 화면의 Dynamics 요약, 모드 표, 모드 주기 그래프 표시

## 3. 주요 파일

- [modal.js](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/dynamics/modal.js>)
- [linear3d.js](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/solver/linear3d.js>)
- [schema.js](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/core/schema.js>)
- [m3State.js](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/ui/m3State.js>)
- [m3App.js](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/ui/m3App.js>)
- [m8-modal-rsa.mjs](</C:/Users/mill/Downloads/dcr/S-Structures-main/tests/m8-modal-rsa.mjs>)

## 4. 질량 모델

기본 질량은 다음 두 경로에서 생성한다.

1. 부재 재료 밀도와 단면적에서 자동 생성
2. 절점의 `mass` 값에서 직접 생성

절점 질량 입력 예:

```js
{ id: "N2", x: 0, y: 0, z: 4, support: null, mass: [10, 10, 10] }
```

현재 질량행렬은 translational lumped mass만 사용한다. 회전질량과 consistent mass는 후속 단계로 남긴다.

## 5. 고유치해석 절차

M8의 고유치해석 절차:

1. 3D 프레임 전역 강성행렬 `K`를 조립한다.
2. 구속 자유도를 제거한다.
3. 질량이 있는 병진 자유도만 modal 자유도로 선택한다.
4. 회전 자유도와 무질량 자유도는 정적축약한다.
5. `M^-1/2 K M^-1/2` 형태의 표준 고유치 문제로 변환한다.
6. Jacobi 반복법으로 고유치를 계산한다.
7. 고유치에서 `omega`, `frequencyHz`, `period`를 산정한다.

## 6. RSA

응답스펙트럼해석은 다음 정보를 산정한다.

- 방향별 참여계수
- 방향별 참여질량비
- 모드별 스펙트럼 변위 응답
- SRSS 조합 변위

기본 응답스펙트럼 설정:

```js
responseSpectrum: {
  enabled: true,
  dampingRatio: 0.05,
  scale: 9.80665,
  directions: ["x", "y"],
  points: [
    { period: 0, sa: 0.4 },
    { period: 5, sa: 0.4 }
  ]
}
```

## 7. UI 출력

M3 화면의 Dynamics 섹션에는 다음 항목을 표시한다.

- 상태
- 1차 주기
- 1차 진동수
- X/Y 방향 참여질량비
- X 방향 SRSS 변위
- 모드별 주기 그래프
- 모드별 주기/진동수/참여질량비 표

그래프는 별도 라이브러리 없이 SVG로 렌더링한다.

## 8. 제한사항

아직 구현하지 않은 항목:

- consistent mass matrix
- 회전질량
- floor diaphragm mass 자동 생성
- CQC 조합
- 모드형상 애니메이션
- 지진하중의 정적 등가하중 변환
- 시간이력해석

## 9. 검증

검증 명령:

```powershell
npm.cmd run test:m8
```

검증 항목:

- 단순 캔틸레버 기둥의 1차 주기 손계산 비교
- 방향별 참여질량비
- RSA SRSS 변위
- 직접 modal facade와 `analyzeModel()` 결과 일치
- UI 그래프 series 생성
