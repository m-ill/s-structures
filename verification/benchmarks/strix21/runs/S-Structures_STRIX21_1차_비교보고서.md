# S-Structures STRIX 21개 검증군 Phase 15 보정 비교 보고서

- 실행일: 2026-08-28
- 결과 artifact: `862be01f9bc70ac73add343699bcc102e9a28d34cbb4fa06a76c8464019c61cd`
- 계산 hash: `0ec54af68e176c42f6659e9e51fdc9dc53e2c2e6648b6b0b7f5ca549ed50ede1`
- 결과 hash: `862be01f9bc70ac73add343699bcc102e9a28d34cbb4fa06a76c8464019c61cd`
- 실행기록 hash: `a3032d1d0d4b6b9e58207c2afac66496662419857537cd548b5a5b2d8bfee01f`
- 결정론 검증: 3회 반복 PASS
- 결정론 증거: `9f9799fe020e9526d496f9332b21f7042c1848d942761411b5ce09a4b019eb10`
- 실행엔진: S-Structures 자체 결정론적 해석엔진
- 외부 solver runtime: 사용하지 않음

## 요약

실제 실행 12개 중 PASS 9개, CUSTOM_PASS 1개, REVIEW 0개, BLOCKED 2개다. 총 52개 수치 중 52개가 각 사례의 사전 허용오차를 통과했다.

| ID | 상태 | 통과/전체 | 최대 기준오차 | 비고 |
| --- | --- | ---: | ---: | --- |
| SB10 | PASS | 8/8 | 0% | 3D axial-only truss; 8/8 mandatory metrics PASS |
| SB1 | PASS | 4/4 | 0.000770827% | Euler-Bernoulli 3D frame; 4/4 mandatory metrics PASS |
| SB9 | PASS | 4/4 | 4.83924e-5% | separate Euler beam, axial-column, and combined portal production solves; 4/4 mandatory metrics PASS |
| SB7 | PASS | 2/2 | 0.000355804% | distributed consistent Winkler foundation matrix; 2/2 mandatory metrics PASS |
| SB8 | PASS | 6/6 | 0.017469% | Timoshenko 2-node frame with lumped translational mass and no rotary inertia; 6/6 mandatory metrics PASS |
| PD1 | BLOCKED | 4/4 | 0.0629741% | direct geometric-stiffness second-order analysis with tension-positive Kg; 수치 4/4 PASS; qualification BLOCKED (PD1_STAGE_WORK_BALANCE_NOT_EXPOSED) |
| SM5 | BLOCKED | 3/3 | 0.00113462% | one element per member, Euler frame, explicit nodal lumping of published line mass; 수치 3/3 PASS; qualification BLOCKED (SM5_INDEPENDENT_REFERENCE_MODE_VECTORS_UNAVAILABLE) |
| SB2 | PASS | 1/1 | 1.98767% | QM6-EAS plane-stress membrane on parametric elliptic-annulus mesh; 1/1 mandatory metrics PASS |
| SB3 | PASS | 1/1 | 0.111762% | QM6-EAS plane-stress membrane; 1/1 mandatory metrics PASS |
| SB5 | PASS | 8/8 | 0.873362% | MITC4 Reissner-Mindlin plate in thin limit; 8/8 mandatory metrics PASS |
| SB6 | PASS | 6/6 | 0.867434% | MITC4 Reissner-Mindlin plate, kappa=5/6; 6/6 mandatory metrics PASS |
| P3S2-SS | CUSTOM_PASS | 5/5 | 2.06668e-10% | S-Structures 고유 안정화 qualification; STRIX 동일성 주장 아님 |

## 전체 21개 처리 상태

| ID | 상태 | 근거 |
| --- | --- | --- |
| SB1 | PASS | Euler-Bernoulli 3D frame; 4/4 mandatory metrics PASS |
| SB2 | PASS | QM6-EAS plane-stress membrane on parametric elliptic-annulus mesh; 1/1 mandatory metrics PASS |
| SB3 | PASS | QM6-EAS plane-stress membrane; 1/1 mandatory metrics PASS |
| SB5 | PASS | MITC4 Reissner-Mindlin plate in thin limit; 8/8 mandatory metrics PASS |
| SB6 | PASS | MITC4 Reissner-Mindlin plate, kappa=5/6; 6/6 mandatory metrics PASS |
| SB7 | PASS | distributed consistent Winkler foundation matrix; 2/2 mandatory metrics PASS |
| SB8 | PASS | Timoshenko 2-node frame with lumped translational mass and no rotary inertia; 6/6 mandatory metrics PASS |
| SB9 | PASS | separate Euler beam, axial-column, and combined portal production solves; 4/4 mandatory metrics PASS |
| SB10 | PASS | 3D axial-only truss; 8/8 mandatory metrics PASS |
| SB12 | UNSUPPORTED | 경사진 일반 6축 twoNodeLink와 beta-angle 변환 요소 없음 |
| PD1 | BLOCKED | direct geometric-stiffness second-order analysis with tension-positive Kg; 수치 4/4 PASS; qualification BLOCKED (PD1_STAGE_WORK_BALANCE_NOT_EXPOSED) |
| SM5 | BLOCKED | one element per member, Euler frame, explicit nodal lumping of published line mass; 수치 3/3 PASS; qualification BLOCKED (SM5_INDEPENDENT_REFERENCE_MODE_VECTORS_UNAVAILABLE) |
| SM5b | INPUT_BLOCKED | 층 질량과 회전관성의 완전한 수치가 공개 PDF에 없음 |
| SM6 | INPUT_BLOCKED | 18개 파이프 부재의 정확한 절점 좌표와 연결표가 없음 |
| SR1 | INPUT_BLOCKED | 집중질량 m의 절대값과 응답스펙트럼 절점값이 없음 |
| SR2 | INPUT_BLOCKED | 편심 질량·단면·응답스펙트럼의 전체 입력표가 없음 |
| SR2b | INPUT_BLOCKED | L형 배치와 El-Centro 스펙트럼 전체 절점값이 없음 |
| P3S2-SS | CUSTOM_PASS | S-Structures 고유 안정화 qualification; STRIX 동일성 주장 아님 |
| SP1 | READY_NOT_RUN | CSI 힌지와 S-Structures production hinge의 중립 매핑 fixture 추가 필요 |
| SH1 | UNSUPPORTED | STRIX 전용 DcrPMMHinge3d P-M-M 요소 없음 |
| TH1 | INPUT_BLOCKED | 공개 PDF에 동일 지진파 시계열 샘플이 없어 원 사례 재현 불가 |

## 상세 수치

### SB10 - PASS

| 응답 | S-Structures | 기준값 | STRIX 공개값 | 기준오차 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| Brace E1 axial (N) | -10000 | -10000 | -10000 | 0% | PASS |
| Brace E2 axial (N) | -20000 | -20000 | -20000 | 0% | PASS |
| Apex displacement ux (mm) | -0.25 | -0.25 | -0.25 | 0% | PASS |
| Apex displacement uz (mm) | -0.5 | -0.5 | -0.5 | 0% | PASS |
| Support N1 Rx (N) | -6000 | -6000 | -6000 | 0% | PASS |
| Support N1 Rz (N) | 8000 | 8000 | 8000 | 0% | PASS |
| Support N2 Rx (N) | 16000 | 16000 | 16000 | 0% | PASS |
| Support N2 Rz (N) | 12000 | 12000 | 12000 | 0% | PASS |

- 모델 hash: `3791a838b696765338442607d3db9db766a98ed8c4e49e06ecb889ec291e1e98`
- 결과 hash: `22b00cf7922c37df8ca0625ba40a9878e0164d3910de6b7b1ff50bf0b7b41992`
- 해석경로: 3D axial-only truss

### SB1 - PASS

| 응답 | S-Structures | 기준값 | STRIX 공개값 | 기준오차 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| Tip deflection uz (mm) | -0.107865 | -0.107865 | -0.107865 | -0.00015625% | PASS |
| Tip rotation ry (rad) | 5.39326e-5 | 5.39330e-5 | 5.39330e-5 | -0.000770827% | PASS |
| Support reaction Rz (N) | 1000 | 1000 | 1000 | 2.84217e-11% | PASS |
| Support moment My (N-mm) | -3.00000e+6 | -3.00000e+6 | -3.00000e+6 | -1.46839e-11% | PASS |

- 모델 hash: `687a2cfd1895a3b152f5d48d30f4f9dd9ef5bfe0a5fb17d000d1b1891bd338e5`
- 결과 hash: `ff17619abef1150c36a710b68b2cf9cbb0cc5adf0b3a5d586cf7b99b1aaba59f`
- 해석경로: Euler-Bernoulli 3D frame

### SB9 - PASS

| 응답 | S-Structures | 기준값 | STRIX 공개값 | 기준오차 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| Midspan deflection bending component (mm) | -69.1797 | -69.1797 | -69.1797 | -5.45025e-8% | PASS |
| Midspan deflection axial component (mm) | -0.193149 | -0.193149 | -0.193149 | -4.83924e-5% | PASS |
| Midspan deflection combined (mm) | -69.3728 | -69.3728 | -69.3655 | -1.89087e-7% | PASS |
| Component superposition residual (mm) | -1.19613e-12 | 0 | 0 | - | PASS |

- 모델 hash: `d9ebc8140ea2e406d4453e25b23ea27af21e2b6c1580f0449268daf387b0daf2`
- 결과 hash: `1e132abe5529b53cbcdc3d283cbb43c1f66ad10b3d88e2858abe15351e679116`
- 해석경로: separate Euler beam, axial-column, and combined portal production solves

### SB7 - PASS

| 응답 | S-Structures | 기준값 | STRIX 공개값 | 기준오차 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| Center deflection Uz (in) | -0.0893327 | -0.089333 | -0.089333 | 0.000355804% | PASS |
| Center moment My (kip-in) | 17698 | 17698 | 17697.9 | -4.00919e-5% | PASS |

- 모델 hash: `7d9a365d15acf96587b15bffe8fbfac66800b707442fdad6d2cc8c9ca7ec00b5`
- 결과 hash: `0e44c080c4673598974f1e94e0c3eec6f175749af0473e73df56eb9c41029974`
- 해석경로: distributed consistent Winkler foundation matrix

### SB8 - PASS

| 응답 | S-Structures | 기준값 | STRIX 공개값 | 기준오차 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| Natural frequency f1 (Hz) | 102.149 | 102.149 | 102.149 | -5.39527e-5% | PASS |
| Natural frequency f2 (Hz) | 364.057 | 364.059 | 364.057 | -0.000689965% | PASS |
| Natural frequency f3 (Hz) | 706.672 | 706.69 | 706.672 | -0.00259942% | PASS |
| Natural frequency f4 (Hz) | 1078.04 | 1078.1 | 1078.04 | -0.00604975% | PASS |
| Natural frequency f5 (Hz) | 1455.64 | 1455.8 | 1455.64 | -0.0110311% | PASS |
| Natural frequency f6 (Hz) | 1831.7 | 1832.02 | 1831.7 | -0.017469% | PASS |

- 모델 hash: `35d61e874f43c15ec2f48daaf3fd6560ecfb191b284a55f484cfb9d46678cfee`
- 결과 hash: `96485a9d9af38a0bb7ef8560b827e62b994c38c3700d82e6b13b93e954bbcf36`
- 해석경로: Timoshenko 2-node frame with lumped translational mass and no rotary inertia

### PD1 - BLOCKED

| 응답 | S-Structures | 기준값 | STRIX 공개값 | 기준오차 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| Uz without tension (in) | -1.04167 | -1.04167 | -1.04161 | 3.19994e-5% | PASS |
| My without tension (kip-in) | 22.5 | 22.5 | 22.499 | 6.95874e-10% | PASS |
| Uz with tension (in) | -0.543305 | -0.543305 | -0.543496 | 4.48251e-5% | PASS |
| My with tension (kip-in) | 11.5053 | 11.4981 | 11.4937 | 0.0629741% | PASS |

- 모델 hash: `404468c056ed785697422d603dd1d72f581da0aafc2dbf50ca55ba9365404ad6`
- 결과 hash: `1ac783e98de64dcc2615bc874917805de61fcfdba676c07ce3c8cae1f4d95fc3`
- 해석경로: direct geometric-stiffness second-order analysis with tension-positive Kg
- 자격 차단 사유: `PD1_STAGE_WORK_BALANCE_NOT_EXPOSED`

### SM5 - BLOCKED

| 응답 | S-Structures | 기준값 | STRIX 공개값 | 기준오차 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| Eigenvalue omega^2 mode 1 (rad2/s2) | 0.589534 | 0.589541 | 0.589538 | -0.00113462% | PASS |
| Eigenvalue omega^2 mode 2 (rad2/s2) | 5.52689 | 5.52695 | 5.52693 | -0.00107493% | PASS |
| Eigenvalue omega^2 mode 3 (rad2/s2) | 16.5877 | 16.5878 | 16.5878 | -0.000759803% | PASS |

- 모델 hash: `261925c3ba6f53fdd3796374a5750d2a80d77de2b24865b35eaf06721c49875e`
- 결과 hash: `b3b7d7a3c985aea866852449b40b2deb59a4928db694c90504e5e6c64b81e137`
- 해석경로: one element per member, Euler frame, explicit nodal lumping of published line mass
- 자격 차단 사유: `SM5_INDEPENDENT_REFERENCE_MODE_VECTORS_UNAVAILABLE`

### SB2 - PASS

| 응답 | S-Structures | 기준값 | STRIX 공개값 | 기준오차 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| Tangential stress at D (MPa) | 90.8574 | 92.7 | 90.8514 | -1.98767% | PASS |

- 모델 hash: `722ed5998d244e0c3a0fa9e0a098bddedbf97087bb21842efb4c90b9c988037f`
- 결과 hash: `18247dee858aa3c8890b574f8896f13581c1d39327c699c6ea85f594d3173e8a`
- 해석경로: QM6-EAS plane-stress membrane on parametric elliptic-annulus mesh

### SB3 - PASS

| 응답 | S-Structures | 기준값 | STRIX 공개값 | 기준오차 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| Normalized loaded-edge midpoint displacement (dimensionless) | 23.8833 | 23.91 | 23.9578 | -0.111762% | PASS |

- 모델 hash: `4c1c7011010b00b7e58747004b44f6bf7afa3a8d667c0526ad307b93fddf2a94`
- 결과 hash: `367ce55e7a81f57e17128ce544714d06cbffe2a2ddf45ee906845d34d76c47c1`
- 해석경로: QM6-EAS plane-stress membrane

### SB5 - PASS

| 응답 | S-Structures | 기준값 | STRIX 공개값 | 기준오차 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| SS-1x1-UDL (alpha) | 0.00405925 | 0.00406 | 0.00406 | -0.0184062% | PASS |
| SS-5x1-UDL (alpha) | 0.0128924 | 0.01297 | 0.01294 | -0.598375% | PASS |
| FIX-1x1-UDL (alpha) | 0.00126227 | 0.00126 | 0.00126 | 0.180212% | PASS |
| FIX-5x1-UDL (alpha) | 0.00257905 | 0.0026 | 0.00259 | -0.805737% | PASS |
| SS-1x1-POINT (alpha) | 0.0115869 | 0.0116 | 0.0116 | -0.113003% | PASS |
| SS-5x1-POINT (alpha) | 0.0169029 | 0.01695 | 0.01694 | -0.278077% | PASS |
| FIX-1x1-POINT (alpha) | 0.00555998 | 0.0056 | 0.00559 | -0.714704% | PASS |
| FIX-5x1-POINT (alpha) | 0.00718668 | 0.00725 | 0.00721 | -0.873362% | PASS |

- 모델 hash: `5a841daf12d704e8c52aa5b797224106f769f5d6a99023381b7001c50cbaf5e3`
- 결과 hash: `e4f655818c51cc4ecef79d3647a89d2e92d27b74db2eca1be4f772926ed4fc3a`
- 해석경로: MITC4 Reissner-Mindlin plate in thin limit

### SB6 - PASS

| 응답 | S-Structures | 기준값 | STRIX 공개값 | 기준오차 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| 1x1-R50 (alpha) | 0.00406164 | 0.004071 | 0.004068 | -0.229976% | PASS |
| 1x1-R20 (alpha) | 0.00410608 | 0.004115 | 0.004112 | -0.216681% | PASS |
| 1x1-R10 (alpha) | 0.00426482 | 0.004273 | 0.004271 | -0.191448% | PASS |
| 1x1-R5 (alpha) | 0.00489977 | 0.004904 | 0.004903 | -0.0863327% | PASS |
| 2x1-R10 (alpha) | 0.0103633 | 0.010454 | 0.010438 | -0.867434% | PASS |
| 2x1-R5 (alpha) | 0.0113418 | 0.01143 | 0.011414 | -0.771444% | PASS |

- 모델 hash: `4697291334ebabe8e46949ad225af14bf5bdf38840cf728c5ca6cab31b892e0d`
- 결과 hash: `74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b`
- 해석경로: MITC4 Reissner-Mindlin plate, kappa=5/6

### P3S2-SS - CUSTOM_PASS

| 응답 | S-Structures | 기준값 | STRIX 공개값 | 기준오차 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| Maximum static response shift (%) | 0.000155298 | 0 | - | - | PASS |
| Maximum physical period shift (%) | 0.000161037 | 0 | - | - | PASS |
| Minimum mass-weighted MAC (ratio) | 1 | 1 | - | -2.06668e-10% | PASS |
| Maximum static stabilization energy ratio (ratio) | 1.72553e-6 | 0 | - | - | PASS |
| Maximum modal stabilization energy ratio (ratio) | 3.57859e-6 | 0 | - | - | PASS |

- 모델 hash: `fd8b779cd823bef2843c480bc78a4fe93f2e0db4a4a3653eace61ace13d45c17`
- 결과 hash: `dbe903cca1f22badefbb86e2cb6bb93deb88f574136ffa24d7835de9930afae3`
- 해석경로: S-Structures custom actual-solve stabilization qualification

## 판정 제한

- MIDAS 값은 아직 실제 실행값이 없으므로 비교표에 넣지 않았다.
- STRIX 값은 공개 보고서의 전사값이며 STRIX 바이너리를 이 컴퓨터에서 재실행한 값이 아니다.
- REVIEW는 수치 허용오차 미충족, BLOCKED는 수치 통과와 별개로 필수 qualification 증빙이 미완료된 상태다. 둘 다 릴리스 또는 설계전이를 허용하지 않는다.
- 속도 비교는 동일 모델·동일 메시·동일 출력 요청 조건이 아직 충족되지 않아 수행하지 않았다.

