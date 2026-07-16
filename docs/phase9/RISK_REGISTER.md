# Phase 9 Risk Register

```yaml
version: p9-risk-register-v1
status: qualification-active
review_cycle: every-milestone
```

## 1. 평가 규칙

- 영향: Critical / High / Medium / Low
- 가능성: High / Medium / Low
- owner와 검증 gate 없는 위험은 수용할 수 없다.
- Critical 위험이 open이면 관련 production route를 활성화하지 않는다.
- 위험 완화는 문서가 아니라 자동시험 또는 evidence로 확인한다.

## 2. 위험 목록

| ID | 영향 | 가능성 | 위험 | 완화 | Gate |
| --- | --- | --- | --- | --- | --- |
| P9-RSK-01 | Critical | High | WebGPU f32 오차가 설계상태를 변경 | CPU f64 residual/correction, status parity | GPU-NUM/ELA/NL |
| P9-RSK-02 | Critical | Medium | ill-conditioned matrix에서 mixed precision 오수렴 | condition preflight, correction failure 차단 | GPU-SPD-06 |
| P9-RSK-03 | Critical | Medium | GPU reduction 순서가 hinge/event를 변경 | fixed reduction, normalized event parity | GPU-DET-01~04 |
| P9-RSK-04 | Critical | Medium | rejected trial이 committed GPU state를 오염 | separate arenas, rollback byte parity | GPU-NL-04 |
| P9-RSK-05 | Critical | Medium | silent CPU/GPU fallback으로 provenance 손실 | immutable execution plan, new run on reroute | GPU-PLT-05 |
| P9-RSK-06 | High | High | GPU보다 기존 조립·factor 중복이 더 큰 병목 | P9-M0 profiling, CPU-first M1~M3 | PERF baseline |
| P9-RSK-07 | High | High | GPU 전용 코드복제로 유지보수 비용 증가 | operation backend contract, refactor gate | REF-01~12 |
| P9-RSK-08 | High | Medium | device loss/OOM이 model 또는 result를 손상 | canonical checkpoint, resource ledger | GPU-FAIL-01~06 |
| P9-RSK-09 | High | Medium | host-device 전송이 가속효과 상쇄 | resident session, transfer telemetry | PERF-GPU-04 |
| P9-RSK-10 | High | Medium | consumer GPU의 낮은 FP64/limit 차이 | WebGPU mixed path, profile별 routing | hardware matrix |
| P9-RSK-11 | High | Medium | async API 전환으로 기존 UI/test 회귀 | compatibility facade, caller inventory | API parity |
| P9-RSK-12 | High | Medium | modal/buckling 알고리즘 변경이 모드 순서를 변경 | sign/order canonicalization, MAC | GPU-EIG |
| P9-RSK-13 | High | Medium | WASM threads가 COOP/COEP 배포와 충돌 | capability preflight, single-thread baseline | CPU-THR |
| P9-RSK-14 | High | Low | 외부 library의 license·배포 문제 | in-house 우선, license ADR와 승인 | LIC-01 |
| P9-RSK-15 | Medium | High | 작은 모델에서 GPU startup이 더 느림 | workload threshold, auto CPU 선택 | PERF-S |
| P9-RSK-16 | Medium | Medium | 대형 GPU buffer가 adapter limit 초과 | segmented buffers, conservative preflight | GPU-MEM |
| P9-RSK-17 | Medium | Medium | telemetry/hash가 hot loop 성능을 다시 악화 | bounded stage-boundary trace | PERF-TEL |
| P9-RSK-18 | Medium | Medium | legacy 제거로 old project/result reader 손상 | migration fixtures와 deprecation gate | REF-LEG |
| P9-RSK-19 | Medium | Medium | hardware별 결과차로 support 범위 불명확 | approved profile registry | GPU-DET-04 |
| P9-RSK-20 | Medium | Medium | 대형 생성 evidence가 repository를 팽창 | retention, summary/raw 분리 | REF-GEN |
| P9-RSK-21 | Medium | Low | browser suspend가 timing/checkpoint를 왜곡 | resume audit와 wall-time separation | GPU-FAIL-05 |
| P9-RSK-22 | Low | High | 사용자가 GPU 사용률을 정확도·품질로 오해 | operation route와 qualification UI | UI-QUAL |

## 3. Critical stop conditions

다음 조건이 발생하면 해당 GPU route를 즉시 비활성화한다.

- CPU f64 residual 또는 equilibrium audit 실패
- design status/governing identity 불일치
- committed state 또는 checkpoint hash 불일치
- device loss 후 partial result가 current로 노출
- explicit GPU 요청의 silent CPU-only 실행
- unsupported matrix class를 SPD로 강제
- raw comparison 없이 parity PASS 생성

## 4. Architecture decision trigger

다음 변경은 새 ADR을 요구한다.

- WebGPU 외 native GPU 또는 remote backend 도입
- 외부 sparse/eigen solver library 도입
- production `f32`-only 결과 허용
- GPU pivoted general/indefinite solver 도입
- deterministic requirement 변경
- canonical result schema 또는 checkpoint layout 변경
- auto fallback 정책 변경

## 5. 위험 review 산출물

마일스톤마다 다음을 기록한다.

- 새로 발견한 위험
- severity/likelihood 변화
- 실행한 failure injection
- residual/parity/performance 결과
- 남은 blocker와 owner
- 다음 마일스톤 진입 허용 여부

## 6. 최종 수용기준

G5 승격 시 Critical open risk는 0이어야 한다. High risk는 자동 gate와 운영 대응이 모두 있어야 하며 단순히 "known limitation"으로 남길 수 없다. 외부 검증이 필요한 항목은 release manifest에서 BLOCKED로 유지한다.

\n
