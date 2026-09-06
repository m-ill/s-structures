# ADR-001: Hybrid CPU/WASM/WebGPU Compute Architecture

```yaml
status: accepted-for-phase9-planning
date: 2026-07-15
owners:
  - analysis-platform
  - numerical-core
decision_scope: phase9
supersedes: none
related:
  - ../TARGET_ARCHITECTURE.md
  - ../COMPUTE_PRECISION_POLICY.md
  - ../../phase8/adr/ADR-005-INHOUSE-WASM-SPARSE.md
```

## Context

S-Structures의 탄성 및 비선형 해석은 현재 JavaScript, Worker, Phase 8 CPU/WASM 수치 코어에 걸쳐 실행된다. 모델 크기와 반복 해석 횟수가 증가하면 조립, 희소 선형대수, 반복 상태 평가가 병목이 되지만 모든 연산을 GPU로 이동하는 방식은 다음 문제를 만든다.

- WebGPU의 장치별 한계와 브라우저 지원 차이
- 구조해석 기준선에 필요한 `f64`와 WGSL 실행 타입 사이의 차이
- 작은 모델에서 전송 및 파이프라인 준비 비용이 계산 이득보다 커지는 문제
- 힌지 이벤트, 수렴 판단, 보고서 생성처럼 분기와 추적성이 중요한 CPU 작업
- GPU 실패를 숨긴 채 다른 알고리즘으로 전환할 경우 결과 재현성과 감사 가능성이 훼손되는 문제

Phase 8에서 구축한 CPU/WASM 경로는 폐기 대상이 아니라 정답 기준선이자 GPU 결과를 검증하는 참조 백엔드다.

## Decision

Phase 9의 프로덕션 계산 구조는 **CPU/WASM `f64` 기준선과 연산 단위로 라우팅되는 WebGPU 가속을 결합한 하이브리드 구조**로 한다.

1. 모든 해석 종류는 CPU/WASM 기준 경로로 실행 가능해야 한다.
2. WebGPU는 기능 전체가 아니라 조립, SpMV, 벡터 연산, 다중 RHS, 배치 단면 평가 등 검증된 연산 단위로 선택한다.
3. 실행 전 `AnalysisExecutionPlan`이 모델 규모, 장치 capability, 정밀도 정책, 예상 전송비용을 이용해 백엔드와 연산 배치를 확정한다.
4. 실행 중 임의의 백엔드 전환은 금지한다. 정책상 전환이 필요한 경우 실행을 종료하고 새로운 계획과 run ID로 재실행한다.
5. GPU 결과는 CPU `f64` 잔차, 보정 및 평형 감사 단계를 통과해야 최종 결과로 승격한다.
6. 작은 모델과 GPU 이득이 입증되지 않은 해석은 CPU/WASM을 사용한다.
7. 향후 native GPU 또는 원격 HPC 백엔드는 동일 계약을 구현하는 추가 backend provider로만 도입한다.

## Operation Routing Baseline

| Operation | Canonical backend | Optional accelerator | Final authority |
| --- | --- | --- | --- |
| 입력 검증, DOF/constraint 계획 | CPU | 없음 | CPU |
| 희소 패턴 생성 | CPU/WASM | 제한적 | CPU/WASM |
| 요소/힌지/fiber 배치 평가 | CPU/WASM | WebGPU | CPU 감사 |
| 전역 조립 및 벡터 연산 | CPU/WASM | WebGPU | CPU 잔차 |
| 희소 해법/반복 보정 | CPU/WASM `f64` | WebGPU mixed precision | CPU `f64` |
| 고유치 반복 연산 | CPU/WASM | WebGPU SpMV/vector | CPU 정규화·잔차 |
| 수렴 판정, 이벤트, adaptive control | CPU | GPU 상태 요약 | CPU |
| 복원, 설계, 보고서 | CPU | 선택적 batch reduction | CPU |

이 표는 초기 라우팅 기준이다. 실제 승격은 `PERFORMANCE_AND_QUALIFICATION.md`의 하드웨어별 검증을 통과해야 한다.

## Consequences

### Positive

- 기존 CPU/WASM 검증 자산을 유지하면서 병목만 단계적으로 가속할 수 있다.
- 특정 GPU나 브라우저에 종속되지 않고 동일 분석 계약을 유지한다.
- 장치 손실, OOM, shader 실패를 명시적으로 처리하고 결과 provenance를 보존한다.
- native/remote backend 추가 시 solver와 UI를 다시 분기하지 않아도 된다.

### Cost

- CPU와 GPU 구현의 수치 동등성 검증 비용이 발생한다.
- DomainBinary, SparsePattern, StateArena 등 공통 데이터 계약을 먼저 정리해야 한다.
- GPU resident state와 CPU 감사 사이의 동기화 정책이 필요하다.
- 작은 모델에서는 GPU가 선택되지 않을 수 있으며, UI가 그 이유를 설명해야 한다.

## Rejected Alternatives

| Alternative | Reason rejected |
| --- | --- |
| 모든 해석을 GPU로 강제 | `f64`, 장치 지원, 분기 작업, 작은 모델 비용과 fail-closed 요구를 동시에 만족하지 못함 |
| native GPU를 Phase 9 기본 경로로 채택 | 배포·서명·플랫폼·라이선스 범위가 커지고 현재 웹 제품 경로와 분리됨 |
| CPU 전용 유지 | 대규모 반복 조립과 배치 평가의 확장 목표를 충족하지 못함 |
| GPU 오류 시 조용히 CPU로 계속 | 사용자가 선택한 실행 정책과 evidence provenance를 위반함 |
| solver별 독립 GPU 구현 | 데이터 변환 중복, 정책 불일치, 유지보수 비용을 증가시킴 |

## Guardrails

- 외부 수치/GPU 라이브러리 도입은 별도 ADR과 사용자 승인이 필요하다.
- CPU 기준선을 제거하거나 완화할 수 없다.
- GPU 미지원이 해석 결과의 기능 축소로 이어져서는 안 된다.
- explicit GPU 요청은 사용할 수 없을 때 명확히 실패한다.
- auto 정책은 CPU를 선택할 수 있으나 선택 이유와 capability snapshot을 기록한다.
- 승인되지 않은 hardware profile은 `qualified`로 표시하지 않는다.

## Validation

이 결정은 다음 evidence로 검증한다.

- 동일 DomainBinary에 대한 CPU/WASM/WebGPU 입력 해시 일치
- GPU 연산별 CPU `f64` reference parity
- 최종 평형, 잔차, 고유치, 수렴 및 에너지 감사
- 장치 손실, OOM, capability 부족, shader 오류 fail-closed 테스트
- 대표 모델의 end-to-end 성능과 전송비용 측정
- backend 선택 및 보정 이력이 포함된 결과 manifest

## Revisit Triggers

- 표준 웹 런타임에서 production-grade `f64` GPU 지원이 보편화됨
- WebGPU 장치 제한이 목표 모델 규모를 지속적으로 충족하지 못함
- native backend가 배포·라이선스·검증 비용을 포함해 명확한 제품 이점을 입증함
- CPU/WASM 기준선과 GPU 결과의 일관된 교차 검증이 불가능함

\n