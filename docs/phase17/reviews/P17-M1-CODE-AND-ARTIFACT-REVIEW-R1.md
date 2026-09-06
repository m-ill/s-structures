# P17-M1 Code & Artifact Review R1

```yaml
reviewed_at: 2026-08-28
milestone: P17-M1
review_revision: 1
status: CONTRACT_READY_NO_BENCHMARK_RUNS
review_scope: phase17-active-framework-and-generated-scaffold
benchmark_runs_in_scope: 0
solver_runs_in_scope: 0
structural_models_in_scope: 0
case_pass_count: 0
release_allowed: false
final_design_transfer_allowed: false
```

## 1. 검토 결론

P17-M1의 사례 계약과 shared harness는 공식 21개 사례를 한 사례씩 검증하는 다음 단계에 사용할 수 있다. 21개 공식 폴더와 custom 1개 폴더, 사례별 19개 필수 파일, 419개 결정론적 scaffold와 16개 runtime schema가 구현됐다. 공식+custom 22개 wrapper는 별도 프로세스에서 contract만 검증했고 22/22가 계약을 만족했다.

이 결론은 framework readiness에만 적용한다. M1에서 benchmark, solver, 구조 모델, engineering result, Chrome 결과 캡처와 사례 보고서는 생성하지 않았다. 따라서 공식 사례 PASS는 `0/21`, release와 final design transfer는 모두 금지다.

## 2. 검토 범위와 정본

### 포함

- `verification/framework/phase17/`의 책임 모듈과 공개 surface
- `verification/specs/phase17/`의 M1 runtime schema 16종
- `verification/benchmarks/strix21/suite-manifest.json`
- `verification/benchmarks/strix21/cases/` 공식 21개 scaffold
- `verification/benchmarks/strix21/custom/P3S2-SS/` custom scaffold
- single-case/suite/scaffold runner와 architecture audit
- strict schema, isolation, append-only, adapter, capture/report negative test
- M0 R4 schema 부채의 M1 이관 처리

### 제외

- 21개 사례의 source 수치 전사와 독립 reference 승인
- 구조 모델링, solver setting과 제품 해석 실행
- STRIX 또는 MIDAS actual R4 재실행
- 수치·평형·에너지·수렴·모드·mutation qualification
- Chrome 제품 화면과 사례별 Markdown/PDF 보고서
- 성능 비교와 제품 release 승인

machine-readable 구현 근거는 `verification/evidence/validation/phase17/p17-m1-case-contract-shared-harness-r6.json`이고 최종 closure는 `verification/evidence/validation/phase17/p17-m1-validation-closure-r1.json`이다. R1은 closure 전 hardening draft다. R2~R4는 renderer·QA 계약 문제를 fail-closed로 드러냈고 R4/report R1은 14쪽 시각·byte QA까지 통과했다. R5/report R2는 QA scope를 정렬했지만 Windows에서 `npm.cmd`를 직접 spawn한 closure check가 `EINVAL`로 시작되지 않았다. R1~R5와 report R1~R2는 삭제·덮어쓰지 않고 보존한다. R6/report R3가 정본이며 각 `supersedes` hash chain이 변경 사유와 bytes를 결속한다. 이 revision 전이는 실행·수치·PASS counter를 바꾸지 않는다.

## 3. 요구사항 추적

| 요구사항 | 구현·검증 | R1 판정 |
| --- | --- | --- |
| `P17-FR-CASE-01` | 공식 21 + custom 1, 사례별 19개, schema·semantic validation | `SATISFIED_FOR_M1_SCAFFOLD` |
| `P17-FR-CASE-02` | 22개 single-case wrapper를 child process contract로 검사 | `SATISFIED_FOR_CONTRACT_ONLY` |
| `P17-FR-RUN-01` | P17 adapter가 `src/index.js` 공개 root만 import | `SATISFIED_IN_ACTIVE_P17_SCOPE` |
| `P17-FR-RUN-02` | product → verification import 0 | `SATISFIED_IN_ACTIVE_P17_SCOPE` |
| `P17-FR-RUN-03` | fallback·외부 runtime 관측 시 fail-closed | `SATISFIED_BY_POLICY_NEGATIVE_TEST` |
| `P17-FR-RUN-04` | deterministic order, process isolation, timeout·failure continuation | `SATISFIED_FOR_CONTRACT_FIXTURE` |
| `P17-FR-RUN-05` | builder/reference/adapter/evaluator/writer/runner/report 분리, cycle 0 | `SATISFIED_IN_ACTIVE_P17_SCOPE` |
| `P17-FR-EVID-01` | unique run ID, allowed root, atomic commit, overwrite 거부 | `SATISFIED_BY_RESULT_FREE_FIXTURE` |
| `P17-FR-EVID-02` | file inventory, SHA-256, self-hash와 chain 검증 계약 | `SATISFIED_FOR_FRAMEWORK` |
| `P17-FR-EVID-03` | NaN/Infinity, unknown/extra key와 binding mutation 거부 | `SATISFIED_FOR_M1_SCHEMAS` |
| `P17-FR-EVID-04` | raw result + locked RFC 6901 probe의 data-only identity extraction, source/extractor/probe hash와 replay | `SATISFIED_FOR_FRAMEWORK; OFFICIAL_RUN_0` |
| `P17-FR-EVID-05` | report → solver import 0, evidence hash/capture binding 검증 | `SATISFIED_FOR_RENDERER_CONTRACT` |
| `P17-FR-EVID-06` | capture index와 explicit UI blocker 계약 | `CONTRACT_ONLY; CAPTURE_COUNT_0` |
| `P17-NFR-05` | 의도적 failure/timeout 뒤 후속 사례 계속 | `SATISFIED_BY_NEGATIVE_TEST` |

`P17-FR-MAP-*`, `P17-FR-NUM-*`, UI/CLI/JSON/PDF 실제 값 parity, 3회 engineering-result 결정론과 R4 교차검증은 M1 완료 주장에 포함하지 않는다.

## 4. 모듈화 검토

### 4.1 책임과 의존 방향

```text
case wrapper
  -> manifest validation
  -> isolated suite runner

future case execution
  -> case model builder
  -> reference repository
  -> product adapter -> src/index.js
  -> data-only result extractor
  -> comparison evaluator
  -> append-only run store
  -> evidence/capture report
```

model builder는 reference 숫자를 읽지 않고, reference repository는 제품 solver를 호출하지 않는다. extractor는 accessor·변환·단위환산 없이 잠긴 JSON pointer의 유한수만 읽고, evaluator는 model을 만들지 않는다. evidence package auditor는 추출과 비교를 재생하지만 solver·builder를 호출하지 않으며, phase-level renderer는 검증된 evidence projection만 문서화한다. run store는 계산을 수행하지 않고 JSON 경계와 파일 무결성만 소유한다.

이 분리는 사례 결과가 좋게 나오도록 입력·허용오차·보고서가 서로를 역으로 바꾸는 통로를 줄인다. 다음 사례에서 numerical owner가 바뀌더라도 reference와 immutable evidence 책임은 독립 유지한다.

### 4.2 공개 제품 경계

P17 active runtime의 제품 import는 `productAdapter.mjs → src/index.js` 한 곳이다. private `src/engine/**` 또는 solver deep module import는 0이다. adapter는 product service version, CPU route, fallback과 external runtime 관측을 검사하고 기준값처럼 보이는 payload가 제품 호출로 유입되는 것을 거부한다.

이 검토는 adapter가 실제 SB1 모델을 성공적으로 해석했다는 증거가 아니다. 해당 증거는 P17-M2의 locked model과 실제 run record에서 생성해야 한다.

## 5. schema와 artifact 검토

M0에서 사용한 `verification/harnesses/json-schema-lite.mjs`는 sealed M0 artifact 재현을 위해 변경하지 않았다. M1은 정본 `verification/framework/phase17/jsonSchemaStrict.mjs`와 cross-file semantic validator를 사용한다. `verification/harnesses/json-schema-strict.mjs`는 기존 호출자를 위한 호환 wrapper다.

R1에서 확인한 방어 범위는 다음과 같다.

- schema definition의 unknown keyword fail-closed
- local `$ref`, `$defs`, `allOf`, `anyOf`, `oneOf`, `not`, `if/then/else`
- nested required와 extra property
- 날짜·수치·배열·문자열 제약과 유한수
- suite ordinal, 공식/custom 분모, folder/path와 manifest hash binding
- expected/reference/tolerance/probe의 M1 미동결 상태와 빈 결과 계약
- case evidence·capture index의 self-hash와 cross-record binding

negative mutation은 nested deletion, nested extra key, oneOf ambiguity, local ref, unknown keyword, date-time와 NaN을 포함한다. 저장된 scaffold는 generator 없이 독립 검증할 수 있고 재생성 check는 419/419 unchanged를 요구한다.

### M0 R4 carry-forward 판정

M0 R4의 `OPEN_SCHEMA_DEBT_CARRIED_TO_M1`은 M1 신규 정본에 대해서 `CLOSED_FOR_M1_AUTHORITATIVE_RECORDS`로 닫는다. M1은 strict validator와 semantic binding을 실제 completion gate로 사용한다.

이 판정은 R3의 넓은 문서 주장을 되살리지 않는다. M0 R3 schema와 artifact는 수정하지 않았고 R4가 기록한 `PARTIALLY_CLOSED_BY_GENERATOR_ASSERTIONS`는 역사 사실로 유지한다.

## 6. 실행 격리와 append-only 검토

### 6.1 격리

정상 canonical contract wrapper 22개는 공식 ordinal 순으로 별도 child process에서 종료했다. 일반 child exit code 0은 qualification이 아닌 `CHILD_SUCCEEDED_UNQUALIFIED`로 남고, canonical contract envelope를 완전히 검증한 경우만 `CONTRACT_VALIDATED`다. 별도 fixture는 다음 terminal sequence를 확인했다.

```text
CONTRACT_VALIDATED
FAILED
CONTRACT_VALIDATED
TIMED_OUT
CONTRACT_VALIDATED
```

실패와 timeout 뒤 후속 사례가 실행되므로 한 사례의 process state가 suite 전체 제어 흐름을 중단시키지 않는다. allowed entrypoint root 밖 경로와 예약 policy 환경변수 override는 `SPAWN_BLOCKED` 계열 reason code로 차단된다.

### 6.2 저장소

append-only store는 임시 result-free fixture로 검증했다. 다음 공격·오류 경로가 거부된다.

- null·빈·형식 오류·경로 탈출 run ID
- allowed root 밖 쓰기와 document path escape
- 기존 run overwrite
- NaN, Infinity와 비-JSON 객체
- commit 이후 content tamper
- 선언되지 않은 file·directory
- symlink 또는 junction
- external Ed25519 custody signature·payload·directory binding 불일치
- local fixture anchor의 terminal qualification 사용

검증기는 commit manifest에 선언된 파일만 허용하고 byte length와 SHA-256를 다시 계산한다. non-fixture run은 외부 Ed25519 anchor가 있어야 package audit 후보가 되며 local fixture anchor는 terminal evidence가 아니다. 다만 local filesystem 자체는 WORM이 아니고 caller가 넘긴 trust key도 아직 pinned registry가 아니므로, local writer·filesystem 관리자의 재작성 저항성은 M1이 증명하지 않는다.

## 7. evidence-only capture/report 검토

capture index는 파일 경로, 종류, 크기, SHA-256, PNG dimension, browser와 parity 상태를 명시한다. 파일 path escape, symlink, hash·size·dimension mismatch는 거부된다. `caseEvidenceHash`, `captureIndexHash`와 두 record의 case/run/model binding이 다르면 report snapshot을 만들 수 없다.

renderer는 immutable evidence projection만으로 Markdown/PDF 입력을 구성하고 solver import는 0이다. package auditor는 raw engineering result와 locked probe를 재생하고 comparison을 다시 계산해 저장 artifact와 canonical identity를 확인한다. M1에는 실제 UI가 없으므로 캡처 0개, 사례 보고서 0개가 올바른 결과다. 빈 이미지나 합성 결과 화면을 completion evidence로 만들지 않았다.

M1 terminal authorization은 `false` 상수와 `auditApprovedCasePackage`의 unconditional fail-closed로 이중 차단된다. 따라서 형식적으로 준비된 자료도 `QUALIFICATION_CANDIDATE`까지만 만들 수 있고 M1에서 terminal benchmark `PASS`로 승격할 경로는 없다.

## 8. architecture audit와 범위

| 항목 | P17 active scope | 전역·역사 상태 |
| --- | ---: | --- |
| product → verification import | 0 | P17 신규 역방향 의존성 없음 |
| verification → product deep import | 0 | legacy 133건 / 54개 파일 |
| verification → product public root import | 1 | 승인된 `src/index.js` 경계 |
| P17-specific reference leakage | 0 | generic production debt 2 findings |
| report → solver import | 0 | P17 renderer 경계 유지 |
| active P17 import cycle | 0 | P17 responsibility graph cycle 없음 |

generic production expected-value 부채는 다음 두 finding이다.

1. `src/examples/verification.js`: `expected` 값 11회
2. `src/index.js`: 해당 generic verification example의 public export

따라서 `deep import 0`, `reference leakage 0`은 P17 canonical runtime 범위의 진술이다. repository 전체가 깨끗하다는 진술로 확대하지 않는다.

## 9. Finding register

| ID | 등급 | 상태 | 내용 | release 영향 | 후속 |
| --- | --- | --- | --- | --- | --- |
| `M1-R1-F01` | High | OPEN | legacy verification deep import 133건/54개 파일 | release 차단 유지 | P17-M23 전 owner·제거/격리 gate 확정 |
| `M1-R1-F02` | High | OPEN | generic production expected-value 부채 2 findings | release 차단 유지 | example/reference owner 분리 및 public export 정책 결정 |
| `M1-R1-F03` | High | OPEN | STRIX raw record/archive와 published SHA 부재 | R4·release 주장 불가 | 원본 확보 또는 `BLOCKED_SOURCE` 유지 |
| `M1-R1-F04` | Critical before terminal | OPEN_FOR_M2 | official orchestrator/receipt와 pinned external custodian registry 미구현 | terminal PASS 차단 | P17-M2에서 trust registry와 single production workflow 구현 |
| `M1-R1-F05` | Medium | OPEN | M1은 실제 다른 OS에서 contract parity를 실행하지 않음 | cross-OS claim 금지 | 주장할 OS별 evidence 생성 |
| `M1-R1-F06` | Info | CLOSED_FOR_M1_ONLY | M0 R4 nested schema 부채 | M1 신규 정본은 엄격 검증 | M0 R3 역사 제한 유지 |
| `M1-R1-F07` | High before terminal | OPEN_FOR_M2 | reference bytes, physics/mutation, 독립 3회 run replay 미구현 | terminal PASS 차단 | source custody·세 run receipt·물리 gate 구현 |
| `M1-R1-F08` | High before terminal | OPEN_FOR_M2 | deterministic case PDF/화면 parity와 signed reviewer attestation 미구현 | terminal PASS·release 차단 | 재현 renderer/visual audit와 scoped 서명 구현 |

M1 active implementation 자체에서 새 Critical finding 또는 benchmark-specific reference leakage는 확인되지 않았다. 열린 High는 기록만으로 승인되지 않으며 `releaseAllowed=false`를 강제한다.

## 10. 코드 변경 시 invalidation 규칙

다음 파일·정책이 바뀌면 M1 evidence와 이 review를 stale 처리하고 새 revision으로 다시 닫는다.

- 16개 runtime schema 또는 strict/semantic validator
- 공식 case ID·ordinal·custom 분모·19-file contract
- product adapter의 public API 또는 fallback/external-runtime 정책
- isolated runner의 timeout·env·path·계속 실행 정책
- append-only store의 run ID, allowed root, atomic commit, inventory/hash 규칙
- evidence/capture hash binding 또는 report input projection
- architecture audit의 active/historical scope 정의

사례 model/reference/tolerance/probe를 채우는 일은 M1 scaffold를 덮어쓰는 작업이 아니다. 각 사례 milestone에서 승인 hash와 append-only evidence로 새 상태 전이를 기록해야 한다.

## 11. 다음 단계 권고

`P17-M2 / SB1`은 다음 lock과 terminal gate가 모두 존재하기 전 terminal 판정을 열지 않는다.

1. source lock과 원문 위치·판본·checksum 확인
2. closed-form primary reference와 full-precision 값
3. probe, sign convention, 단위와 tolerance 사전 승인
4. canonical/native model과 model equivalence 승인
5. product service/build/solver setting hash
6. reviewer 역할과 signoff 경로

그리고 official execution receipt, pinned custodian registry, reference byte audit, extraction/comparison replay, physics/mutation replay, 외부 custody 3회 독립 run, deterministic PDF·화면 parity, scoped reviewer attestation을 구현·검증한다. 이 8개 gate를 통과하기 전 M1의 terminal 차단 상수를 해제하지 않는다.

조건을 만족한 뒤에도 첫 실행의 성공 여부를 예상하지 않는다. 결과는 새 run ID의 immutable evidence에서 `PASS`, `FAIL` 또는 원인코드가 있는 `BLOCKED_*`로만 판정한다.

## 12. 최종 판정

P17-M1은 `CONTRACT_READY_NO_BENCHMARK_RUNS`로 닫는다. 21+1 사례 격리 구조, strict schema, public adapter, data-only extractor, deterministic evaluator, external-custody-aware append-only store와 evidence-only report 계약은 준비됐다. 그러나 구조해석 검증은 시작하지 않았고 terminal authorization도 명시적으로 꺼져 있으며 공식 PASS는 0개다. 열린 M2 trust/replay/reviewer/PDF gate와 source·legacy architecture 부채 때문에 release와 final design transfer는 계속 금지한다.
