# Phase 15 Modularization Plan

```yaml
version: p15-modularization-plan-v1
status: proposed
created_at: 2026-08-27
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

## 1. 목적

Phase 15의 모듈화는 파일을 작게 나누는 작업이 아니라 **수치 책임과 검증 책임을 한 곳에만 두어 같은 오류가 다른 runner·solver 경로에서 반복되지 않게 하는 작업**이다.

현재 주요 중복·혼합은 다음과 같다.

- benchmark runner가 production assembly를 사용하지 않고 dense K 조립을 복제한다.
- `linear3dAssembly.js` 안의 private sparse accumulator를 membrane·plate가 재사용할 수 없다.
- plate boundary 생성, dense assembly, solve, recovery, coefficient 계산이 한 workflow에 묶여 있다.
- Winkler stiffness/reaction과 member station equilibrium의 owner가 갈라져 있다.
- dense와 sparse unsupported-rotation 판정이 서로 다른 규칙을 사용한다.
- benchmark model, reference, tolerance, metric, PASS 판정과 artifact serialization이 한 파일에 섞여 있다.

## 2. 원칙

1. 먼저 characterization test를 만들고 behavior-preserving extraction을 수행한다.
2. 추출 PR과 수치 수정 PR을 분리한다.
3. 신규 공통 module은 두 개 이상의 실제 consumer가 있을 때만 만든다.
4. public API는 additive wrapper와 migration note 없이 제거하지 않는다.
5. generic helper에 공학 의미를 숨기지 않는다. boundary·axis·sign·result channel은 typed contract로 남긴다.
6. verification 편의를 위해 production API에 expected value나 benchmark ID를 추가하지 않는다.
7. module 이동 후 import cycle, bundle boundary, deterministic hash와 성능을 다시 측정한다.

## 3. 추출 순서

### Step A — Verification decomposition, P15-M1

`strix21FirstBatch.js`를 다음 책임으로 나눈다.

| Before | Target owner | 이동 내용 |
| --- | --- | --- |
| top-level artifact | `phase15/evidenceArtifact` | canonical calculation/result/run hash |
| inline references | `tests/references/phase15/strix21/*.json` | value, source, tolerance, probe, sign |
| `metric()` | `phase15/qualificationGates` | signed/reference/absolute metric policy |
| case builders | `benchmarks/strix21/cases/*` | expected를 모르는 canonical input |
| summary/status | `phase15/releaseManifest` | mandatory gate 기반 집계 |
| report prose | report renderer | evidence field만 표현 |

기존 `runStrix21FirstBatch()` export는 새 runner를 호출하는 façade로 남겨 downstream 명령을 보존한다.

### Step B — Common sparse assembly and solve, P15-M2

`linear3dAssembly.js`의 private accumulator를 `src/compute/sparse/`로 옮긴다. plate와 membrane workflow가 같은 add/finalize 계약을 사용하도록 전환한다.

그다음 `factorSession.js`의 `rowCount >= 512 → IC(0)-CG` 결정을 `spdSolvePolicy`로 이동한다. 다음을 별도 함수로 둔다.

- symmetric diagonal equilibration
- preconditioner build와 breakdown classification
- true residual recomputation
- fallback eligibility와 selection
- audit tolerance alignment

IC 실패를 무조건 direct로 숨기지 않는다. 실패 reason과 fallback 실행·성공을 결과에 남기고, memory budget을 넘으면 명시적으로 BLOCKED한다.

### Step C — Shell system workflows, P15-M3~M4

- `shellDofProjection`: full shell matrix에서 active DOF block을 추출하고 coordinate/formulation metadata를 검증
- `membraneWorkflow`: mesh/load/constraints → sparse assembly → solve → stress recovery의 production service 제공
- `plateBoundary`: hard/soft/clamped 해석 의미와 migration 소유
- `plateWorkflow`: boundary/assembler/solver를 조합하고 coefficient·result provenance만 소유

SB2·SB3 runner가 요소 강성조립을 직접 수행하지 못하게 한다. SB5·SB6 runner도 plate workflow 결과만 소비한다.

### Step D — Foundation recovery, P15-M5

`foundationRecovery.js`를 새 canonical owner로 두고 다음을 통합한다.

- `Kf·d` end action
- distributed reaction integration
- constitutive vs equilibrium section force
- station endpoint closure
- linear/P-Delta common result

`linear3dRecovery.js`와 `secondOrder.js`는 이 module을 호출하고 각자 foundation 부호식을 복제하지 않는다.

### Step E — Stabilization classifier and qualification, P15-M6

`unsupportedRotationFloor.js`의 dense classifier와 `linear3dAssembly.js` sparse 변형을 공통 classifier로 통합한다. classifier는 물리 영공간 판정을 소유하고 matrix 수정은 caller가 수행한다.

`shellStabilization.js`는 실제 solve callback과 immutable solve artifact만 소비한다. 기존 prescribed-vector 계산은 `internal-invariant` unit fixture로 이동하고 qualification status를 만들지 않는다.

### Step F — Cross-cutting cleanup, P15-M8

- `linear3dAssembly`의 중복 member/foundation build 경로를 공통 builder로 통합
- `shellStabilization`의 MAC 계산을 common eigen owner로 이동
- foundation property 정규화·registry 검증은 core schema owner로 통합
- legacy wrapper consumer inventory와 deprecation warning 검증
- old dense benchmark helper와 중복 sparse accumulator 제거
- public export/index 정리
- dependency/cycle/bundle audit
- dead code와 stale Phase 14 benchmark status assertion 제거
- report·CLI·Agent consumer parity 확인

Step F 전에는 호환 wrapper를 제거하지 않는다.

## 4. PR 분할

| PR | 유형 | 허용 변경 | 금지 |
| --- | --- | --- | --- |
| P15-PR-00 | baseline/docs | inventory, manifest schema, red tests | production numeric behavior |
| P15-PR-01 | extraction | evidence/reference/gate 분리 | tolerance 변경·solver 수정 |
| P15-PR-02 | extraction | sparse assembler 공통화 | solver algorithm 변경 |
| P15-PR-03 | numeric infra | scaling/preconditioner/fallback | benchmark 기준에 맞춘 특례 |
| P15-PR-04 | membrane | global projection + workflow + SB2/3 | QM6 계수 변경 |
| P15-PR-05 | plate contract | hard/soft boundary + migration | MITC4 계수 변경 |
| P15-PR-06 | plate solve | sparse plate + SB5 convergence | tolerance 완화 |
| P15-PR-07 | recovery | foundation recovery v2 + P-Delta | Winkler K 보정 |
| P15-PR-08 | stabilization | common classifier + real sweep | 합성값을 qualification으로 재사용 |
| P15-PR-09 | pass hardening | 기존 6건 independent gates | 상태 개수 snapshot |
| P15-PR-10 | cleanup/review | wrapper 제거, dependency cleanup | 새 기능 |
| P15-PR-11 | release | clean rerun, manifest, reports | 코드 수정 |

한 PR에서 reference/tolerance와 production numeric code를 동시에 바꾸지 않는다.

## 5. Compatibility와 migration

- `simply-supported` legacy 값은 기존 soft 의미를 보존하고 새 저장에서는 versioned explicit enum을 사용한다.
- foundation result의 기존 `end`와 station fields는 v2 fields를 추가한 뒤 consumer migration 기간 동안 유지한다.
- factor session의 public `solve()` signature는 유지하고 diagnostics를 additive 확장한다.
- benchmark 명령 `npm run benchmark:strix21:first`는 유지하되 새 artifact version을 출력한다.
- 구 artifact는 immutable archive로 남기고 새 report가 자동 덮어쓰지 않는다.
- 새 route가 비활성화돼도 새 입력을 저장에서 삭제하지 않으며 실행은 reason code로 차단한다.

## 6. 모듈 리뷰 기준

- 한 계산 owner에 동등한 공식 구현이 둘 이상 존재하지 않는다.
- production import graph에 `tests/references`, benchmark expected literal 또는 R4 result가 없다.
- 내부 production module의 root `src/index.js` 역참조가 없다.
- case runner는 element matrix의 coordinate system을 추정하지 않는다.
- solver diagnostics와 audit tolerance가 한 canonical settings snapshot에 결속된다.
- report가 solver 내부 객체나 mutable session을 참조하지 않는다.
- module public API와 reason code가 문서·test에 매핑된다.
- extraction 전후 unchanged fixture full-precision 결과가 승인 tolerance 안에서 같다.

## 7. Rollback

각 v2 route는 기존 route와 shadow 비교 후 전환한다.

```text
membrane-global-assembly-v2
sparse-linear-system-v2
plate-support-contract-v2
foundation-recovery-v2
stabilization-qualification-v2
```

rollback trigger는 다음과 같다.

- feature-off 또는 legacy project 수치회귀
- dense/sparse parity 실패
- true residual·평형·에너지 gate 실패
- import cycle 또는 UI numeric-core 직접 import 발생
- M0 성능 budget 1.25배 초과
- evidence hash 비결정성

rollback은 신규 route만 비활성화한다. 신규 evidence를 구 route의 PASS로 재분류하거나 reference/tolerance를 완화하지 않는다.
