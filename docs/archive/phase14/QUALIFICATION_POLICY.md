# Phase 14 Independent Qualification Policy

```yaml
version: p14-qualification-policy-v1
status: review-ready
created_at: 2026-08-27
```

## 1. 목적

다른 프로그램과 결과가 비슷한 것은 중요한 증거지만 그것만으로 검증 완료가 아니다. 두 프로그램이 같은 모델링 오류, 단위 오류 또는 같은 문헌 전사 오류를 공유할 수 있기 때문이다. Phase 14는 reference의 독립성 등급과 검증 순서를 고정한다.

## 2. Reference 등급

| 등급 | 기준 | 용도 |
| --- | --- | --- |
| R1 | 폐형해·정확해·보존법칙 | primary truth |
| R2 | NAFEMS·ASME·CSI·peer-reviewed 공개 benchmark | primary published reference |
| R3 | production 코드를 공유하지 않는 독립 구현 | secondary numerical truth |
| R4 | MIDAS·STRIX·SAP2000 등 상용/독립 solver | cross-solver comparison |
| R5 | 자체 사양·self-consistency·parameter sensitivity | custom capability guard |

R4끼리 일치해도 R1~R3 또는 명시적 수렴근거 없이 범용 정확도를 주장하지 않는다. P3S2 대응 시험은 R5이며 STRIX 전용 요소와 동일 검증이라고 부르지 않는다.

## 3. 사전 등록

benchmark 실행 전에 다음을 immutable manifest로 동결한다.

- 문제 ID·원문·reference hash·사용권 메모
- geometry/material/section/support/load/mass/damping/mesh/time step
- program version과 modeling differences
- probe·unit·axis·sign·rounding
- tolerance와 선정 근거
- mandatory metamorphic tests
- expected PASS/FAIL/N/A 판정 규칙

결과 확인 후 tolerance를 넓히면 기존 run은 `invalidated-after-tolerance-change`다.

## 4. 기본 수용기준 후보

M0에서 원문 정밀도와 discretization을 검토해 확정한다.

| Capability | Primary response target | 추가 gate |
| --- | --- | --- |
| SB7/Winkler | center displacement·moment ≤ 0.1% | reaction equilibrium, mesh sequence monotonic |
| TH1 | finest peak ≤ 0.1% | dt-halving order 1.8~2.2, two damping cases |
| SR2 | period ≤ 0.5%, response ≤ 1% | four combination traces |
| SR2b | frequency ≤ 0.5%, nodal/member response ≤ 1% | mass condensation and force recovery parity |
| SB2 | stress ≤ 3% | monotonic refinement and geometry/probe lineage |
| SB3 | normalized displacement ≤ 1% | distortion family and rotation invariance |
| SB5 | eight deflection coefficients ≤ 1% | load/support resultant audit |
| SB6 | six coefficients ≤ 1% | thickness/aspect family and thin-limit recovery |
| shell stabilization | physical period shift < 0.5% | spurious mechanism removed, energy ratio bound |
| SP1 | pre-peak response ≤ 1% | residual equilibrium, post-peak driver qualification separate |

Published reference가 반올림된 경우 표시 자릿수보다 엄격한 tolerance를 강제하지 않는다.

TH1의 공개 ground-motion sample 전체를 확보하지 못하면 공개 peak 값만 보고 같은 사례를 재현했다고 주장하지 않는다. 이 경우 S-Structures 고유 입력을 hash로 동결한 `TH1-SS`를 exact recurrence·RK4로 먼저 qualification하고, STRIX TH1은 source-blocked로 분리한다.

## 5. 변형시험

각 capability는 가능한 범위에서 다음을 수행한다.

1. 하중 0.1·10배 선형 scaling
2. E·I·foundation stiffness·mass의 차원 scaling law
3. 30°·90° 회전과 좌우 반사
4. N-mm ↔ kN-m 단위 round-trip
5. node/member 입력순서 permutation
6. mesh·mode count·dt refinement
7. 전체 외력-반력 평형과 에너지/행렬 대칭성
8. sparse/dense 또는 독립 implementation parity
9. invalid/near-singular/failure injection

원 benchmark 숫자만 맞고 변형시험이 실패하면 `overfit-suspected`로 차단한다.

## 6. 교차 프로그램 비교

- 동일 geometry가 아니라 **동일 공학 모델**임을 mapping audit로 증명한다.
- stiffness modifier, shear deformation, rigid zone, release, offset, mass source, self weight, diaphragm, damping과 modal combination default를 명시한다.
- 원본 모델 파일·결과 export·화면 캡처·프로그램 버전·실행 환경과 hash를 보존한다.
- UI 표시값이 아니라 가능한 한 full-precision export를 사용한다.
- 차이가 tolerance를 넘으면 어느 프로그램을 정답으로 정하지 않고 R1~R3와 refinement로 원인을 판별한다.

## 7. Evidence 상태

| 상태 | 의미 |
| --- | --- |
| PASS | frozen manifest의 모든 mandatory gate 충족 |
| FAIL | 수치·불변식·수렴·평형·보안 gate 위반 |
| BLOCKED | source, license, model, environment 또는 owner 승인 없음 |
| NOT_RUN | 실행 전 |
| NOT_APPLICABLE | 승인된 기술 사유와 reviewer 존재 |
| INVALIDATED | code/reference/tolerance/input hash가 바뀜 |

timeout·missing result·수동 skip은 PASS가 아니다.

## 8. Claim 규칙

- `implemented`: production code와 focused test가 존재
- `internally verified`: 불변식·변형시험이 통과
- `independently qualified`: R1~R3 기준을 통과
- `cross-solver compared`: 동등 모델로 R4 비교 완료
- `release allowed`: migration·UI/API/report·성능·failure·review까지 통과

“MIDAS·STRIX와 동일 성능”이라는 표현은 기능범위·버전·모델·지표를 명시하지 않으면 사용하지 않는다.
