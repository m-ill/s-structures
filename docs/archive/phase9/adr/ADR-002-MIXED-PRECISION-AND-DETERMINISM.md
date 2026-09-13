# ADR-002: Mixed Precision and Determinism Policy

```yaml
status: accepted-for-phase9-planning
date: 2026-07-15
owners:
  - numerical-core
  - verification
decision_scope: phase9
related:
  - ../COMPUTE_PRECISION_POLICY.md
  - ../VERIFICATION_MATRIX.md
```

## Context

구조해석 결과는 단순 렌더링 값이 아니라 부재력, 변위, 안정성, 힌지 상태와 설계 판정을 결정한다. 현재 WebGPU/WGSL의 런타임 수치 타입만으로 CPU `f64` 기준 해석을 그대로 복제할 수 없으므로 GPU 가속을 도입하려면 혼합 정밀도 경계를 명시해야 한다.

또한 GPU vendor, driver, reduction 순서에 따라 마지막 비트까지 동일한 결과를 보장하기 어렵다. 프로덕션 요구는 비현실적인 bitwise 동일성이 아니라, 동일한 공학적 판단과 허용오차 내 결과를 재현하고 차이를 감사할 수 있게 하는 것이다.

## Decision

1. 모델 입력, 기준 해, 잔차, 보정, 평형 감사 및 최종 설계 판정의 canonical precision은 CPU/WASM `f64`다.
2. WebGPU `f32`는 승인된 kernel의 가속 정밀도로만 사용한다.
3. `f32` 결과를 최종 해로 직접 채택하지 않는다. CPU `f64` residual recomputation과 필요한 correction/refinement를 수행한다.
4. 조건수, 잔차 감소, 보정 횟수 또는 상태 경계 민감도가 허용 범위를 벗어나면 해당 실행은 실패한다. 실행 도중 조용한 CPU 재계산은 하지 않는다.
5. 비선형 상태 전이, 힌지 이벤트, 수렴 판정, adaptive step 결정은 CPU의 canonical 순서와 `f64` 기준으로 확정한다.
6. 같은 환경에서는 안정된 ordering, seed, partition, reduction tree를 고정해 재현성을 최대화한다.
7. 서로 다른 GPU/driver 간 qualification은 bitwise equality가 아니라 정의된 절대·상대 오차, equilibrium residual, 상태/event parity, 설계 판정 parity로 평가한다.

## Precision Classes

| Class | Use | Allowed implementation | Promotion condition |
| --- | --- | --- | --- |
| P0 canonical | 입력, 기준 해, 감사, 최종 판정 | CPU/WASM `f64` | 항상 authoritative |
| P1 corrected | 선형대수/반복 가속 | GPU `f32` + CPU `f64` residual/correction | 검증 매트릭스 통과 |
| P2 screened | preview, 비용 추정, 라우팅 | GPU/CPU 저비용 근사 | 결과 판정에 사용 금지 |
| P3 visual | 렌더링/그래프 좌표 | `f32` 허용 | 원본 결과를 변경하지 않음 |

P1 외의 GPU 수치 결과를 해석 또는 설계 결과로 표시해서는 안 된다.

## Determinism Contract

### Same environment

- 동일 source revision, input hash, backend version, device/driver profile을 기록한다.
- DOF, element, load, constraint, fiber, hinge 순서를 canonical ID로 정렬한다.
- 병렬 reduction tree와 chunk 크기를 고정한다.
- 비선형 event ordering의 tie-break 규칙을 문서화하고 테스트한다.
- 반복 횟수, residual history, substep/retry history를 evidence에 포함한다.

### Cross environment

- 결과 벡터의 절대·상대 오차를 동시에 평가한다.
- force/moment equilibrium과 energy balance를 별도로 평가한다.
- 고유치 순서가 근접할 때 modal subspace와 참여질량을 비교한다.
- 힌지 상태, 항복 순서, 극한 도달 step, collapse/failure 분류를 비교한다.
- 설계 ratio가 판정 경계 근처일 때 CPU `f64` 재검증을 필수로 한다.

구체적인 tolerance는 `COMPUTE_PRECISION_POLICY.md`와 `VERIFICATION_MATRIX.md`가 단일 출처다. 이 ADR에 숫자를 중복 기록하지 않는다.

## Failure Policy

다음 조건은 GPU 성공으로 처리하지 않는다.

- NaN/Infinity 또는 비정상 denormal 전파
- residual stagnation/divergence
- correction budget 초과
- CPU/GPU 상태 전이 불일치
- 설계 pass/fail 또는 collapse 판정 불일치
- 재현성 fingerprint 누락
- 승인 범위 밖 장치/driver에서 qualification 표시

explicit GPU 실행은 실패 artifact를 남기고 종료한다. auto 모드가 사전 계획 단계에서 CPU를 선택하는 것은 허용하지만, 실행 중 결과를 숨겨 교체하는 것은 허용하지 않는다.

## Consequences

### Positive

- GPU 가속으로 인해 공학적 판단 기준이 낮아지는 것을 방지한다.
- vendor 차이를 계량화하고 결과 provenance를 추적할 수 있다.
- 정밀도 정책이 탄성, 고유치, P-Delta, Pushover, NLTH에 동일하게 적용된다.

### Cost

- CPU residual/correction과 데이터 동기화 비용이 발생한다.
- 일부 ill-conditioned 모델은 GPU 이득 없이 실패하거나 CPU 계획으로만 실행된다.
- nonlinear event parity와 근접 고유모드 비교를 위한 검증 자산이 추가로 필요하다.

## Rejected Alternatives

| Alternative | Reason rejected |
| --- | --- |
| GPU `f32` 결과를 그대로 최종값으로 사용 | 공학적 판정과 ill-conditioned 모델의 신뢰성을 보장할 수 없음 |
| 모든 결과에 bitwise equality 요구 | 병렬 reduction과 device 차이 때문에 이식 가능성이 없고 공학적 검증과도 다름 |
| tolerance를 테스트별로 임의 지정 | 결과 간 일관성과 감사 가능성을 훼손함 |
| 불일치 시 자동 CPU 결과로 교체 | 실패 원인과 실행 정책을 숨김 |

## Approval Boundary

다음 변경은 별도 ADR과 사용자 승인이 필요하다.

- `f32`-only production result
- canonical precision 완화
- 공학 판정 tolerance 확대
- CPU residual/correction 제거
- 비결정적 알고리즘을 기본값으로 승격
- GPU vendor별 별도 결과 기준 채택

## Verification Evidence

- canonical CPU/WASM reference artifact
- kernel별 mixed-precision error envelope
- iterative refinement trace
- same-environment repeatability fingerprint
- cross-vendor/driver parity matrix
- nonlinear event and design-decision parity
- failure injection and fail-closed artifact

\n