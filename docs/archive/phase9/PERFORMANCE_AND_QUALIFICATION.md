# Phase 9 Performance and Qualification Plan

```yaml
version: p9-performance-qualification-v1
status: proposed
primary_metric: end-to-end-qualified-runtime
reference_path: cpu-wasm-f64
```

## 1. 원칙

GPU kernel microbenchmark만으로 제품 가속을 주장하지 않는다. 모델 검증부터 domain packing, transfer, solve, recovery, audit, result 저장과 UI 초기표시까지의 전체 시간을 측정한다.

- 정확히 같은 수렴·결과 범위만 성능 비교표본으로 인정한다.
- warm-up과 measured run을 분리한다.
- CPU baseline regression과 GPU speedup을 별도 gate로 관리한다.
- GPU가 느린 workload에서는 CPU 선택이 정상이다.
- hardware/browser/backend build를 고정하지 않은 숫자는 참고값이다.

## 2. 공통 telemetry schema

```text
validationMs
domainBuildMs
binaryPackMs
planMs
workerStartupMs
deviceInitMs
uploadMs
elementEvaluationMs
assemblyMs
symbolicMs
factorizationMs
iterativeSolveMs
correctionMs
f64AuditMs
recoveryMs
designMs
resultWriteMs
readbackMs
popupReadyMs
totalMs
```

추가 count:

- element/fiber evaluation
- matrix rebuild와 pattern reuse
- factorization과 RHS solve
- GPU dispatch와 queue submit
- host-device bytes
- correction iteration
- accepted/rejected step와 substep
- allocated/peak/resident/result bytes
- Worker message와 main-thread long task

## 3. Reference workload

### 규모

| Tier | Active DOF | Element | Load combinations | 목적 |
| --- | ---: | ---: | ---: | --- |
| S | <= 1,000 | <= 1,500 | 10 | CI, small-model threshold |
| M | 5,000~10,000 | 7,500~15,000 | 30~60 | 일반 중층 3D 골조 |
| L | 25,000~50,000 | 35,000~75,000 | 60+ | memory와 확장성 |

### Fixture

| ID | 내용 |
| --- | --- |
| P9-PERF-ELA-S/M/L | 선형 정적, 동일 stiffness 다중조합, recovery·design 포함 |
| P9-PERF-PD-M | 중력+횡하중 Direct P-Delta, tangent iteration |
| P9-PERF-MOD-M | 10~30 mode modal과 participation |
| P9-PERF-RSA-M | X/Y spectrum, SRSS/CQC, story/member recovery |
| P9-PERF-BUC-M | preload dependency와 저차 buckling modes |
| P9-PERF-PMM-M | unique steel/RC section interaction batch |
| P9-PERF-PUSH-S/M | gravity preload + 100 accepted/output step |
| P9-PERF-NLTH-S/M | 5,000/20,000 input step와 checkpoint/history |
| P9-PERF-RESULT-M | envelope, chart slice, report와 export |

실제 frame sparsity, diaphragm, offset, spring, hinge/fiber를 포함한다. 3대각 합성행렬은 kernel test로만 유지한다.

## 4. CPU baseline gate

GPU 착수 전에 다음 CPU/WASM 개선을 측정한다.

- 조합별 재조립 대비 factor group
- single RHS 대비 multi-RHS
- JavaScript sparse 대비 공통 WASM `f64`
- object element loop 대비 CPU SoA batch
- single-thread 대비 SIMD/qualified WASM threads
- dense eigen 대비 sparse requested-mode operator

새 CPU default는 기존 결과 parity를 통과하고 동일 fixture에서 기존 total runtime의 110%를 초과하지 않아야 한다. 느려진 경우 정확도·메모리·기능범위 변화와 승인근거가 필요하다.

## 5. GPU auto-selection gate

`auto`가 GPU를 선택하려면 해당 hardware profile에서 다음을 모두 만족해야 한다.

- 기능과 precision qualification 통과
- 예상 buffer가 device/process budget 안에 있음
- workload가 검증된 최소규모 이상
- transfer와 correction을 포함한 median total runtime이 CPU보다 유의미하게 낮음
- p95와 실패율이 승인범위 안에 있음
- CPU `f64` audit 통과율 100%

초기 자동선택 후보 기준은 end-to-end median 20% 이상 개선이다. P9-M0/M4 측정 후 승인 없이 기준을 낮추지 않는다. 사용자는 qualification된 GPU를 명시 선택할 수 있지만 성능상 불리하다는 경고를 받을 수 있다.

## 6. UX와 runtime budget

| 항목 | Budget |
| --- | --- |
| UI input acknowledgement | 실행 중 p95 <= 100 ms |
| progress update | 첫 갱신 <= 1 s, 이후 bounded rate |
| cancel acknowledgement | <= 2 s |
| device-loss 표시 | 감지 후 <= 2 s |
| M-tier preflight | <= 5 s |
| cached result popup | <= 500 ms |
| chart interaction | downsampled 기준 p95 <= 100 ms |
| Worker terminal cleanup | <= 2 s 또는 명시 pending-dispose 상태 |
| unbounded retained GPU allocation | 0 |

Phase 8의 `PERF-PUSH-M <= 10분`, `PERF-NLTH-M <= 30분`, peak analysis memory `<= 1.5 GiB` 최소 목표는 유지한다. Phase 9는 GPU를 이유로 이 기준을 완화하지 않는다.

## 7. Memory preflight

다음을 합산한다.

- canonical CPU domain/state/result
- Worker transfer/copy peak
- WASM linear memory와 factor fill
- GPU domain/property/state buffers
- sparse pointers/indices/values와 preconditioner
- trial/correction/reduction workspace
- readback staging과 checkpoint

WebGPU adapter의 `maxBufferSize`, `maxStorageBufferBindingSize`, storage binding 수와 process budget을 확인한다. 큰 allocation은 여러 logical buffer로 분할하되 device limit를 우회했다고 간주하지 않는다.

hard limit는 설정값, 측정 가능한 available budget의 60%, adapter limit에서 산출한 안전상한 중 가장 작은 값으로 한다. 불명확한 환경은 보수적 profile을 사용한다.

## 8. Hardware/browser qualification matrix

최소 profile:

| Profile | 목적 |
| --- | --- |
| CPU-only / WebGPU unavailable | 완전한 production fallback-free CPU 지원 |
| fallback/software adapter | GPU 실행 차단과 reason code |
| integrated GPU low/medium | memory·small workload threshold |
| discrete GPU vendor A | primary acceleration evidence |
| discrete GPU vendor B | cross-vendor parity |
| device-loss injection | state·resource 복구 |

각 profile은 OS, browser build, power mode, adapter info bucket, limits와 driver를 기록한다. 적어도 production 주 브라우저와 지원 대상 보조 브라우저에서 capability/preflight를 검증한다.

## 9. 측정 절차

1. source revision, dirty state와 backend build 기록
2. 고정 fixture와 execution plan hash 확인
3. cold startup 1회 별도 측정
4. warm-up 1회 제외
5. measured run 5회
6. median, p95, min/max와 peak memory 기록
7. CPU/GPU channel parity 재계산
8. failure/device-loss/cancel 시험 별도 실행
9. raw result와 summary hash 저장
10. code review와 release manifest 연결

thermal throttling, background load 또는 device 변경이 감지되면 표본을 혼합하지 않는다.

## 10. Component qualification

### GPU platform

- adapter/feature/limit query
- buffer lifecycle와 alignment
- queue completion, error scope와 device loss
- deterministic dispatch configuration

### Numeric kernel

- vector operations과 reduction
- CSR SpMV
- scaling/preconditioner
- element/fiber batch
- envelope reduction

### Hybrid solve

- f32 solve와 CPU f64 correction
- ill-conditioned rejection
- correction nonconvergence
- no silent CPU-only replacement

## 11. End-to-end qualification

### 탄성

- 모든 combo/result channel 존재
- factor group과 RHS mapping 정확
- envelope/design governing identity 동일
- equilibrium and audit 통과

### Modal/RSA/Buckling

- requested modes와 convergence trace
- eigenpair correlation과 ordering
- participation/RSA/buckling recovery parity

### Pushover/NLTH

- accepted/rejected path와 event
- state commit/rollback
- energy와 equilibrium
- checkpoint/restart
- history/result chunk integrity

## 12. Failure qualification

| 시험 | 합격조건 |
| --- | --- |
| GPU 미지원 | explicit GPU 차단, auto CPU plan 가능 |
| device loss | trial 폐기, canonical checkpoint 보존 |
| OOM estimate | allocation 전 차단 |
| actual OOM | worker/session 종료, model 불변 |
| correction 실패 | GPU result 설계차단 |
| cancel | committed boundary와 resource dispose 확인 |
| browser suspend | resume integrity 또는 명시 실패 |
| corrupted chunk | result qualification 차단 |

## 13. Evidence schema

```json
{
  "suiteId": "P9-PERF-*",
  "sourceRevision": "...",
  "environment": {},
  "executionPlan": {},
  "cpuBaseline": {},
  "candidate": {},
  "parity": {},
  "failureTests": [],
  "qualification": {},
  "artifactHash": "..."
}
```

evidence에는 실제 raw channel 비교와 tolerance를 포함한다. backend 이름, screenshot 또는 성공 status만으로 parity를 통과할 수 없다.

## 14. 성능 회귀 정책

- CPU baseline regression은 GPU 결과와 별도로 차단한다.
- profile별 approved baseline을 versioned registry로 관리한다.
- total runtime 10% 이상 악화, peak memory 15% 이상 증가 또는 UI budget 실패는 review finding이다.
- 수치안정성 개선으로 증가한 비용은 별도 승인과 release note가 필요하다.
- hardware drift가 있으면 기존 baseline을 덮어쓰지 않고 새 profile을 만든다.

## 15. 완료조건

- S/M/L 실제 frame fixture와 operation breakdown 존재
- CPU/WASM 최적화와 regression gate 통과
- GPU kernel과 hybrid solve parity 통과
- required hardware/browser matrix 통과
- device-loss/OOM/cancel/restart 통과
- GPU auto-selection threshold가 실제 evidence로 고정
- end-to-end speedup과 memory를 report/manifest에서 재현 가능
- 미측정 operation은 capability에서 unavailable로 표시

\n