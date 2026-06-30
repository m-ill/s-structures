# Linear Solver Verification

문서 버전: 0.1  
작성일: 2026-06-24  
대상: S-Structures M2 선형 3D 프레임 직접강성법 엔진

## 1. 목적

이 문서는 S-Structures 자체 선형해석 엔진의 회귀 검증 기준을 정의한다. M2의 목표는 UI 기능 확장이 아니라, 3D 프레임 직접강성법 solver가 기본 구조역학 benchmark와 일치하는지 자동 테스트로 고정하는 것이다.

검증 대상:

- 선형 연립방정식 풀이
- 3D 프레임 요소 local stiffness
- local axis 생성
- 지점조건
- 부재하중 등가절점하중
- 부재단력 및 station 결과 복원
- 부재 릴리즈
- 불안정 구조 진단

## 2. 단위 정책

현재 solver는 기존 S-Structures 단위 체계를 유지한다.

- 길이: m
- 힘: kN
- 모멘트: kN.m
- 변위: m, UI 표시는 mm 변환 가능
- 응력/재료 입력: N/mm2를 내부 kN/m2로 변환

검증용 benchmark 재료/단면은 [verification.js](</C:/Users/mill/Downloads/dcr/s-structures-review/src/examples/verification.js>)에 정의한다.

## 3. 허용오차

테스트 허용오차:

- solver residual: `1e-8`
- 힘/반력: `1e-6`
- 모멘트: `1e-6`
- 변위: `1e-6`
- 행렬 대칭성/좌표축 직교성: `1e-10`

핀/롤러 지점은 회전 자유도 안정화를 위해 극소 회전 스프링을 사용하므로, 단부모멘트와 최대모멘트에는 `1e-6` 수준의 허용오차를 둔다.

## 4. 검증 케이스

### 4.1 Solver 기본

파일: [m2-linear3d.mjs](</C:/Users/mill/Downloads/dcr/s-structures-review/tests/m2-linear3d.mjs>)

- `solveLinear`: 2x2 선형방정식 해 검증
- `localK12`: 12x12 요소강성행렬 대칭성 검증
- `memberAxes`: 수직부재 local axis 단위벡터/직교성 검증

### 4.2 캔틸레버 끝단 집중하중

모델:

- 고정단: `N1`
- 자유단: `N2`
- 하중: 자유단 `P`

검증식:

- 자유단 변위: `P L^3 / (3 E I)`
- 고정단 반력: `P`
- 전체 하중-반력 평형

### 4.3 캔틸레버 등분포하중

모델:

- 고정단-자유단 보
- 하중: 전체 경간 등분포하중 `w`

검증식:

- 자유단 변위: `w L^4 / (8 E I)`
- 고정단 반력: `w L`
- 고정단 모멘트: `w L^2 / 2`

### 4.4 양단고정보 등분포하중

모델:

- 양단 고정
- 하중: 전체 경간 등분포하중 `w`

검증식:

- 각 단부 반력: `w L / 2`
- 중앙 처짐: `w L^4 / (384 E I)`

### 4.5 축력 부재

모델:

- 고정단-자유단 축방향 부재
- 하중: 자유단 축방향 `P`

검증식:

- 자유단 축변위: `P L / (E A)`
- 고정단 축반력: `P`

### 4.6 수직 축력 기둥

모델:

- 수직 부재
- 하중: 상단 절점 수직축방향 `P`

검증 목적:

- 수직부재 local axis 생성
- global Z 축방향 축강성
- 축반력

### 4.7 핀-롤러 단순보 등분포하중

모델:

- 좌측 pin
- 우측 roller
- 하중: 전체 경간 등분포하중 `w`

검증식:

- 각 단부 반력: `w L / 2`
- 최대처짐: `5 w L^4 / (384 E I)`
- 최대모멘트: `w L^2 / 8`
- 단부모멘트: `0`

### 4.8 핀-롤러 단순보 중앙 집중하중

모델:

- 좌측 pin
- 우측 roller
- 하중: 중앙 집중하중 `P`

검증식:

- 각 단부 반력: `P / 2`
- 최대처짐: `P L^3 / (48 E I)`
- 최대모멘트: `P L / 4`

### 4.9 고정-롤러 보 등분포하중

모델:

- 좌측 fixed
- 우측 roller
- 하중: 전체 경간 등분포하중 `w`

검증식:

- 고정단 반력: `5 w L / 8`
- 롤러 반력: `3 w L / 8`
- 고정단 모멘트: `w L^2 / 8`

### 4.10 Custom 고정 지점

모델:

- 좌측 지점: `support='custom'`, `fix=[true,true,true,true,true,true]`
- 자유단 집중하중

검증 목적:

- custom 6자유도 구속이 fixed와 같은 결과를 내는지 확인

### 4.11 Global Y 방향 등분포하중

모델:

- 캔틸레버
- 하중: global `-Y` 방향 등분포하중

검증 목적:

- global Y 하중이 local z 방향 휨으로 변환되는지 확인
- `My`가 지배하고 `Mz`가 0에 가까운지 확인

검증식:

- 자유단 Y 변위: `w L^4 / (8 E Iy)`
- Y 방향 반력: `w L`
- local y축 휨모멘트 최대값: `w L^2 / 2`

### 4.12 삼각분포하중

모델:

- 캔틸레버
- 하중: `asc`, `desc` 삼각분포하중

검증식:

- 총하중: `w L / 2`
- `asc` 고정단 모멘트: `(w L / 2) * (2 L / 3)`
- `desc` 고정단 모멘트: `(w L / 2) * (L / 3)`

### 4.13 부재 릴리즈

모델:

- 핀-롤러 단순보
- 부재 양단 release: `pin`
- 하중: 전체 경간 등분포하중

검증 목적:

- release 적용 후 양단모멘트가 0인지 확인
- 반력과 최대모멘트가 단순보 공식과 일치하는지 확인

### 4.14 Mechanism 진단

모델:

- 좌측 pin
- 우측 자유단
- 자유단 수직 집중하중

검증 목적:

- 회전구속 없는 캔틸레버 mechanism을 실패로 표시
- `SINGULAR` 오류가 analysis validation에 추가되는지 확인
- 조합 결과가 `ok:false`와 `reason:'NO_SOLVED_COMPONENT'`를 갖는지 확인

## 5. 회귀 테스트 실행

전체 테스트:

```powershell
npm.cmd run test
```

M2만 실행:

```powershell
npm.cmd run test:m2
```

## 6. M2 완료 기준

M2는 다음 조건을 만족하면 완료로 본다.

- 기본 solver 함수 검증 통과
- 최소 10개 이상의 구조 benchmark 통과
- 지점조건 pin/roller/custom 검증 통과
- 부재하중 point/udl/triangular 검증 통과
- global Y/Z 하중 방향 검증 통과
- release 단부모멘트 검증 통과
- 불안정 구조 진단 검증 통과
- 전체 회귀 테스트 `npm.cmd run test` 통과
