# SH1 — P18 엔진 검증 기록

## 판정

- S-Structures 엔진: **PASS**
- STRIX 공식 동일문제 판정: **NOT_CLAIMED**
- 외부 프로그램 PASS 주장: **없음**
- 결과 해시: `370f28f2bdc3eeab9991de7afb3e221e6ebd45ad1a8838fc935bc29738075d86`

## 모델링과 실행 방법

native modular P-My-Mz hinge: FEMA/ASCE backbone, elastic unload, monotone PCHIP capacity, Bresler radial projection, 12-DOF zero-length wrapper

사용한 생산 모듈:

- `src/nonlinear/materials/pmmHinge3d.js`
- `src/nonlinear/math/monotonePchip.js`
- `src/nonlinear/elements/zeroLengthPmmHinge3d.js`

## 비교 결과

| 프로브 | S-Structures | 기준값 | 오차(%) | 단위 | 판정 |
|---|---:|---:|---:|---|---|
| SH1-A1-MZ | 112500000 | 112500000 | 0.00000000 | N.mm | PASS |
| SH1-A2-MZ | 125000000 | 125000000 | 0.00000000 | N.mm | PASS |
| SH1-A3-MZ | 72500000.0 | 72500000.0 | 0.00000000 | N.mm | PASS |
| SH1-A4-MZ | 20000000.0 | 20000000.0 | 0.00000000 | N.mm | PASS |
| SH1-B-UNLOAD-MZ | 62500000.0 | 62500000.0 | 0.00000000 | N.mm | PASS |
| SH1-C-SYMMETRIC-MZ | 70870559.1 | 70871000.0 | -0.000622177496 | N.mm | PASS |
| SH1-C-SYMMETRIC-MY | 70870559.1 | 70871000.0 | -0.000622177496 | N.mm | PASS |
| SH1-C-ASYMMETRIC-MZ | 74807812.3 | 74808000.0 | -0.000250858855 | N.mm | PASS |
| SH1-C-ASYMMETRIC-MY | 66933305.8 | 66933000.0 | 0.000456838428 | N.mm | PASS |
| SH1-D-NNEG-MZ | 91250000.0 | 91250000.0 | 0.00000000 | N.mm | PASS |
| SH1-D-NPOS-MZ | 133910000 | 133910000 | 2.13368760e-7 | N.mm | PASS |
| SH1-ZERO-LENGTH-EQUILIBRIUM | 0.00000000 | 0.00000000 | - | N-or-N.mm | PASS |
| SH1-GLOBAL-ASSEMBLY-ELEMENT-COUNT | 1.00000000 | 1.00000000 | - | element | PASS |

## 공개 입력 제한

- 이 실행에서 별도 입력 누락 항목을 판정하지 않음.

## 해석

이 문서의 PASS는 S-Structures 생산 엔진과 독립 계산 또는 물리 불변량의 일치 판정이다. STRIX·MIDAS와 같은 입력으로 실행했다는 근거가 잠기지 않은 경우 외부 프로그램 동일문제 PASS로 승격하지 않는다.
