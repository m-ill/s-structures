# Phase 17 Risk Register

```yaml
version: p17-risk-register-v1
review_frequency: before-and-after-each-case
closure_policy: evidence-required
```

| ID | 위험 | 심각도 | 통제와 완료 gate |
| --- | --- | --- | --- |
| `P17-R01` | manual v1.0.2와 case page v1.0.4를 혼합해 기준 판본이 불명확 | Critical | M0 case별 source precedence·diff·hash 승인, unresolved 0 |
| `P17-R02` | 결과를 본 뒤 tolerance, probe, mesh 또는 기준값을 바꿔 false PASS | Critical | pre-run approval hash, 변경 시 이전 run `INVALIDATED`, reviewer 분리 |
| `P17-R03` | STRIX 값과 독립 기준값을 같은 oracle로 취급 | High | R1~R5 lane 분리, primary/R4 status 별도 |
| `P17-R04` | monolithic runner의 reference·model·solver 결합이 유지됨 | High | case별 분해, product adapter만 허용, deep import 0 |
| `P17-R05` | element, axis, mass, damping, support 또는 silent default가 달라 비동등 모델 비교 | Critical | mandatory model-equivalence 표, mismatch 시 fail-closed blocker |
| `P17-R06` | 반올림된 PDF 숫자보다 더 엄격한 tolerance를 적용해 정밀도를 과장 | High | source precision·반올림 구간 기록, full-precision 없으면 주장 제한 |
| `P17-R07` | 부족한 좌표·질량·스펙트럼·지진파 입력을 추정해 재현 사례라고 주장 | Critical | 추정 금지, `BLOCKED_SOURCE`, 추가 원문 확보 후 새 lock |
| `P17-R08` | `P3S2-SS` 또는 다른 analog를 공식 21 PASS에 포함 | Critical | official/custom manifest와 denominator 분리, aggregate negative test |
| `P17-R09` | screenshot 숫자를 수치 정본으로 사용하거나 UI와 JSON이 불일치 | High | JSON 정본, capture metadata, UI/CLI/JSON/PDF parity 검사 |
| `P17-R10` | 정확도·모델 조건이 다른 상태에서 속도 우열 주장 | High | correctness-first, 동일 hardware/model/settings, 10회 median/p95/RSS |
| `P17-R11` | 같은 파일을 덮어써 실패·이전 결과와 provenance 소실 | High | run ID append-only, overwrite refusal, immutable archive |
| `P17-R12` | solver 변경 뒤 영향 사례 evidence를 그대로 사용 | Critical | source/build/model hash invalidation graph, 영향 사례 재실행 |
| `P17-R13` | 물리적 mechanism 또는 요소 결함을 stabilization으로 숨김 | Critical | spurious/physical mode 분리, energy ratio, negative control |
| `P17-R14` | 한 사례 실패가 suite 전체를 중단하거나 일부 미실행을 PASS 집계 | High | process isolation, timeout, terminal status 21/21, NOT_RUN 집계 분리 |
| `P17-R15` | STRIX/MIDAS 실제 raw export 없이 R4 완료 주장 | Critical | program/version/operator/native model/raw export hash 필수 |
| `P17-R16` | product가 verification reference를 import해 정답 누출 | Critical | production→verification 0, bundle scan, expected-value leakage test |
| `P17-R17` | verification이 private solver를 직접 호출해 UI/API와 다른 경로 검증 | High | stable public analysis service, deep import 0, UI/API/result hash parity |
| `P17-R18` | unsupported custom element를 이름만 비슷한 요소로 대체 | High | equivalence enum, `ANALOGOUS_ONLY`/`UNSUPPORTED`, reviewer 승인 |
| `P17-R19` | OS 이식성 또는 무설치 주장을 단일 Windows 실행으로 일반화 | Medium | 실제 Windows/Linux/macOS evidence가 있는 범위만 주장 |
| `P17-R20` | benchmark 수정과 공통 모듈 리팩토링을 한 번에 수행해 원인 추적 불가 | High | behavior-preserving extraction과 numerical change 별도 change set |

## 운영 규칙

- 각 사례 착수 전에 관련 위험을 `OPEN`, `MITIGATED`, `ACCEPTED`, `BLOCKED` 중 하나로 기록한다.
- Critical 위험을 `ACCEPTED`로 우회해 PASS를 만들 수 없다.
- 위험 종료에는 문서 설명이 아니라 test/evidence/reviewer hash가 필요하다.
- 새 위험은 다음 case 시작 전에 이 register에 추가하고 ID를 재사용하지 않는다.

