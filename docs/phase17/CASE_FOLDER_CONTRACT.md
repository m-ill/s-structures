# Phase 17 Case Folder Contract

```yaml
version: p17-case-folder-contract-v1
scope: official-strix21
case_count: 21
evidence_policy: append-only
result_authority: comparison-and-evidence-json
```

## 1. 목표 구조

```text
verification/benchmarks/strix21/
├─ suite-manifest.json
├─ cases/
│  ├─ SB1/
│  ├─ SB2/
│  ├─ ...
│  └─ TH1/
├─ custom/
│  └─ P3S2-SS/
├─ references/
├─ runs/                       # suite aggregate와 Phase 15 역사 실행물
└─ reporting/
```

공식 case folder 이름은 STRIX ID를 그대로 사용한다. 표시 순서는 `suite-manifest.json`의 `ordinal`로 고정해 파일명 정렬에 의존하지 않는다.

## 2. 사례 폴더 필수 구조

```text
<CASE_ID>/
├─ README.md
├─ case-manifest.json
├─ source/
│  ├─ source-manifest.json
│  └─ transcription.md
├─ model/
│  ├─ canonical-input.json
│  ├─ sstructures-input.json
│  ├─ model-equivalence.json
│  └─ modeling-notes.md
├─ reference/
│  ├─ reference-manifest.json
│  ├─ expected-values.json
│  ├─ tolerance-manifest.json
│  └─ probe-manifest.json
├─ runner/
│  └─ run.mjs
├─ tests/
│  └─ case-contract.mjs
├─ runs/
│  └─ <RUN_ID>/
│     ├─ input-snapshot.json
│     ├─ environment.json
│     ├─ execution.log
│     ├─ raw-result.json
│     ├─ normalized-result.json
│     ├─ invariants.json
│     ├─ convergence.json
│     ├─ comparison.json
│     ├─ run-record.json
│     └─ evidence.json
├─ figures/
│  └─ <RUN_ID>/
│     ├─ 01-model.png
│     ├─ 02-supports-loads-axes.png
│     ├─ 03-analysis-result.png
│     └─ 04-comparison.png
├─ report/
│  └─ <RUN_ID>/
│     ├─ REPORT.md
│     └─ REPORT.pdf
└─ review/
   ├─ checklist.md
   └─ signoff.json
```

외부 STRIX·MIDAS 실행 결과가 없으면 빈 `strix-result.json` 또는 `midas-result.json`을 만들지 않는다. `comparison.json`에 `BLOCKED_SOURCE`, `BLOCKED_MODEL` 또는 `COMPARISON_NOT_RUN`과 원인코드를 기록한다.

## 3. `case-manifest.json` 필수 항목

- `schemaVersion`, `caseId`, `ordinal`, `title`, `family`
- `officialSuiteMember: true`
- `sourceStatus`, `modelStatus`, `sstructuresRunStatus`
- `independentQualificationStatus`, `strixComparisonStatus`, `midasComparisonStatus`
- `performanceComparisonStatus`, `reportStatus`, `releaseStatus`
- `owner`, `modelReviewer`, `referenceReviewer`, `numericalReviewer`, `releaseReviewer`
- canonical unit system, global axes, local-axis convention, sign convention
- product service/API version, solver setting profile, requested output probes
- source/reference/tolerance/probe/model/build hash
- current terminal reason codes and superseded run IDs

모든 상태 필드는 enum schema로 제한하고 자유 텍스트 PASS를 허용하지 않는다.

## 4. 사례 상태 전이

```text
NOT_STARTED
  -> SOURCE_LOCKED
  -> MODEL_LOCKED
  -> RUNNABLE
  -> EXECUTED
  -> REVIEWED
  -> PASS | FAIL | BLOCKED_* | CROSS_CHECK_ONLY
```

다음은 상태 의미다.

| 상태 | 의미 |
| --- | --- |
| `PASS` | 모든 mandatory metric·물리 gate·수렴·결정론·review가 통과 |
| `FAIL` | 동일 모델로 실행했으나 하나 이상의 mandatory gate가 실패 |
| `BLOCKED_SOURCE` | 형상·하중·질량·스펙트럼 등 필수 입력이 없음 |
| `BLOCKED_REFERENCE` | 독립 기준값 또는 허용 정밀도가 없음 |
| `BLOCKED_ENGINE` | 자체 엔진에 필수 formulation이 없음 |
| `BLOCKED_ENGINE_API` | 내부 함수는 있어도 승인된 제품 공개 경로로 실행할 수 없음 |
| `BLOCKED_MODEL_EQUIVALENCE` | 두 프로그램 모델의 기본 가정이 동등하지 않음 |
| `BLOCKED_QUALIFICATION` | 숫자는 맞지만 mandatory physics evidence가 없음 |
| `CROSS_CHECK_ONLY` | 동일 formulation 검증은 아니지만 제한된 비교는 가능 |

`BLOCKED`는 실패를 숨기는 상태가 아니라 무엇이 없어서 판정할 수 없는지 기계적으로 표시하는 상태다.

## 5. 단일 사례 실행 순서

1. **Source lock**: 원문 경로·판본·페이지·checksum·license·추출 방식을 기록한다.
2. **Reference lock**: 기준값, 원문 정밀도, 단위변환, probe, tolerance를 실행 전에 승인한다.
3. **Model build**: 제품이 사용하는 정식 프로젝트 schema로 canonical model을 만든다.
4. **Model review**: 요소 정식화, 축, 지점, 하중, 질량, 감쇠, 메시와 silent default를 비교한다.
5. **Preflight**: schema, 단위, rigid-body mode, 하중 합력·도심, 질량, DOF와 hash를 확인한다.
6. **UI capture**: Chrome 제품 화면에서 model, support/load/axis 상태를 캡처한다.
7. **Product run**: case runner가 stable product service를 호출한다. 외부 solver fallback은 금지한다.
8. **Physics checks**: 사례별 평형·에너지·수렴·직교성·mutation gate를 실행한다.
9. **Comparison**: 독립 기준과 STRIX 공개값을 별도 열로 비교하고 signed difference를 계산한다.
10. **Result capture**: 변형, 응력·내력, mode shape 또는 history 화면을 캡처한다.
11. **Report**: immutable evidence에서 Markdown/PDF를 생성한다. renderer는 계산하지 않는다.
12. **Review and close**: reviewer가 PASS, FAIL 또는 원인코드가 있는 BLOCKED로 닫는다.

## 6. 사용 도구와 책임

| 작업 | 도구 | 판정상 지위 |
| --- | --- | --- |
| PDF·HTML 원문 확인 | 로컬 PDF/HTML, catalog, checksum, `pypdf` 등 | source provenance |
| 모델 작성 | S-Structures 프로젝트 schema, modeling service 또는 agent action | canonical product input |
| 모델 시각 확인 | Chrome에서 S-Structures UI | 시각적 mapping evidence |
| 수치 실행 | Node case runner → 승인된 product analysis service | S-Structures 계산 정본 |
| 독립 계산 | verification 전용 투명한 closed-form/reference script | primary oracle 또는 보조 oracle |
| STRIX·MIDAS import | 별도 offline importer | R4 cross-solver lane |
| 비교·판정 | verification evaluator | tolerance 적용 정본 |
| 보고서 | evidence-only Markdown/PDF renderer | 전달 산출물 |

verification reference script는 production bundle에 포함하지 않는다. production 계산과 같은 함수를 oracle로 재사용하지 않는다.

## 7. 비교 공식

기본 signed relative error는 다음과 같다.

```text
signedErrorPct = 100 * (SStructures - Reference) / abs(Reference)
```

기준값이 0 또는 충분히 작으면 상대오차를 쓰지 않고 사전 동결한 절대 허용오차를 사용한다. 부호가 물리 의미를 가지는 변위·반력·축력·모멘트는 magnitude-only 비교로 바꾸지 않는다.

독립 기준값과 STRIX 공개값은 별도 필드다.

```text
errorToPrimaryReference
errorToStrixPublished
errorToStrixR4
errorToMidasR4
```

## 8. Hash chain과 불변성

```text
sourceArtifactHash
  -> extractionHash
  -> referenceManifestHash
  -> toleranceHash + probeHash
  -> canonicalCaseHash
  -> modelMappingHash
  -> nativeModelHash
  -> solverSettingsHash
  -> productSourceHash + buildHash + dependencyLockHash
  -> calculationHash
  -> engineeringResultHash
  -> runRecordHash
  -> caseEvidenceHash
  -> suiteManifestHash
  -> reportHash
```

- `runs/<RUN_ID>/`는 append-only다.
- `latest`는 pointer일 뿐 판정 정본이 아니다.
- 계산 hash는 full-precision engineering result whitelist projection을 사용한다.
- timestamp·host·hardware는 계산 hash에서 제외하고 run record에는 보존한다.
- source, reference, tolerance, probe, model, build 또는 solver setting이 바뀌면 관련 사례 evidence를 `INVALIDATED`하고 새 run ID로 재실행한다.

## 9. 화면 캡처 최소 세트

1. 전체 형상·절점·요소·메시
2. 지점, release/link, 하중, 질량, local axis
3. 변형 형상, 응력·부재력, mode shape 또는 시간이력 결과
4. 주요 수치와 기준값·오차 비교표 또는 그래프

캡처에는 case ID, model hash 단축값, run ID와 결과 단위를 표시한다. 이미지 안 숫자와 JSON/PDF 숫자의 parity를 자동 검사한다.

## 10. 사례 보고서 필수 목차

1. 검증 목적과 출전
2. 원문 판본과 checksum
3. 모델링 방법과 사용 도구
4. 모델 동등성 표와 알려진 차이
5. 형상·지점·하중·축 화면
6. 해석 방법과 solver 설정
7. 독립 기준·STRIX·S-Structures 결과 비교
8. signed/absolute 오차와 허용기준
9. 평형·수렴·에너지·모드 또는 비선형 품질 지표
10. 결과 화면
11. 실패·blocker·수정 코드 영역
12. 재현 명령, hash chain과 reviewer 판정

