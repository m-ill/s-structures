# SM6 — P18 엔진 검증 기록

## 판정

- S-Structures 엔진: **PASS**
- STRIX 공식 동일문제 판정: **NOT_CLAIMED**
- 외부 프로그램 PASS 주장: **없음**
- 결과 해시: `cabf3f30f60a83db068b9d6122524125e3f7fa68498d8fe911e823ced0364451`

## 모델링과 실행 방법

production 3-D Timoshenko frame, 18 pipe elements, 14 explicit translational lumped masses

사용한 생산 모듈:

- `src/dynamics/modal.js`
- `src/solver/linear3dAssembly.js`
- `src/solver/timoshenko.js`

## 비교 결과

| 프로브 | S-Structures | 기준값 | 오차(%) | 단위 | 판정 |
|---|---:|---:|---:|---|---|
| SM6-MODE-1-FREQUENCY | 113.752873 | 111.520000 | 2.00221755 | Hz | PASS |
| SM6-MODE-2-FREQUENCY | 118.909493 | 115.950000 | 2.55238689 | Hz | PASS |
| SM6-MODE-3-FREQUENCY | 140.951257 | 137.600000 | 2.43550627 | Hz | PASS |
| SM6-MODE-4-FREQUENCY | 221.463661 | 218.020000 | 1.57951596 | Hz | PASS |
| SM6-MODE-5-FREQUENCY | 398.570467 | 404.230000 | -1.40007754 | Hz | PASS |
| SM6-MODE-6-FREQUENCY | 420.384075 | 422.700000 | -0.547888580 | Hz | PASS |
| SM6-MODE-7-FREQUENCY | 448.602546 | 451.720000 | -0.690129726 | Hz | PASS |
| SM6-MODE-8-FREQUENCY | 547.535586 | 553.990000 | -1.16507766 | Hz | PASS |

## 공개 입력 제한

- STRIX public package omits the exact intermediate-joint coordinate table used by its private 42-DOF reconstruction.

## 해석

이 문서의 PASS는 S-Structures 생산 엔진과 독립 계산 또는 물리 불변량의 일치 판정이다. STRIX·MIDAS와 같은 입력으로 실행했다는 근거가 잠기지 않은 경우 외부 프로그램 동일문제 PASS로 승격하지 않는다.
