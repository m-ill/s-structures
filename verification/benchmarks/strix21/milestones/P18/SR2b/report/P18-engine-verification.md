# SR2b — P18 엔진 검증 기록

## 판정

- S-Structures 엔진: **PASS**
- STRIX 공식 동일문제 판정: **INPUT_BLOCKED**
- 외부 프로그램 PASS 주장: **없음**
- 결과 해시: `0eeaf37b2d06ba1eda893090b634fcb40a4910e1044b22f50b7ce395f4ebaf5f`

## 모델링과 실행 방법

production 3-D L-plan truss-braced frame with three rigid diaphragms, Ux-Uy-Rz mass reduction and signed axial-force RSA recovery

사용한 생산 모듈:

- `src/dynamics/modal.js`
- `src/dynamics/modalCombination.js`
- `src/results/rsa/memberForces.js`

## 비교 결과

| 프로브 | S-Structures | 기준값 | 오차(%) | 단위 | 판정 |
|---|---:|---:|---:|---|---|
| SR2b-SRSS-X-DISPLACEMENT-CLOSURE | 0.000610122921 | 0.000610122921 | 0.00000000 | m | PASS |
| SR2b-SRSS-X-BASE-SHEAR-CLOSURE | 58.4773756 | 58.4773756 | 0.00000000 | kN | PASS |
| SR2b-SRSS-Y-DISPLACEMENT-CLOSURE | 0.000467643164 | 0.000467643164 | 0.00000000 | m | PASS |
| SR2b-SRSS-Y-BASE-SHEAR-CLOSURE | 67.5249442 | 67.5249442 | 0.00000000 | kN | PASS |
| SR2b-CQC-X-DISPLACEMENT-CLOSURE | 0.000611782215 | 0.000611782215 | 0.00000000 | m | PASS |
| SR2b-CQC-X-BASE-SHEAR-CLOSURE | 66.1467924 | 66.1467924 | 2.14838153e-14 | kN | PASS |
| SR2b-CQC-Y-DISPLACEMENT-CLOSURE | 0.000468577782 | 0.000468577782 | -1.15690736e-14 | m | PASS |
| SR2b-CQC-Y-BASE-SHEAR-CLOSURE | 74.0674074 | 74.0674074 | 1.91863806e-14 | kN | PASS |
| SR2b-ABS-X-DISPLACEMENT-CLOSURE | 0.000709506452 | 0.000709506452 | 0.00000000 | m | PASS |
| SR2b-ABS-X-BASE-SHEAR-CLOSURE | 107.037194 | 107.037194 | 0.00000000 | kN | PASS |
| SR2b-ABS-Y-DISPLACEMENT-CLOSURE | 0.000629762791 | 0.000629762791 | 0.00000000 | m | PASS |
| SR2b-ABS-Y-BASE-SHEAR-CLOSURE | 106.146467 | 106.146467 | 0.00000000 | kN | PASS |
| SR2b-NRC10-X-DISPLACEMENT-CLOSURE | 0.000610122921 | 0.000610122921 | 0.00000000 | m | PASS |
| SR2b-NRC10-X-BASE-SHEAR-CLOSURE | 58.4773756 | 58.4773756 | 0.00000000 | kN | PASS |
| SR2b-NRC10-Y-DISPLACEMENT-CLOSURE | 0.000467643164 | 0.000467643164 | 0.00000000 | m | PASS |
| SR2b-NRC10-Y-BASE-SHEAR-CLOSURE | 67.5249442 | 67.5249442 | 0.00000000 | kN | PASS |
| SR2b-TRUSS-MEMBER-FORCE-RECOVERY | 24.9857845 | 0.00000000 | - | force | PASS |

## 공개 입력 제한

- exact L-shaped plan coordinates and four-frame placement/connectivity
- complete El Centro five-percent response-spectrum ordinate table
- member numbering required to map the published brace-force probes

## 해석

이 문서의 PASS는 S-Structures 생산 엔진과 독립 계산 또는 물리 불변량의 일치 판정이다. STRIX·MIDAS와 같은 입력으로 실행했다는 근거가 잠기지 않은 경우 외부 프로그램 동일문제 PASS로 승격하지 않는다.
