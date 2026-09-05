# SM5b — P18 엔진 검증 기록

## 판정

- S-Structures 엔진: **PASS**
- STRIX 공식 동일문제 판정: **NOT_CLAIMED**
- 외부 프로그램 PASS 주장: **없음**
- 결과 해시: `db85729e88c7b19e50cfdbd2f00ae88dd11aa661b8786fcfaf2c06e6c3ca69a1`

## 모델링과 실행 방법

production 3-D frame with five rigid Ux-Uy-Rz diaphragms and eccentric column stiffness

사용한 생산 모듈:

- `src/dynamics/modal.js`
- `src/dynamics/modalDiaphragm.js`

## 비교 결과

| 프로브 | S-Structures | 기준값 | 오차(%) | 단위 | 판정 |
|---|---:|---:|---:|---|---|
| SM5b-INDEPENDENT-MODE-1-OMEGA2 | 2070.11703 | 2070.11703 | 0.00000000 | rad2/s2 | PASS |
| SM5b-INDEPENDENT-MODE-2-OMEGA2 | 2670.92705 | 2670.92705 | -5.10774734e-14 | rad2/s2 | PASS |
| SM5b-INDEPENDENT-MODE-3-OMEGA2 | 3340.99188 | 3340.99188 | 1.08889184e-13 | rad2/s2 | PASS |
| SM5b-INDEPENDENT-MODE-4-OMEGA2 | 17638.3886 | 17638.3886 | 1.03126734e-13 | rad2/s2 | PASS |
| SM5b-INDEPENDENT-MODE-5-OMEGA2 | 22757.5777 | 22757.5777 | 1.27886328e-13 | rad2/s2 | PASS |
| SM5b-INDEPENDENT-MODE-6-OMEGA2 | 28466.8510 | 28466.8510 | 0.00000000 | rad2/s2 | PASS |

## 공개 입력 제한

- STRIX public package omits floor mass and corner-to-inertia-multiplier mapping; these are explicitly identified and not treated as independent acceptance data.

## 해석

이 문서의 PASS는 S-Structures 생산 엔진과 독립 계산 또는 물리 불변량의 일치 판정이다. STRIX·MIDAS와 같은 입력으로 실행했다는 근거가 잠기지 않은 경우 외부 프로그램 동일문제 PASS로 승격하지 않는다.
