# Phase 17 Production Requirements

```yaml
version: p17-production-verification-requirements-v1
status: proposed
requirement_owner: phase17
claim_policy: fail-closed
```

## 1. 기능 요구사항

### Governance와 catalog

| ID | 요구사항 | 완료 gate |
| --- | --- | --- |
| `P17-FR-GOV-01` | 공식 suite는 정확히 21개 ID를 가진다. | 누락·중복 0, custom 분모 혼입 0 |
| `P17-FR-GOV-02` | 구현자, reference 추출자, model reviewer, numerical reviewer, release reviewer를 분리한다. | 역할과 승인 hash 100% |
| `P17-FR-GOV-03` | 기존 Phase 15 결과는 immutable baseline으로 보존한다. | 이전 artifact hash 보존, 신규 PASS 승계 0 |
| `P17-FR-GOV-04` | 한 시점에 공식 case 하나만 활성화한다. | WIP=1, 다음 사례 착수 gate 존재 |

### Source와 reference

| ID | 요구사항 | 완료 gate |
| --- | --- | --- |
| `P17-FR-REF-01` | 21개 source artifact에 판본·페이지·checksum·license·추출 이력을 기록한다. | source manifest 21/21 valid |
| `P17-FR-REF-02` | manual·개별 PDF v1.0.2와 HTML·catalog v1.0.4의 우선순위를 사례별 동결한다. | unresolved source-version conflict 0 |
| `P17-FR-REF-03` | 독립 기준값과 STRIX·MIDAS 결과를 별도 reference lane으로 둔다. | oracle provenance 혼합 0 |
| `P17-FR-REF-04` | reference, probe와 tolerance를 실행 전 동결한다. | 모든 run이 approval hash에 결속 |
| `P17-FR-REF-05` | expected·tolerance·oracle은 production source와 browser bundle에 포함하지 않는다. | production leakage 0 |

### 사례와 모델

| ID | 요구사항 | 완료 gate |
| --- | --- | --- |
| `P17-FR-CASE-01` | 공식 21개가 각각 독립 folder와 manifest를 가진다. | case folder 21/21, schema valid |
| `P17-FR-CASE-02` | 각 case는 독립 build·run·compare·report 명령을 제공한다. | single-case smoke 21/21 |
| `P17-FR-MAP-01` | geometry부터 output probe까지 model equivalence 표를 승인한다. | mandatory mapping 누락 0 |
| `P17-FR-MAP-02` | silent default를 모두 명시한다. | unresolved default 0 |
| `P17-FR-MAP-03` | 모델 hash와 mapping hash를 run evidence에 결속한다. | hash mismatch 0 |
| `P17-FR-MAP-04` | 동등하지 않은 사례를 analogous 또는 unsupported로 표시한다. | false identical claim 0 |

### 실행 경계

| ID | 요구사항 | 완료 gate |
| --- | --- | --- |
| `P17-FR-RUN-01` | verification은 승인된 stable product analysis service만 호출한다. | verification→product deep import 0 |
| `P17-FR-RUN-02` | production은 verification을 import하지 않는다. | production→verification import 0 |
| `P17-FR-RUN-03` | S-Structures run에 외부 solver runtime·network fallback을 사용하지 않는다. | external runtime use 0, 명시적 audit |
| `P17-FR-RUN-04` | batch는 deterministic order, process isolation, timeout과 case failure isolation을 갖는다. | 한 사례 실패 시 나머지 실행 가능 |
| `P17-FR-RUN-05` | 모델 builder, reference, adapter, evaluator, evidence writer, renderer를 분리한다. | cyclic/hidden dependency 0 |

### 수치·물리 판정

| ID | 요구사항 | 완료 gate |
| --- | --- | --- |
| `P17-FR-NUM-01` | signed metric을 기본으로 하고 near-zero는 절대오차를 쓴다. | 부호 은폐·0 나눗셈 0 |
| `P17-FR-NUM-02` | 사례별 mandatory metric 전부를 독립 판정한다. | 평균·최대치로 하위 실패 은폐 0 |
| `P17-FR-NUM-03` | 평형·에너지·수렴·모드 residual 등 가족별 물리 gate를 적용한다. | mandatory physics gate 100% 기록 |
| `P17-FR-NUM-04` | dense/sparse, 단위·회전·순서 permutation과 scaling metamorphic test를 적용한다. | 적용 가능한 mutation survival 0 |
| `P17-FR-NUM-05` | 사례별 mutation catalog를 두고 kill rate 100%를 요구한다. | mandatory mutation kill 100% |

### Evidence와 보고서

| ID | 요구사항 | 완료 gate |
| --- | --- | --- |
| `P17-FR-EVID-01` | run은 고유 ID를 갖고 append-only folder에 기록한다. | overwrite 0, null runId 0 |
| `P17-FR-EVID-02` | source부터 report까지 hash chain을 기록한다. | broken/missing chain 0 |
| `P17-FR-EVID-03` | JSON에는 NaN, Infinity, duplicate ID 또는 근거 없는 null 결과가 없다. | schema violation 0 |
| `P17-FR-EVID-04` | UI, CLI, JSON, Markdown과 PDF의 값·단위·축·부호·status·hash가 일치한다. | parity 100% |
| `P17-FR-EVID-05` | 보고서는 immutable evidence만 읽고 solver를 재실행하지 않는다. | report→solver dependency 0 |
| `P17-FR-EVID-06` | Chrome model/result capture를 사례 보고서에 포함한다. | 최소 4종 capture 또는 명시적 UI blocker |

### 교차검증과 성능

| ID | 요구사항 | 완료 gate |
| --- | --- | --- |
| `P17-FR-CMP-01` | STRIX·MIDAS R4에는 program version, operator, native model, raw export와 hash가 있다. | R4 주장에 필수 artifact 100% |
| `P17-FR-CMP-02` | R4 일치가 독립 기준 실패를 덮지 않는다. | independent/R4 status 분리 |
| `P17-FR-CMP-03` | 정확도 통과 후 동일 조건에서만 성능을 비교한다. | unfair performance claim 0 |

## 2. 비기능 요구사항

| ID | 요구사항 | 완료 gate |
| --- | --- | --- |
| `P17-NFR-01` | 동일 환경 3회 engineering result hash가 동일하다. | 21개 대상 deterministic hash parity |
| `P17-NFR-02` | release candidate는 동일 환경 10회 fail/skip/timeout/flake/nondeterminism 0이다. | run manifest로 확인 |
| `P17-NFR-03` | clean checkout·lockfile·runtime 고정 환경에서 독립 실행자가 재현한다. | clean evidence 1회 이상 |
| `P17-NFR-04` | Windows 외 OS 호환 주장은 실제 OS parity run이 있을 때만 한다. | 주장한 OS마다 evidence 존재 |
| `P17-NFR-05` | single case failure가 suite runner와 다른 case evidence를 손상시키지 않는다. | failure-isolation negative test PASS |
| `P17-NFR-06` | 기존 제품 전체 회귀와 Phase 16 layout/taxonomy gate를 유지한다. | mandatory fail/skip 0 |
| `P17-NFR-07` | 사례 실행과 보고서 생성은 repository 어느 위치에서도 canonical path API로 동작한다. | cwd dependence 0 |

## 3. 사례 PASS gate

사례는 다음 조건이 모두 참일 때만 `PASS`다.

1. source·reference·probe·tolerance가 실행 전 승인됐다.
2. model equivalence의 mandatory 항목이 `IDENTICAL_SPECIFICATION` 또는 승인된 `ENGINEERING_EQUIVALENT`다.
3. 승인된 제품 서비스로 실제 실행됐다.
4. 모든 primary metric이 사전 허용기준을 만족한다.
5. 사례별 평형·에너지·수렴·모드·step-quality gate가 통과한다.
6. 적용 가능한 metamorphic 및 mutation test가 통과한다.
7. 3회 결정론과 evidence schema/hash가 통과한다.
8. 화면·JSON·보고서 parity가 통과한다.
9. 필수 reviewer가 승인했다.

숫자 metric만 통과하면 `NUMERIC_PASS`일 수 있으나 사례 `PASS`는 아니다.

## 4. Suite 완료와 release gate

Suite 작업 완료는 21개가 모두 PASS라는 뜻이 아니다.

```text
suiteWorkComplete = 21/21 folders have terminal evidence
suiteQualified = 21/21 independentlyQualified
crossSolverComplete = 21/21 required R4 comparisons complete
releaseAllowed = suiteQualified && all release gates && reviewer approval
```

`BLOCKED`, `FAIL`, `CROSS_CHECK_ONLY`, `NOT_RUN`과 `CUSTOM`은 공식 PASS 수에 포함하지 않는다. Critical/High finding 또는 mandatory fail/skip/timeout/flake가 하나라도 있으면 `releaseAllowed=false`다.

## 5. 제안 수치 품질 기준

다음 값은 M0/M1 reviewer가 사례별 scale과 source precision을 검토해 확정할 기본 후보다.

| 항목 | 기본 후보 |
| --- | ---: |
| normalized force/moment equilibrium residual | `<= 1e-8` |
| normalized energy/work residual | `<= 1e-8` |
| assembled matrix symmetry residual | `<= 1e-12` |
| generalized eigen residual | `<= 1e-8` |
| mass orthogonality off-diagonal | `<= 1e-8` |
| dense/sparse internal mode MAC | `>= 0.999999` |
| independent reference mode MAC | `>= 0.99` |

source가 더 낮은 정밀도만 제공하거나 iterative/nonlinear 특성상 다른 floor가 필요하면 결과 실행 전에 근거와 함께 별도 승인한다.
