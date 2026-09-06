# Phase 9 Elastic and Nonlinear Migration Plan

```yaml
version: p9-migration-v1
status: proposed
strategy: parity-first-strangler-migration
```

## 1. 목적

기존 탄성설계와 Phase 8 비선형 기능을 중단하지 않고 공통 compute architecture로 이전한다. 리팩토링과 수치알고리즘 변경을 한 번에 수행하지 않으며 각 단계에서 기존 결과와 rollback 경로를 유지한다.

## 2. 변경하지 않는 제품계약

다음은 migration 전후에 동일해야 한다.

- model schema와 canonical domain identity
- node/member/story/origin ID
- material, section, load, mass와 nonlinear source hash
- analysis case와 result selection 의미
- member local axis와 result sign convention
- result units, envelope와 governing identity
- stale, qualification와 designBlocked 의미
- 계산보고서 provenance와 Agent/MCP result contract

내부 sparse format이나 backend가 바뀌어도 이 계약은 바뀌지 않는다.

## 3. Strangler 구조

```text
existing public API
  -> compatibility facade
     -> execution-plan router
        ├─ legacy/current CPU path
        └─ new compute session path
```

마일스톤별 feature flag는 개발·비교용이며 production 결과에서 숨겨진 fallback으로 사용하지 않는다. 새 경로가 gate를 통과하면 default를 이동하고, 기존 경로는 deprecation 기간 후 제거한다.

## 4. 탄성 정적 migration

### 4.1 Orchestrator 분리

현재 `src/solver/linear3d.js`가 가진 책임을 다음 단계로 분리한다.

```text
validate model
build canonical domain
plan load/factor groups
assemble stiffness and load batches
solve groups
recover results
build envelope
run design checks
audit and qualify
```

첫 변경은 behavior-preserving extraction이다. 결과 JSON과 호출순서를 golden test로 고정한 뒤 solver algorithm을 바꾼다.

### 4.2 Factor group

하중조합을 다음 key로 그룹화한다.

- topology/constraint hash
- material/section/effective-stiffness hash
- support spring와 settlement stiffness hash
- release/offset/diaphragm hash
- geometric tangent 또는 active-set hash
- solver matrix class와 ordering policy

같은 key만 factorization을 공유한다. unilateral active-set이나 Direct P-Delta tangent가 바뀌면 새 group을 만든다.

### 4.3 Multi-RHS

group별 stiffness를 한 번 조립하고 RHS matrix를 만든다. solve 결과는 기존 combo ID 순서로 복구한다. 한 RHS 실패가 다른 조합 결과를 오염시키지 않도록 channel별 status를 유지한다.

### 4.4 Worker 전환

- model 전체 object를 반복 clone하지 않고 DomainBinary를 transferable로 전달한다.
- UI는 job status와 result slice만 읽는다.
- progress는 validation/domain/assembly/factor/solve/recovery/design 단계로 구분한다.
- cancel은 assembly batch와 solve safe point에서 처리한다.
- sync compatibility는 S-tier 제한과 warning을 가진다.

## 5. Direct P-Delta migration

- 기존 load combination과 gravity/lateral 분류를 유지한다.
- 각 iteration의 tangent pattern과 numeric hash를 기록한다.
- pattern이 같아도 tangent value가 바뀌면 numeric factor를 재사용하지 않는다.
- modified Newton은 명시 설정과 trace가 있는 경우만 허용한다.
- GPU 첫 경로는 element/geometric stiffness batch와 SPD solve에 한정한다.
- instability 또는 general matrix 전환 시 CPU/WASM route를 사용하거나 explicit GPU run을 차단한다.

## 6. Modal/RSA migration

### 단계 1

기존 결과를 유지하며 dense eigensolver를 operation interface 뒤로 이동한다.

### 단계 2

sparse symmetric operator와 requested-mode solver를 추가한다.

- K/M matvec
- optional shift-invert solve
- mode count와 convergence trace
- mass normalization
- rigid-body filtering
- mode sign/order canonicalization

### 단계 3

GPU SpMV/block-vector operation을 후보로 연결한다. CQC/SRSS, participation과 RSA recovery는 CPU `f64` 기준을 유지한다.

## 7. Buckling migration

- preload result dependency를 유지한다.
- Ke/Kg operator와 subspace/eigen solver를 분리한다.
- follower load, staged stiffness, material tangent와 shell scope 차단을 유지한다.
- eigenvalue만 맞고 mode/recovery/eligibility가 다른 결과는 parity 실패다.
- GPU는 symmetric supported scope부터 시작한다.

## 8. 부재설계 migration

설계식은 구조공학 domain에 남긴다. GPU backend가 설계기준을 소유하지 않는다.

1. analysis envelope를 typed demand table로 pack
2. 동일 design formula family를 batch 분류
3. 선택적 GPU arithmetic 또는 Worker CPU batch 실행
4. CPU에서 formula trace, governing identity와 status 구성
5. 기존 steel/RC 상세설계 결과와 비교

branch가 많고 규모가 작은 프로젝트에서는 CPU를 정상 선택한다.

## 9. 비선형 element/fiber migration

### 9.1 Adapter 단계

기존 element kernel의 object contract를 유지하면서 입력·출력을 SoA buffer로 변환하는 adapter를 만든다. 이 단계에서는 계산식을 바꾸지 않는다.

### 9.2 CPU batch 단계

- 같은 element/property type을 batch로 묶는다.
- reusable local workspace를 사용한다.
- committed/trial state offset table을 고정한다.
- inner loop clone, string lookup, per-element hash를 제거한다.
- batch 후 기존 validation과 hash를 한 번 수행한다.

### 9.3 GPU batch 단계

CPU batch와 같은 binary contract를 WebGPU에 연결한다. 첫 지원 element/material 조합만 capability로 선언하고 미지원 조합은 CPU operation으로 분리하거나 explicit GPU run을 차단한다.

## 10. Pushover migration

순서는 다음과 같다.

1. 기존 production Pushover를 공통 ComputeSession으로 실행
2. CPU batch element와 공통 sparse backend parity
3. GPU fiber/element batch opt-in
4. SPD solve hybrid candidate
5. supported assembly residency
6. M-tier end-to-end qualification

gravity checkpoint, accepted step, capacity curve, hinge event, story/member result와 arc-length handoff를 모두 비교한다. GPU는 수렴 step 수를 줄이기 위한 다른 알고리즘을 암묵 적용할 수 없다.

## 11. NLTH migration

NLTH는 마지막에 이전한다.

- mass, damping, ground motion과 checkpoint는 canonical CPU `f64`로 pack한다.
- GPU session은 element/fiber state와 반복 workspace를 시간적분 동안 유지한다.
- output step과 internal substep을 구분한다.
- GPU readback은 saved result/checkpoint/audit 경계로 제한한다.
- failed substep은 CPU와 동일한 binary subdivision과 rollback 정책을 사용한다.
- device loss는 현재 substep을 폐기하고 마지막 canonical checkpoint까지만 보존한다.

general tangent 또는 dynamic release처럼 GPU qualification 밖의 조합은 시작 전에 route를 분리한다.

## 12. Public API migration

### 현재 문제

`analyzeModel`과 여러 UI bridge가 즉시 결과를 반환하는 sync 호출을 전제로 한다. GPU와 Worker job은 async다.

### 정책

- production 신규 API는 validate/plan/start/status/result 형태다.
- 기존 sync API는 small-model test와 compatibility를 위해 제한적으로 유지한다.
- sync facade는 GPU를 사용할 수 없다.
- facade 호출은 deprecation telemetry와 owner 목록에 기록한다.
- UI와 Agent 신규 기능은 facade를 호출하지 않는다.

API 제거는 repository 전체 호출처가 0이고 migration test가 통과한 뒤 수행한다.

## 13. Result와 cache migration

- 기존 result schema를 유지하고 compute provenance를 additive field로 추가한다.
- cache key에는 backend build가 아니라 계산에 영향을 주는 operation/precision policy를 명시한다.
- CPU와 GPU result를 같은 ID로 덮어쓰지 않는다.
- old result reader는 새 provenance field가 없어도 읽을 수 있어야 한다.
- 새 reader는 provenance 없는 old result를 `legacy-provenance`로 표시한다.

## 14. Feature flag

| Flag | 목적 | production default |
| --- | --- | --- |
| unified elastic plan | 새 factor grouping 비교 | off -> parity 후 on |
| elastic worker | async runtime 비교 | off -> UI gate 후 on |
| wasm elastic backend | 공통 f64 solver | off -> parity 후 on |
| webgpu batch | 독립 kernel qualification | off |
| hybrid elastic | GPU solve/correction | off |
| nonlinear gpu batch | Pushover/NLTH component | off |

flag는 테스트와 staged rollout을 위한 것이며 결과 provenance에서 숨길 수 없다.

## 15. Rollback 전략

- 각 migration은 old/new 결과를 동시에 생성할 수 있는 shadow mode를 먼저 제공한다.
- shadow result는 사용자 설계결과로 노출하지 않는다.
- default 전환 commit과 old path 제거 commit을 분리한다.
- new default에서 Critical regression이 발생하면 default route만 되돌리고 data schema는 유지한다.
- checkpoint/result migration이 비가역이면 default 전환하지 않는다.

## 16. 완료 판단

각 subsystem migration은 다음을 모두 충족해야 한다.

- golden 결과 parity
- operation telemetry와 memory evidence
- cancel/device-loss/state-integrity 시험
- UI/Agent/report contract parity
- old/new call graph와 deprecation 상태 갱신
- 관련 중복 코드 제거 또는 owner가 있는 잔여 debt 등록
- code review Critical/High 0

\n