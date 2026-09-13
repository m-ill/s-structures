# ADR-003: Extensible Backend Contract and Fail-Closed Execution

```yaml
status: accepted-for-phase9-planning
date: 2026-07-15
owners:
  - analysis-platform
  - product-runtime
decision_scope: phase9
related:
  - ../TARGET_ARCHITECTURE.md
  - ../PRODUCTION_REQUIREMENTS.md
  - ../RISK_REGISTER.md
```

## Context

현재 해석 경로는 solver별 함수 호출, Worker 메시지, UI bridge, Phase 8 backend 정책이 서로 다른 형태로 존재한다. 여기에 WebGPU를 직접 조건문으로 추가하면 native GPU, remote/HPC, 장치별 제한, async 전환, 장시간 실행의 취소와 checkpoint를 확장할 때마다 solver와 UI를 다시 수정해야 한다.

구조해석 제품에서는 실패 후 다른 계산 경로로 조용히 바꾸는 동작도 허용할 수 없다. 동일한 클릭이 어떤 backend와 precision으로 계산됐는지 확인 가능해야 한다.

## Decision

Phase 9는 solver가 backend 구현을 직접 호출하지 않는 **versioned compute backend contract**를 도입한다.

```text
AnalysisRequest
  -> AnalysisExecutionPlan
  -> ComputeBackendRegistry
  -> ComputeSession
  -> operation batches / ResultChunk
  -> audit / qualification / final result
```

### Required Contracts

| Contract | Responsibility |
| --- | --- |
| `ComputeBackend` | capability 조회, session 생성, backend identity/version 제공 |
| `ComputeCapabilities` | precision, limits, operation support, device profile 제공 |
| `AnalysisExecutionPlan` | 실행 전 backend/operation/precision/memory/transfer 계획 고정 |
| `ComputeSession` | allocation, dispatch, progress, cancellation, device-loss lifecycle 관리 |
| `DomainBinary` | 모델/하중/constraint의 버전된 immutable 입력 |
| `SparsePattern` | index width와 ordering이 명시된 공통 희소 구조 |
| `StateArena` | 반복 해석 상태의 소유권과 host/device dirty range 관리 |
| `ResultChunk` | 부분 결과, checksum, iteration/step provenance 전달 |
| `ComputeFailure` | 분류된 오류와 qualification 영향 전달 |

계약의 구체적인 schema와 모듈 경계는 `TARGET_ARCHITECTURE.md`를 따른다.

## Extensibility Rules

1. backend 추가는 registry provider 등록으로 끝나야 하며 solver별 분기를 추가하지 않는다.
2. capability는 backend 이름이 아니라 operation, precision, limits 조합으로 질의한다.
3. backend 계약은 semantic version을 가지며 breaking change는 migration adapter와 deprecation window가 필요하다.
4. DomainBinary와 ResultChunk는 backend 중립이며 host object를 직접 공유하지 않는다.
5. backend-specific handle은 `ComputeSession` 밖으로 노출하지 않는다.
6. UI와 Agent API는 실행 정책과 capability를 요청할 수 있지만 shader, buffer, WASM pointer를 다루지 않는다.
7. native/remote backend는 동일한 failure, progress, cancellation, evidence 계약을 구현해야 한다.

## Fail-Closed Policy

### Explicit Policy

사용자가 `gpu`, `wasm`, `cpu` 등 특정 backend를 요청한 경우 capability 부족, 메모리 부족, 초기화 실패 또는 실행 오류가 발생하면 해당 run은 실패한다. 다른 backend 결과로 대체하지 않는다.

### Auto Policy

`auto`는 실행 **전에만** 적합한 backend를 선택한다. 선택 근거는 다음과 함께 manifest에 기록한다.

- 모델 규모와 연산량 추정
- adapter/device capability 및 limit snapshot
- precision class
- 메모리와 전송비용 추정
- qualification 상태
- CPU 선택 또는 GPU 제외 reason code

계획이 고정된 뒤 backend 변경이 필요하면 기존 run을 실패시키고 새 run으로 재계획한다.

### Partial Results

- preview나 diagnostic으로 명시되지 않은 부분 결과는 최종 결과로 승격하지 않는다.
- 장치 손실 전 생성된 ResultChunk도 complete audit를 통과하지 않으면 설계에 사용하지 않는다.
- 취소와 실패는 서로 다른 상태와 reason code를 가진다.
- 실패 artifact에는 민감한 장치 정보의 허용 범위를 적용한다.

## Error Taxonomy

| Category | Example | Product behavior |
| --- | --- | --- |
| unsupported | precision/operation/limit 부족 | preflight 차단 |
| resource | OOM, allocation limit | run 실패, 규모/정책 안내 |
| device | lost/reset/driver error | run 실패, artifact 보존 |
| numerical | residual, NaN, correction 초과 | run 실패, qualification 차단 |
| contract | schema/version/checksum 불일치 | 즉시 실패, 내부 오류 분류 |
| cancelled | user/Agent cancellation | 안전 정리, 취소 상태 보존 |
| timeout | watchdog/budget 초과 | run 실패 또는 승인된 checkpoint 종료 |

reason code는 사용자 문구와 분리해 안정된 API 값으로 유지한다.

## Consequences

### Positive

- WebGPU 이후의 backend를 solver와 UI 재작성 없이 확장할 수 있다.
- 결과가 어떤 실행 계획에서 생성됐는지 추적 가능하다.
- device loss와 수치 실패가 정상 결과로 위장되는 것을 막는다.
- Worker, UI, Agent API가 동일 progress/cancel/result 모델을 사용한다.

### Cost

- 기존 sync 함수와 solver별 Worker 메시지를 단계적으로 migration해야 한다.
- schema versioning, compatibility adapter, lifecycle 테스트가 필요하다.
- 초기에는 adapter 계층이 늘어나지만 P9-M10에서 만료된 경로를 제거해야 한다.

## Rejected Alternatives

| Alternative | Reason rejected |
| --- | --- |
| solver 내부 `if (gpu)` 분기 | backend 추가마다 중복과 정책 불일치를 유발함 |
| UI가 직접 WebGPU를 관리 | 수치 정책, lifecycle, Agent 경로가 분산됨 |
| backend 오류 시 자동 fallback | 사용자의 실행 의도와 evidence provenance를 위반함 |
| 단일 전역 GPU device/context | 동시 실행, 취소, device loss와 테스트 격리가 어려움 |
| backend별 입력 schema | 변환 중복과 결과 비교 불가능성을 유발함 |

## Compatibility and Cleanup

- 기존 public sync API는 migration adapter로 한시 유지한다.
- adapter 사용량과 caller 목록을 evidence로 추적한다.
- deprecation 종료 조건을 충족한 adapter는 P9-M10에서 제거한다.
- 중복 sparse schema, backend switch, Worker message는 공통 계약으로 통합한다.
- 제거 시 dead export, 문서, 테스트 fixture, Agent contract도 함께 정리한다.

## Validation

- mock CPU/WASM/WebGPU provider contract suite
- capability negotiation 및 execution plan snapshot
- schema/version/checksum incompatibility tests
- explicit/auto policy별 fallback 금지 테스트
- cancellation, timeout, device loss, OOM failure injection
- partial result 승격 차단 테스트
- UI/Agent/report manifest parity
- compatibility adapter inventory와 P9-M10 zero-expired gate

## Revisit Triggers

- remote execution에 인증, queue, retry 등 별도 분산 시스템 계약이 필요함
- native backend가 프로세스 격리 또는 IPC 보안 경계를 요구함
- backend 계약이 두 개 이상의 독립 구현에서 반복적으로 확장 불가능함이 확인됨
- 규제 또는 고객 요구로 실패 후 승인된 fallback workflow가 필요함
