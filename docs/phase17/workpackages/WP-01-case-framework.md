# WP-01 — P17-M1 Case Contract & Shared Harness

```yaml
workpackage: WP-01
milestone: P17-M1
completed_at: 2026-08-28
status: CONTRACT_READY_NO_BENCHMARK_RUNS
official_case_count: 21
custom_case_count: 1
required_files_per_case: 19
deterministic_scaffold_files: 419
runtime_manifest_schemas: 16
benchmark_execution_count: 0
solver_execution_count: 0
official_pass_count: 0
release_allowed: false
final_design_transfer_allowed: false
```

## 1. 목적과 주장 경계

WP-01은 공식 STRIX 21개 사례와 별도 custom 사례 `P3S2-SS`를 같은 검증 계약으로 관리할 수 있는 기반을 구현한다. 이 마일스톤의 산출물은 사례 폴더, 엄격한 manifest schema, 공개 제품 경계 adapter, 프로세스 격리 runner, append-only evidence 저장소와 evidence-only 보고서 계약이다.

`CONTRACT_READY_NO_BENCHMARK_RUNS`는 검증 실행 환경이 다음 사례 개발에 사용할 수 있는 상태라는 뜻이다. 구조 모델을 완성했거나 해석 결과가 기준값과 일치했다는 뜻이 아니다. WP-01에서는 benchmark 값, 수치 결과, 화면 캡처와 사례 보고서를 만들지 않았고 공식 사례 `PASS`는 0개다.

## 2. 구현 범위

### 2.1 사례 scaffold

- 공식 사례: manual 순서의 21개를 `verification/benchmarks/strix21/cases/<CASE_ID>/`에 생성
- custom 사례: `P3S2-SS`를 `verification/benchmarks/strix21/custom/P3S2-SS/`에 분리
- 사례별 필수 파일: 19개
- suite manifest 포함 결정론적 scaffold: 419개 파일
- 상태 초기값: 모든 사례 `NOT_STARTED`
- 실행 카운터: benchmark, solver, engineering result 모두 0

각 사례의 19개 파일은 source, canonical/native model, model equivalence, reference, expected values, tolerance, probe, runner, test, append-only run 위치, figures, report와 review 경계를 미리 고정한다. 값이 잠기지 않은 필드는 빈 숫자나 임시 기준값으로 채우지 않고 `NOT_LOCKED`, `NOT_STARTED` 또는 명시적 reason code로 닫는다.

### 2.2 엄격한 schema와 저장 artifact 검증

M1 runtime manifest schema 16종은 suite, case, source, canonical/native model, model equivalence, reference, expected values, tolerance, probe, run record, comparison, case evidence, capture index, review signoff와 report manifest를 다룬다.

정본 validator인 `verification/framework/phase17/jsonSchemaStrict.mjs`는 M1 schema를 다음 정책으로 검증한다. `verification/harnesses/json-schema-strict.mjs`는 기존 호출자를 위한 얇은 호환 wrapper일 뿐이다.

- local `$ref`와 `$defs`, 조합·조건 schema 지원
- nested required key와 `additionalProperties` 검증
- enum, format, 수치 범위와 유한수 검증
- 지원하지 않는 schema keyword를 허용하지 않는 fail-closed 처리
- 생성기를 다시 실행하지 않고 저장된 artifact 자체를 독립 검증

nested required-key 삭제, extra-key, enum, self-hash, NaN/Infinity, duplicate ID, cross-field binding과 unknown-keyword 변형을 포함한 negative test가 통과했다.

### 2.3 책임 분리

| 책임 | 정본 모듈 | 역할 |
| --- | --- | --- |
| 사례 scaffold | `verification/framework/phase17/scaffoldBuilder.mjs` | registry에서 결정론적 폴더·manifest 생성 |
| manifest 검증 | `verification/framework/phase17/manifestValidation.mjs` | schema와 cross-file semantic binding 검증 |
| model build | `verification/framework/phase17/caseModelBuilder.mjs` | canonical/native model과 equivalence lock 확인 |
| reference | `verification/framework/phase17/referenceRepository.mjs` | reference/probe/tolerance lock 확인 |
| 제품 실행 경계 | `verification/framework/phase17/productAdapter.mjs` | `src/index.js` 공개 제품 API만 호출 |
| 결과 추출 | `verification/framework/phase17/resultExtractor.mjs` | raw engineering-result JSON에서 잠긴 RFC 6901 probe를 변환·단위환산 없이 재생 가능한 값으로 추출 |
| 비교 판정 | `verification/framework/phase17/comparisonEvaluator.mjs` | self-hashed 추출 artifact와 잠긴 reference·tolerance로 비교 |
| 실행 격리 | `verification/framework/phase17/isolatedSuiteRunner.mjs` | 사례별 child process, timeout과 계속 실행 |
| evidence 저장 | `verification/framework/phase17/appendOnlyRunStore.mjs` | 경로 제한, 원자적 commit, 무결성 manifest |
| capture·report | `verification/framework/phase17/evidenceReport.mjs` | capture index 검증과 evidence-only 렌더링 |

`verification/framework/phase17/index.mjs`가 framework 공개 surface를 제공하고 `verification/index.js`가 verification-level 공개 진입점을 제공한다. 제품 호출은 `src/index.js` 한 곳으로 제한하며 private solver module을 직접 import하지 않는다.

## 3. 실행과 안전 계약

### 3.1 단일 사례와 suite 계약 smoke

`run-p17-case.mjs`와 각 사례 wrapper는 `--operation=contract`에서 폴더·manifest 계약만 확인한다. `build`, `run`, `compare`, `report`는 M1에서 명시적 reason code와 함께 fail-closed된다.

격리 suite smoke는 공식 21개와 custom 1개, 총 22개 canonical wrapper를 각각 별도 Node child process에서 실행해 `22/22 CONTRACT_VALIDATED`를 확인했다. 일반 child process의 exit code 0은 `CHILD_SUCCEEDED_UNQUALIFIED`일 뿐이고, canonical suite의 엄격한 JSON envelope·case binding·contract operation을 모두 확인한 경우에만 `CONTRACT_VALIDATED`로 승격한다. 어느 상태도 구조해석 실행이나 benchmark `PASS`가 아니다.

### 3.2 격리 방어

- suite manifest ordinal에 따른 결정론적 순서
- 사례별 별도 child process와 제한된 working directory
- timeout 발생 시 해당 사례를 `TIMED_OUT`으로 닫고 다음 사례 계속
- child failure와 spawn block 이후에도 남은 사례 계속
- 허용 root 밖 entrypoint·cwd 차단
- 예약 환경변수 override와 부적절한 실행환경 전달 차단
- 출력 크기 제한과 기계 판독 가능한 terminal record

의도적 `PASS → FAIL → PASS → TIMEOUT → PASS`와 policy-block fixture로 한 사례 실패가 다른 사례의 계약 검사를 중단하지 않음을 확인했다.

### 3.3 append-only evidence 방어

- 빈 값, null, 잘못된 형식과 path escape run ID 거부
- `allowedRoot` 밖 경로와 document path escape 거부
- stage directory 작성 후 atomic rename으로 commit
- 이미 존재하는 run directory overwrite 거부
- NaN, Infinity와 비-plain JSON value 거부
- 선언되지 않은 파일·디렉터리와 symlink/junction 탐지
- byte length, SHA-256, self-hash와 hash chain 재검증
- non-fixture run은 외부 Ed25519 custody anchor가 없으면 terminal evidence로 사용할 수 없음
- local framework fixture anchor는 negative test 전용이며 qualification에 사용할 수 없음
- local filesystem은 WORM이 아니므로 local writer의 재작성 저항성을 주장하지 않음
- tamper 후 저장 artifact 독립 검증 실패

WP-01은 실제 사례 run directory를 생성하지 않는다. 이 방어는 result-free fixture를 임시 디렉터리에 저장해 검증했다.

## 4. evidence와 보고서 계약

capture index는 `MODEL`, `SUPPORTS_LOADS_AXES`, `ANALYSIS_RESULT`, `COMPARISON` 종류, Chrome browser metadata, 파일 크기·SHA-256·PNG dimension과 JSON parity 상태를 기록한다. UI가 준비되지 않았으면 캡처를 위조하지 않고 `NOT_RUN_M1` 또는 `BLOCKED_UI`와 reason code를 기록한다.

사례 보고서 renderer는 immutable `case-evidence.json`과 capture index의 검증된 projection만 읽고 solver나 model builder를 호출해 누락 결과를 보충하지 않는다. 별도의 evidence package audit는 raw engineering-result bytes와 잠긴 probe로 추출을 재생하고, 잠긴 reference·tolerance로 비교 문서를 다시 산출해 저장 문서와 canonical identity를 대조한다. evidence hash, external custody, run binding, extraction/comparison replay 또는 capture hash가 어긋나면 실패한다.

M1에서는 terminal `PASS` authorization을 코드 상수와 package audit에서 이중 차단했다. 실행 자료가 형식상 준비돼도 M1이 만들 수 있는 최상위 상태는 `QUALIFICATION_CANDIDATE`이며, `auditApprovedCasePackage`는 항상 `P17_M1_TERMINAL_PASS_DISABLED`로 종료한다.

WP-01의 phase-level 구현 보고서와 사례별 `REPORT.md`/`REPORT.pdf`를 구분한다. M1에서는 실제 모델·결과·Chrome 화면이 없으므로 사례 보고서와 결과 캡처는 0개다.

## 5. architecture boundary 결과

| 검토 항목 | P17 active scope | 판정 |
| --- | ---: | --- |
| product → verification import | 0 | 신규 역방향 의존성 없음 |
| verification → product deep import | 0 | private solver 우회 없음 |
| verification → product public root import | 1 | `src/index.js`의 승인된 공개 경계 |
| P17-specific reference leakage | 0 | 신규 expected/reference 생산 코드 유출 없음 |
| report → solver import | 0 | evidence-only 경계 유지 |
| active P17 import cycle | 0 | 책임 모듈 간 cycle 없음 |

이 수치는 repository 전체 부채가 해소됐다는 뜻이 아니다. 전역 역사 범위에는 verification → product deep import 133건/54개 파일과 generic production expected-value 부채 2개 finding이 남는다. 후자는 `src/examples/verification.js`의 expected 값 11회와 `src/index.js` 공개 export를 포함한다. 두 항목은 M1 신규 구현 밖의 release debt로 유지하며 제품 release를 허용하지 않는다.

## 6. M0 R4 schema 부채 처리

M0 R4는 R3 final manifest와 closure의 모든 nested record가 strict schema로 검증된 것처럼 보인 문서 주장을 정정하고 `OPEN_SCHEMA_DEBT_CARRIED_TO_M1`로 이관했다.

M1은 신규 정본 16종에 strict schema와 semantic validation, 저장 artifact 독립검증, unknown-keyword fail-closed와 mutation kill을 적용했다. 따라서 이 부채는 `CLOSED_FOR_M1_AUTHORITATIVE_RECORDS`로 닫는다. 이 판정은 M0 R3 schema를 소급 변경하거나 R3 산출물을 완전한 strict-schema artifact로 재분류하지 않는다. M0 R4의 제한된 역사 판정은 그대로 보존한다.

## 7. 검증 명령

```text
node verification/runners/scaffold-p17-m1.mjs --check
node tests/p17-m1-json-schema-validator.mjs
node tests/p17-m1-framework-contract.mjs
node tests/p17-m1-result-extractor.mjs
node verification/harnesses/check-p17-m1-boundaries.mjs --fail-on-findings
node tests/p17-m0-source-lock.mjs
node tools/run-p17-m1-evidence.mjs
node tools/render-p17-m1-report.mjs --verify-final
node verification/harnesses/finalize-p17-m1.mjs --check
```

각 명령의 `PASS`는 framework/schema/negative regression의 판정이다. benchmark 수치 `PASS`가 아니다.

## 8. 종료 gate

| Gate | 결과 |
| --- | --- |
| 공식/custom scaffold | 21 + 1 |
| 사례별 필수 파일 | 19 |
| 결정론적 scaffold | 419/419 unchanged |
| runtime schema | 16/16 strict + semantic valid |
| process-isolated contract | 22/22 validated |
| failure/timeout 계속 실행 | 확인 |
| append-only overwrite/null/path/tamper 방어 | 확인 |
| non-fixture external signed custody | terminal 전제 계약만 구현; pinned trust registry는 M2 gate |
| data-only extraction | identity-only probe, source/extractor/probe hash와 replay 계약 확인 |
| active P17 boundary | deep import·reference leak·report solver dependency·cycle 모두 0 |
| benchmark/solver/model/result/capture/case report | 모두 0 |
| 공식 사례 PASS | 0/21 |
| terminal authorization | M1에서 강제 `false` |
| release | `false` |

## 9. P17-M2 진입 조건

다음 마일스톤은 `P17-M2 / SB1`이다. M1 계약이 준비됐다는 사실만으로 SB1 terminal 판정을 열지 않는다. P17-M2는 다음 8개 gate를 먼저 구현·검증해야 한다.

1. official execution orchestrator와 attested receipt
2. pinned external execution-custodian trust registry
3. reference artifact 실제 byte custody audit
4. extraction·comparison end-to-end replay
5. physics·mutation replay
6. 서로 다른 run ID와 외부 custody를 가진 독립 3회 실행
7. deterministic PDF reproduction과 화면 visual parity audit
8. artifact scope에 암호학적으로 결속된 독립 reviewer attestation

이 gate와 SB1 source/reference/probe/tolerance/model lock 중 하나라도 닫히지 않으면 `BLOCKED_*` 또는 `QUALIFICATION_CANDIDATE`로 유지한다. M1의 terminal 차단을 단순히 제거하는 변경은 허용하지 않는다.
