# SP1 — P18 엔진 검증 기록

## 판정

- S-Structures 엔진: **PASS**
- STRIX 공식 동일문제 판정: **NOT_CLAIMED**
- 외부 프로그램 PASS 주장: **없음**
- 결과 해시: `f6f34c1b3097ffdb94a6188d78c6b90d91985f385d38a0370e7fc2f6ac985822`

## 모델링과 실행 방법

production corotational 3D frame with concentrated base moment hinge

사용한 생산 모듈:

- `src/nonlinear/pushover/productionPushover.js`
- `src/nonlinear/properties/hingeRegistry.js`

## 비교 결과

| 프로브 | S-Structures | 기준값 | 오차(%) | 단위 | 판정 |
|---|---:|---:|---:|---|---|
| SP1-PREPEAK-SELF-CONSISTENCY | -0.0177664578 | 0.00000000 | - | % | PASS |
| SP1-LOAD-TARGET | 76.0000000 | 76.0000000 | - | kip | PASS |
| SP1-HARDENING-REACHED | 1831.15865 | 1440.00000 | - | kip-in | PASS |
| SP1-MOMENT-EQUILIBRIUM | 0.392469951 | 0.00000000 | - | % | PASS |

## 공개 입력 제한

- 이 실행에서 별도 입력 누락 항목을 판정하지 않음.

## 해석

이 문서의 PASS는 S-Structures 생산 엔진과 독립 계산 또는 물리 불변량의 일치 판정이다. STRIX·MIDAS와 같은 입력으로 실행했다는 근거가 잠기지 않은 경우 외부 프로그램 동일문제 PASS로 승격하지 않는다.
