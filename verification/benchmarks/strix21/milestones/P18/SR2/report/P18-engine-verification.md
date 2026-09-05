# SR2 — P18 엔진 검증 기록

## 판정

- S-Structures 엔진: **PASS**
- STRIX 공식 동일문제 판정: **INPUT_BLOCKED**
- 외부 프로그램 PASS 주장: **없음**
- 결과 해시: `13fce0d901d004934c83e208e942f5d9dab1a03d17df4cc359ff8a3035f85a71`

## 모델링과 실행 방법

production 3-D frame with two rigid Ux-Uy-Rz diaphragms, eccentric six-DOF mass, nodal/member recovery, four modal combinations

사용한 생산 모듈:

- `src/dynamics/modal.js`
- `src/dynamics/modalDiaphragm.js`
- `src/results/rsa/memberForces.js`

## 비교 결과

| 프로브 | S-Structures | 기준값 | 오차(%) | 단위 | 판정 |
|---|---:|---:|---:|---|---|
| SR2-SRSS-X-DISPLACEMENT-CLOSURE | 0.00303294894 | 0.00303294894 | 0.00000000 | m | PASS |
| SR2-SRSS-X-BASE-SHEAR-CLOSURE | 66.4267570 | 66.4267570 | 0.00000000 | kN | PASS |
| SR2-CQC-X-DISPLACEMENT-CLOSURE | 0.00311699791 | 0.00311699791 | 1.39134154e-14 | m | PASS |
| SR2-CQC-X-BASE-SHEAR-CLOSURE | 76.3103749 | 76.3103749 | 5.58673237e-14 | kN | PASS |
| SR2-ABS-X-DISPLACEMENT-CLOSURE | 0.00324526413 | 0.00324526413 | 0.00000000 | m | PASS |
| SR2-ABS-X-BASE-SHEAR-CLOSURE | 88.6168146 | 88.6168146 | 0.00000000 | kN | PASS |
| SR2-NRC10-X-DISPLACEMENT-CLOSURE | 0.00319935606 | 0.00319935606 | 0.00000000 | m | PASS |
| SR2-NRC10-X-BASE-SHEAR-CLOSURE | 84.9658003 | 84.9658003 | 0.00000000 | kN | PASS |
| SR2-ECCENTRIC-RZ-RECOVERY | 0.000365558717 | 0.00000000 | - | rad | PASS |
| SR2-DIRECT-JZ-INERTIA-MOMENT | 0.219989681 | 0.00000000 | - | force.length | PASS |

## 공개 입력 제한

- column and beam area values and beam inertias
- absolute storey mass and rotational inertia values
- complete node/member connectivity and all spectrum settings

## 해석

이 문서의 PASS는 S-Structures 생산 엔진과 독립 계산 또는 물리 불변량의 일치 판정이다. STRIX·MIDAS와 같은 입력으로 실행했다는 근거가 잠기지 않은 경우 외부 프로그램 동일문제 PASS로 승격하지 않는다.
