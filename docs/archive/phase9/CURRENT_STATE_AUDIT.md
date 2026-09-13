# Phase 9 Current-State Audit

```yaml
audit_date: 2026-07-15
scope: elastic design, direct p-delta, dynamics, nonlinear equilibrium, worker/wasm runtime, gpu boundary, code health
status: planning-baseline
```

## 1. 감사 방법

현재 실행경로와 문서를 기준으로 다음을 대조했다.

- 탄성 orchestrator와 하중조합 실행 순서
- dense/CSC/typed sparse 표현과 solver 진입점
- modal/RSA와 buckling의 행렬·고유치 경로
- Phase 8 nonlinear Worker, WASM backend, element evaluation과 state flow
- GPU option, backend capability와 fail-closed 정책
- M11 성능증거가 측정한 범위와 측정하지 않은 범위
- 파일 책임, 동기/비동기 API, 중복 구현과 legacy 경계

감사 결과는 기능 존재 여부와 production 적합성을 구분한다.

## 2. 우선순위별 발견사항

| ID | 우선순위 | 발견사항 | 영향 | Phase 9 조치 |
| --- | --- | --- | --- | --- |
| P9-AUD-01 | Critical | `analyzeModel`이 동기식이며 하중조합을 순차 실행한다. | 큰 모델에서 UI 차단, 취소·progress 불가 | 공통 async Worker job으로 이전 |
| P9-AUD-02 | High | 선형 조합별로 동일 강성의 조립·분해를 재사용하지 않는다. | 조합 수에 비례한 불필요 비용 | load plan, multi-RHS, factor cache 도입 |
| P9-AUD-03 | High | 탄성 sparse와 비선형 typed sparse/WASM 계약이 분리돼 있다. | 중복 진단·변환·버그 위험 | `src/compute` 공통 계약으로 수렴 |
| P9-AUD-04 | High | modal과 buckling 일부가 dense submatrix·Cholesky·고유치 루프를 사용한다. | M/L 규모 메모리와 시간 확장 제한 | sparse eigensolver operation 계약 도입 |
| P9-AUD-05 | High | 비선형 요소가 JavaScript object 단위로 순차 평가되고 반복마다 clone/hash가 많다. | solver보다 element/state overhead가 지배 가능 | SoA batch adapter와 bounded state arena |
| P9-AUD-06 | High | WASM general solver가 single-thread/single-RHS row-sparse pivot LU다. | fill과 pivot 탐색 비용, 중단 지연 | CPU 최적화와 backend capability 분리 |
| P9-AUD-07 | High | GPU 정책과 UI는 있으나 실제 backend와 parity evidence가 없다. | 체크박스가 기능으로 오해될 위험 | capability 기반 disabled/qualification UI |
| P9-AUD-08 | Medium | M11 10,000 DOF 측정은 약 3만 nnz 합성 kernel이다. | 실제 frame end-to-end 속도 예측 불가 | 실제 elastic/Pushover/NLTH fixture profiling |
| P9-AUD-09 | Medium | 여러 sparse 형식이 일반 Array와 TypedArray를 혼용한다. | 복사·GC·Worker transfer 증가 | versioned typed binary contract |
| P9-AUD-10 | Medium | public sync API에 대한 호출자가 광범위하다. | 즉시 async 전환 시 대규모 회귀 | compatibility facade와 단계적 deprecation |
| P9-AUD-11 | Medium | 성능 telemetry가 경로별로 달라 전체 시간분해가 불완전하다. | 병목 오판과 과장된 GPU speedup | 공통 telemetry schema |
| P9-AUD-12 | Medium | legacy와 production 명칭·진입점이 여러 세대에 걸쳐 남아 있다. | 유지보수와 사용자 오선택 위험 | owner, expiry, removal gate를 가진 debt register |

## 3. 탄성해석 경로

### 현재 동작

- `src/solver/linear3d.js`의 `analyzeModel`은 검증, 조합별 해석, P-Delta, dynamics, 설계검토를 한 동기 함수에서 조정한다.
- 각 조합은 `analyzeAll`로 들어가며 component assembly와 solve를 반복한다.
- `src/solver/linear3dAssembly.js`는 DOF 규모와 설정에 따라 dense 또는 sparse CSC를 조립한다.
- `src/solver/sparse/solveSparse.js`는 JavaScript sparse LDLT/CG와 제한된 dense fallback을 제공한다.
- 설계검토는 부재별 독립 계산이라 병렬화가 쉽지만, 일반적으로 전역해석보다 우선 병목은 아니다.

### 핵심 문제

선형 정적해석에서 topology, material, section, support와 대부분의 stiffness는 하중조합 사이에 동일하다. 현재 구조는 load vector만 다른 경우에도 조립·factorization을 operation-level로 공유하지 않는다. GPU 이전에 이를 고치지 않으면 더 빠른 장치에서 같은 중복을 반복하게 된다.

## 4. 동적·좌굴 경로

- modal/RSA는 탄성 강성과 질량 domain을 재사용하지만 dense matrix 변환과 직접 고유치 연산이 포함된다.
- global buckling도 free-DOF submatrix와 Cholesky 기반 generalized eigen solve를 사용한다.
- GPU SpMV가 유효하려면 먼저 matrix-free 또는 sparse Lanczos/subspace iteration 계약으로 분리해야 한다.
- 작은 모드 수를 요구하는 일반 건축골조에서는 전체 dense eigen decomposition을 GPU로 복제하지 않는다.

## 5. 비선형 경로

### 재사용 가능한 기반

- production Worker와 명시적 backend injection
- canonical nonlinear domain과 typed sparse pattern
- deterministic CPU/WASM `f64` solver
- committed/trial state, rollback, checkpoint와 result chunk
- Pushover/NLTH 공통 element state와 run record
- `auto/cpu/wasm/gpu` 정책과 GPU fail-closed reason code

### 병목과 확장 문제

- element kernel은 요소마다 순차 `await`되고 object clone과 validation을 반복한다.
- tangent assembly는 precomputed scatter를 사용하지만 CPU 단일 루프다.
- GPU로 local matrix만 계산하고 매 반복 CPU로 되가져오면 전송비가 이득을 상쇄한다.
- Pushover/NLTH 가속은 domain, state, sparse pattern과 workspace를 GPU session에 상주시켜야 한다.
- softening, release, arc-length는 general/indefinite 행렬을 요구해 WebGPU 첫 대상에 적합하지 않다.

## 6. GPU 준비상태

이미 갖춘 것:

- backend metadata: `executionTarget`, `numericPrecision`, `deterministic`, `production`
- 명시적 GPU enable과 `GPU_BACKEND_UNAVAILABLE` 계열 차단
- Worker 경계와 production fallback 금지
- typed sparse pattern과 element scatter

없는 것:

- WebGPU adapter/device/session lifecycle
- GPU buffer layout와 device limit preflight
- WGSL compute kernel
- mixed-precision correction과 acceptance gate
- CPU/GPU parity fixture와 hardware matrix
- device-loss·OOM·cancel·restart 증거
- browser별 성능과 입력지연 증거

따라서 현재 GPU 체크박스는 capability 요청일 뿐 계산기능이 아니다.

## 7. M11 성능증거의 해석

M11은 10,000 DOF, 약 29,998 nnz의 production WASM sparse kernel을 반복 측정하고 symbolic cache, residual, streaming, cancel/restart와 병렬 Worker 결정을 확인했다. 이는 유효한 backend 증거지만 다음은 포함하지 않는다.

- 실제 3D frame element evaluation과 assembly
- 복잡한 frame sparsity의 fill-in
- general/indefinite pivot solve
- 중력 preload와 Pushover 100 accepted step
- NLTH 20,000 input step
- browser main-thread latency와 GPU transfer

Phase 9 baseline은 이 항목을 별도 operation timer로 측정해야 한다.

## 8. 코드 건강성 판단

### 유지

- canonical domain과 stable hash
- Phase 8 state/element/result contract
- production Worker job lifecycle
- in-house WASM backend와 fail-closed policy
- qualification evidence와 release manifest 방식

### 통합

- `src/solver/sparse`와 `src/nonlinear/equilibrium/typedSparse.js`
- 탄성·비선형 backend capability/preflight/diagnostics
- analysis Worker protocol과 progress/cancel telemetry
- result chunk와 history paging

### 단계적 폐기

- main-thread 대형 탄성 실행
- 조합별 불필요 stiffness 재조립·재분해
- production 경로의 일반 Array sparse storage
- GPU 구현 후에도 남는 별도 GPU 전용 orchestrator
- owner·시험·사용처가 없는 legacy adapter

## 9. 권장 전략

1. 실제 workload profiling과 golden parity를 먼저 고정한다.
2. 탄성해석을 async Worker와 공통 typed sparse contract로 옮긴다.
3. CPU/WASM에서 multi-RHS, factor reuse, memory layout을 먼저 개선한다.
4. GPU 독립 batch kernel로 device lifecycle과 수치정책을 검증한다.
5. SPD elastic hybrid solve를 먼저 production 후보로 만든다.
6. modal/RSA와 fiber/element batch를 operation별로 확장한다.
7. Pushover/NLTH는 state-resident pipeline이 준비된 뒤 연결한다.
8. 마지막에 UI/API와 legacy cleanup을 release gate로 묶는다.

\n