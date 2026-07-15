# Phase 9 Reference Basis

```yaml
version: p9-reference-basis-v1
status: active
reviewed_at: 2026-07-15
```

## 1. 목적

Phase 9의 플랫폼·정밀도·수치·성능 판단이 임의 가정이나 특정 GPU vendor 마케팅 자료에 의존하지 않도록 기준출처와 적용범위를 고정한다.

## 2. 외부 공식 기준

| 출처 | 적용 |
| --- | --- |
| [WebGPU specification](https://gpuweb.github.io/gpuweb/) | adapter/device, limits, buffers, errors, device loss와 feature detection |
| [WGSL specification](https://gpuweb.github.io/gpuweb/wgsl/) | concrete numeric types, floating-point semantics, shader memory와 execution |
| [WebGPU conformance test suite](https://gpuweb.github.io/cts/) | browser/device capability와 API conformance 참고 |
| [WebAssembly core specification](https://webassembly.github.io/spec/core/) | WASM execution, memory와 numeric semantics |

외부 문서가 변경될 수 있으므로 qualification evidence에는 확인한 spec URL과 browser/backend build를 함께 기록한다.

## 3. 저장소 내부 기준

| 기준 | 역할 |
| --- | --- |
| [Phase 7 README](../phase7/README.md) | 탄성설계·모델링 실무 기능 기준 |
| [Phase 8 README](../phase8/README.md) | production 비선형 범위와 상태 |
| [Phase 8 target architecture](../phase8/TARGET_ARCHITECTURE.md) | element/state/equilibrium/result 계약 |
| [Phase 8 performance plan](../phase8/PERFORMANCE_AND_SCALABILITY.md) | Worker/WASM, S/M/L workload와 runtime budget |
| [ADR-005](../phase8/adr/ADR-005-INHOUSE-WASM-SPARSE.md) | in-house WASM sparse backend와 license 경계 |
| [ADR-007](../phase8/adr/ADR-007-DISPLACEMENT-ARC-LENGTH-BRANCH-POLICY.md) | backend target과 GPU fail-closed 정책 |
| [ADR-008](../phase8/adr/ADR-008-NEWMARK-DAMPING-SUBSTEP-POLICY.md) | NLTH backend, checkpoint와 GPU 제한 |
| [Phase 8 release gate](../verification/phase8/QUALIFICATION_RELEASE.md) | 현재 qualification blocker와 M11 evidence 해석 |

Phase 9는 이 기준을 약화하지 않는다. 계산 backend 변경은 Phase 7·8 기능 qualification을 자동 승격하지 않는다.

## 4. 기준 구현 계층

| 등급 | 허용 근거 |
| --- | --- |
| R1 analytic | closed-form 또는 hand calculation |
| R2 independent code | production import가 없는 별도 구현 |
| R3 CPU/WASM canonical | 기존 production f64 경로와 regression |
| R4 external solver/table | 독립 프로그램 또는 공개 수치표 |
| R5 project pilot | 실제 모델·hardware·사용자 승인 |

GPU qualification에는 최소 R1/R2 component 비교와 R3 end-to-end 비교가 필요하다. 해석기능의 최종 설계 승인은 기존 Phase 8 gate에 따라 R4/R5를 추가로 요구할 수 있다.

## 5. 정밀도 기준 원칙

- WGSL의 `AbstractFloat`를 runtime GPU `f64` 지원으로 해석하지 않는다.
- GPU가 표시하는 residual을 원본 CPU f64 equilibrium residual로 대체하지 않는다.
- vendor별 연산순서 차이는 bitwise가 아니라 정의된 channel tolerance로 평가한다.
- tolerance는 기존 analysis criteria, 독립 기준과 design status 보호를 함께 만족해야 한다.
- precision 변경은 성능 최적화가 아니라 수치알고리즘 변경으로 취급한다.

## 6. 성능 기준 원칙

- 실제 frame fixture와 end-to-end 시간을 사용한다.
- kernel, transfer, correction, recovery와 result render 시간을 분리한다.
- 같은 결과범위·수렴상태만 비교한다.
- 1 warm-up + 5 measured run, median/p95와 peak memory를 기록한다.
- 특정 hardware 결과를 전체 GPU 지원범위로 일반화하지 않는다.

## 7. License 정책

현재 기본 방향은 repository 내부 코드, Web platform API와 자체 Rust/WASM backend를 사용하는 것이다. 향후 CUDA/HIP/SYCL, vendor sparse library 또는 제3자 solver를 제안할 때는 다음이 선행되어야 한다.

- package와 transitive dependency 목록
- source/binary redistribution 조건
- commercial use와 notice 의무
- 지원 OS/GPU vendor와 fallback 영향
- 수치 qualification 및 제거 가능성
- 사용자 승인과 별도 ADR

승인 전에는 계획문서에 후보로만 기록하고 production dependency에 추가하지 않는다.

## 8. 변경관리

reference source, spec interpretation, tolerance 또는 hardware profile이 바뀌면 다음 문서를 함께 검토한다.

- [COMPUTE_PRECISION_POLICY.md](COMPUTE_PRECISION_POLICY.md)
- [PERFORMANCE_AND_QUALIFICATION.md](PERFORMANCE_AND_QUALIFICATION.md)
- [VERIFICATION_MATRIX.md](VERIFICATION_MATRIX.md)
- [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md)
- 관련 ADR

\n