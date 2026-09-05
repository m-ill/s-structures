# SR1 — P18 엔진 검증 기록

## 판정

- S-Structures 엔진: **PASS**
- STRIX 공식 동일문제 판정: **INPUT_BLOCKED**
- 외부 프로그램 PASS 주장: **없음**
- 결과 해시: `59347d9707a97b3b3d2e460340ec5ba077d72dbfb90d83acfd4e42ec2ed31246`

## 모델링과 실행 방법

production 2-D rigid-frame modal analysis, mass-normalized mode recovery, SRSS and CQC response-spectrum combination

사용한 생산 모듈:

- `src/dynamics/modal.js`
- `src/dynamics/modalCombination.js`
- `src/results/rsa/memberForces.js`

## 비교 결과

| 프로브 | S-Structures | 기준값 | 오차(%) | 단위 | 판정 |
|---|---:|---:|---:|---|---|
| SR1-SRSS-X-DISPLACEMENT-CLOSURE | 0.0193513838 | 0.0193513838 | 0.00000000 | m | PASS |
| SR1-SRSS-X-BASE-SHEAR-CLOSURE | 118.715974 | 118.715974 | 0.00000000 | kN | PASS |
| SR1-CQC-X-DISPLACEMENT-CLOSURE | 0.0193500941 | 0.0193500941 | 0.00000000 | m | PASS |
| SR1-CQC-X-BASE-SHEAR-CLOSURE | 118.781976 | 118.781976 | 0.00000000 | kN | PASS |
| SR1-METHOD-INVARIANT-PERIOD-1 | 0.285319508 | 0.285319508 | 0.00000000 | s | PASS |

## 공개 입력 제한

- absolute concentrated-mass value m
- complete response-spectrum ordinate table and interpolation rule
- exact member section/area data and eight-element subdivision connectivity

## 해석

이 문서의 PASS는 S-Structures 생산 엔진과 독립 계산 또는 물리 불변량의 일치 판정이다. STRIX·MIDAS와 같은 입력으로 실행했다는 근거가 잠기지 않은 경우 외부 프로그램 동일문제 PASS로 승격하지 않는다.
