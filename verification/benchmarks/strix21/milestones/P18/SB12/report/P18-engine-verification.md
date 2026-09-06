# SB12 — P18 엔진 검증 기록

## 판정

- S-Structures 엔진: **PASS**
- STRIX 공식 동일문제 판정: **NOT_CLAIMED**
- 외부 프로그램 PASS 주장: **없음**
- 결과 해시: `953231d68d7401340742563fb2f4e818a116edff5ade2beb0ded62c02552a4d2`

## 모델링과 실행 방법

native modular 6-DOF elastic two-node link with MIDAS beta-angle frame and shear-distance coupling

사용한 생산 모듈:

- `src/solver/link/elasticLink6dof.js`
- `src/solver/linear3dAssembly.js`

## 비교 결과

| 프로브 | S-Structures | 기준값 | 오차(%) | 단위 | 판정 |
|---|---:|---:|---:|---|---|
| SB12-OBLIQUE-UX | 6.86392366 | 6.86392366 | -1.00930488e-11 | mm | PASS |
| SB12-OBLIQUE-UY | -30.9380320 | -30.9380320 | 3.28422995e-12 | mm | PASS |
| SB12-OBLIQUE-UZ | 27.9200842 | 27.9200842 | 2.54491616e-13 | mm | PASS |
| SB12-OBLIQUE-RX | 0.0188300166 | 0.0188300166 | -9.58104528e-13 | rad | PASS |
| SB12-OBLIQUE-RY | -0.00600667462 | -0.00600667462 | -2.77247336e-12 | rad | PASS |
| SB12-OBLIQUE-RZ | -0.0111551987 | -0.0111551987 | 5.19396970e-12 | rad | PASS |
| SB12-NEAR-VERTICAL-UX | 46.1921058 | 46.1921058 | 3.73790893e-12 | mm | PASS |
| SB12-NEAR-VERTICAL-UY | -53.8258100 | -53.8258100 | -5.80834368e-13 | mm | PASS |
| SB12-NEAR-VERTICAL-UZ | 0.133333333 | 0.133333333 | 0.00000000 | mm | PASS |
| SB12-NEAR-VERTICAL-RX | 0.0214952611 | 0.0214952611 | 5.97199246e-13 | rad | PASS |
| SB12-NEAR-VERTICAL-RY | 0.0184239739 | 0.0184239739 | 3.74739969e-12 | rad | PASS |
| SB12-NEAR-VERTICAL-RZ | 0.00548780488 | 0.00548780488 | 0.00000000 | rad | PASS |
| SB12-OBLIQUE-EQUILIBRIUM | 6.43194653e-14 | 0.00000000 | - | ratio | PASS |
| SB12-NEAR-VERTICAL-EQUILIBRIUM | 5.77711035e-13 | 0.00000000 | - | ratio | PASS |

## 공개 입력 제한

- 이 실행에서 별도 입력 누락 항목을 판정하지 않음.

## 해석

이 문서의 PASS는 S-Structures 생산 엔진과 독립 계산 또는 물리 불변량의 일치 판정이다. STRIX·MIDAS와 같은 입력으로 실행했다는 근거가 잠기지 않은 경우 외부 프로그램 동일문제 PASS로 승격하지 않는다.
