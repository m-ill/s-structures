# Phase 9 Development Hub - Hybrid Compute and Solver Modernization

```yaml
phase: 9
status: implementation-complete-qualification-blocked
documentation_status: implementation-complete
implementation_status: complete
completed_milestones: [P9-M0, P9-M1, P9-M2, P9-M3, P9-M4, P9-M6, P9-M7, P9-M9]
implemented_milestones: [P9-M0, P9-M1, P9-M2, P9-M3, P9-M4, P9-M5, P9-M6, P9-M7, P9-M8, P9-M9, P9-M10]
compute_qualification: G2-kernel-qualified-local-profile
release_gate: BLOCKED
next_gate: external-qualification
reviewed_at: 2026-07-16
mission: 탄성설계부터 비선형해석까지 공통 계산계약을 구축하고 CPU/WASM f64 기준경로와 선택적 GPU 가속경로를 production 수준으로 통합한다.
governing_plan: docs/phase9/MILESTONE_EXECUTION_PLAN.md
```

> Phase 9는 GPU 버튼을 추가하는 작업이 아니다. 기존 탄성 JavaScript solver와 Phase 8 비선형 Worker/WASM solver를 공통 compute architecture로 통합하고, 중복 조립·분해·상태복사를 제거한 다음 GPU에 적합한 batch 연산만 검증된 경로로 가속하는 작업이다.

P9-M10 구현은 완료됐지만 릴리스는 차단돼 있다. 외부 다중 벤더 행렬, 전체 CPU 회귀, M급 비선형 성능과 탄성 GPU 속도 기준이 없으므로 `Auto`는 CPU f64만 선택하고 설계전달은 허용하지 않는다.

## 1. 결론

Phase 9의 production 기본경로는 계속 deterministic CPU/WASM `f64`다. WebGPU 경로는 현재 WGSL의 runtime `f64` 부재를 전제로 element/fiber batch, sparse matrix-vector product, preconditioner, envelope reduction 같은 연산을 가속한다. GPU 결과는 CPU `f64` 잔차 재계산, iterative refinement, 평형·에너지·설계상태 감사를 통과해야만 설계 가능한 결과가 된다.

다음 원칙을 고정한다.

- 작은 모델과 ill-conditioned 모델은 CPU/WASM이 기본이다.
- GPU가 없거나 device가 손실되어도 모델과 committed state는 변하지 않는다.
- 사용자가 `gpu`를 명시하면 CPU로 조용히 대체하지 않는다.
- `auto`는 qualification된 operation별 route만 선택하고 실제 route를 run record에 남긴다.
- GPU kernel 속도가 아니라 전체 모델 입력부터 결과·보고까지의 end-to-end 시간을 평가한다.
- 기능 추가 마일스톤마다 중복 코드 제거, public contract 정리, dead code 처리와 문서 갱신을 함께 완료한다.

## 2. Phase 9 제품 정의

Phase 9 완료 후 프로그램은 다음 질문에 실행기록으로 답할 수 있어야 한다.

1. 어떤 backend와 precision으로 각 operation을 수행했는가?
2. 탄성·Direct P-Delta·modal/RSA·buckling·Pushover·NLTH가 같은 domain binary와 sparse pattern을 사용했는가?
3. 하중조합에서 동일 강성의 symbolic/numeric factorization을 몇 번 재사용했는가?
4. GPU 연산 결과를 어떤 CPU `f64` 기준으로 재검산했는가?
5. mixed precision이 허용되지 않는 조건에서 CPU 경로 또는 명시적 차단으로 전환했는가?
6. device loss, 취소, OOM, browser suspend에서 committed state와 결과 hash가 보존되었는가?
7. 새 backend를 추가할 때 해석 orchestrator와 UI를 다시 작성하지 않아도 되는가?
8. 리팩토링 후 기존 탄성·비선형 결과와 Agent/API 계약이 보존되었는가?

하나라도 확인할 수 없으면 해당 GPU 경로는 `candidate` 이상으로 승격하지 않는다.

## 3. 범위

### 포함

- 탄성해석을 main thread 동기경로에서 공통 analysis Worker로 이전
- 탄성·비선형 sparse matrix, backend capability, preflight, diagnostics 계약 통합
- 하중조합 multi-RHS와 symbolic/numeric factorization 재사용
- CPU/WASM `f64` SIMD·thread·memory-layout 최적화
- WebGPU adapter/device/limit/device-loss lifecycle
- PMM/fiber, element response, sparse SpMV, reduction용 WebGPU batch kernel
- CPU `f64` residual correction을 포함한 mixed-precision SPD solve
- Direct P-Delta, modal/RSA, buckling의 operation별 가속
- Pushover/NLTH의 resident state와 chunked result pipeline
- backend 선택 UI, progress/cancel, telemetry, report와 Agent/MCP parity
- CPU/GPU 수치 parity, 성능, 결정성, crash/restart qualification
- solver 중복 제거, legacy 격리, 파일 책임 재분리, 생성물 관리

### 명시적 비범위

- WebGPU `f32` 결과를 CPU 재검산 없이 설계값으로 사용
- 모든 구조 규모와 모든 GPU에서 가속을 보장
- GPU에서 pivoted sparse direct factorization 전체를 첫 구현으로 완성
- 외부 상용 solver 또는 라이선스 수치 library를 사용자 승인 없이 도입
- Phase 8 외부 독립검증을 GPU 성능결과로 대체
- GPU device가 없을 때 사용자 모르게 다른 backend로 실행
- 리팩토링을 이유로 기존 결과 schema나 public API를 일괄 파괴

## 4. 구현 원칙

1. **정확도가 속도보다 우선한다.** 성능향상 때문에 평형, 에너지, 설계상태 또는 event order를 완화하지 않는다.
2. **CPU `f64`는 canonical reference다.** GPU가 CPU 기준을 대체하지 않고 검증된 operation을 보조한다.
3. **backend는 operation capability 집합이다.** 하나의 `gpu=true`가 모든 계산을 GPU로 보낸다는 의미가 아니다.
4. **데이터는 versioned binary contract로 이동한다.** 임의 JavaScript object graph를 Worker/GPU 경계로 반복 복제하지 않는다.
5. **전송보다 상주를 우선한다.** 반복해석은 pattern, state, matrix와 history workspace를 session 동안 유지한다.
6. **silent fallback을 금지한다.** `auto` routing도 선택 근거와 실제 backend를 기록한다.
7. **비동기 경로를 기본으로 한다.** UI와 Agent가 같은 job lifecycle을 사용한다.
8. **refactor와 behavior change를 분리한다.** golden parity gate 없이 계산식과 파일구조를 동시에 변경하지 않는다.
9. **중복 구현을 늘리지 않는다.** 새 GPU adapter는 공통 contract 뒤에 추가하고 별도 해석 orchestrator를 만들지 않는다.
10. **미지원 조건은 fail-closed 한다.** precision, memory, matrix class 또는 device limit가 맞지 않으면 명시적으로 차단한다.
11. **작은 모델은 CPU가 정상이다.** GPU 사용률 자체를 제품 성공지표로 삼지 않는다.
12. **확장 가능성을 코드 경계로 증명한다.** 향후 native GPU, remote HPC 또는 새 sparse solver가 동일 backend interface를 사용해야 한다.

## 5. 릴리스 단계

| 릴리스 | 마일스톤 | 제공 범위 | 상태 규칙 |
| --- | --- | --- | --- |
| R9.0 Truthful Baseline | P9-M0 | 실제 workload profiling, 기술부채·계약 고정 | 문서·계측만 완료 |
| R9.1 Unified CPU Runtime | P9-M1~M3 | async Worker, 공통 sparse/WASM, multi-RHS | CPU `f64` parity 필수 |
| R9.2 GPU Foundation | P9-M4 | WebGPU lifecycle와 독립 batch kernel | 설계결과 미제공 |
| R9.3 Hybrid Elastic | P9-M5~M6 | 정적·P-Delta·modal/RSA·buckling 가속 | 기능별 `candidate` |
| R9.4 Hybrid Nonlinear | P9-M7~M8 | fiber/element/Pushover/NLTH 가속 | CPU parity 전 설계차단 |
| R9.5 Production Compute | P9-M9~M10 | UI/API, qualification, cleanup, release gate | 필수 hardware matrix 통과 후 승인 |

## 6. 문서 읽는 순서

1. [CURRENT_STATE_AUDIT.md](CURRENT_STATE_AUDIT.md) - 현재 CPU/WASM 구조와 병목·중복
2. [PRODUCTION_REQUIREMENTS.md](PRODUCTION_REQUIREMENTS.md) - 기능·비기능·리팩토링 요구사항
3. [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) - 공통 compute session과 backend 계약
4. [COMPUTE_PRECISION_POLICY.md](COMPUTE_PRECISION_POLICY.md) - f64 기준, mixed precision, 결정성
5. [ELASTIC_NONLINEAR_MIGRATION.md](ELASTIC_NONLINEAR_MIGRATION.md) - 탄성·동적·비선형 이전 순서
6. [REFACTORING_AND_CODE_CLEANUP.md](REFACTORING_AND_CODE_CLEANUP.md) - 중복 제거·deprecation·코드 위생
7. [PERFORMANCE_AND_QUALIFICATION.md](PERFORMANCE_AND_QUALIFICATION.md) - workload, budget, hardware matrix
8. [RISK_REGISTER.md](RISK_REGISTER.md) - 수치·제품·운영 위험과 완화책
9. [MILESTONE_EXECUTION_PLAN.md](MILESTONE_EXECUTION_PLAN.md) - P9-M0~P9-M10 실행계획
10. [VERIFICATION_MATRIX.md](VERIFICATION_MATRIX.md) - 검증 ID와 합격기준
11. [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) - 요구사항·코드·시험·증거 연결
12. [REFERENCE_BASIS.md](REFERENCE_BASIS.md) - 표준·공식 API·기존 근거
13. [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) - 실제 구현 상태

Architecture Decision Record는 [adr/](adr/)에 둔다. Phase 8의 비선형 수치계약과 qualification은 계속 [Phase 8 문서](../phase8/README.md)가 지배하며 Phase 9가 이를 암묵적으로 승격하지 않는다.

## 7. Phase 9 완료조건

- 공통 compute contract가 탄성·비선형 production 경로에서 사용된다.
- main thread에서 M-tier 해석을 직접 실행하지 않는다.
- 동일 선형 강성의 하중조합은 symbolic/numeric factorization을 공유한다.
- CPU/WASM `f64` 결과가 Phase 7·8 golden 결과와 허용오차 안에서 일치한다.
- GPU 경로는 지원 operation, precision, device와 qualification을 정확히 보고한다.
- GPU 결과는 CPU `f64` residual·평형·설계상태 gate를 통과한다.
- device loss, OOM, cancel, restart가 model과 committed state를 오염시키지 않는다.
- S/M/L workload의 end-to-end 시간·메모리·UI 응답성이 증거로 남는다.
- legacy/duplicate solver 제거는 deprecation gate와 전체 회귀시험을 통과한다.
- 새 backend fixture를 추가해 orchestrator 변경 없이 contract test가 통과한다.
- Critical/High code-review finding이 0이고 문서·Agent/API·보고서 계약이 동기화된다.
