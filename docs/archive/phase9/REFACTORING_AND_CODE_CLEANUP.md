# Phase 9 Refactoring and Code-Cleanup Plan

```yaml
version: p9-refactor-cleanup-v1
status: proposed
rule: every feature milestone carries a debt-reduction exit gate
```

## 1. 목적

GPU 가속을 별도 코드층으로 덧붙여 탄성·비선형·CPU·GPU 구현이 각각 갈라지는 것을 방지한다. Phase 9는 기능 개발과 동시에 계산계약, 파일 책임, API, legacy와 생성물 관리를 정리한다.

## 2. 금지하는 접근

- 기존 solver를 그대로 복사한 GPU 전용 solver tree
- behavior baseline 없이 대규모 파일 이동과 수치변경을 한 commit에 혼합
- 새 API를 추가하고 기존 호출처를 무기한 방치
- performance를 이유로 validation·audit·trace 제거
- hot loop 최적화 전에 profiling 없이 low-level rewrite
- 사용처 확인 없이 legacy 파일 삭제
- deprecated 기능을 UI에서 숨기기만 하고 public export에 유지
- generated evidence를 수동 편집하거나 source revision 없이 commit

## 3. 현재 debt inventory

| ID | 현재 위치 | 문제 | 목표 owner | 제거/완료 gate |
| --- | --- | --- | --- | --- |
| P9-DEBT-01 | `src/solver/linear3d.js` | validation부터 design까지 단일 orchestrator | solver/elastic orchestration | behavior extraction parity |
| P9-DEBT-02 | `src/solver/sparse/` | 일반 Array CSC와 JS solver가 선형에 한정 | compute/sparse | CPU/WASM parity 후 adapter 제거 |
| P9-DEBT-03 | `src/nonlinear/equilibrium/typedSparse.js` | 별도 typed sparse owner | compute/sparse | shared contract 전환 |
| P9-DEBT-04 | `src/nonlinear/equilibrium/referenceBackends.js` | nonlinear 전용 backend policy | compute/backend policy | elastic/nonlinear 공통 적용 |
| P9-DEBT-05 | `src/nonlinear/equilibrium/backends/wasmSparseBackend.js` | single-RHS와 반복 copy ABI | compute/backends/wasm-cpu | handle/multi-RHS ABI 검증 |
| P9-DEBT-06 | `src/nonlinear/equilibrium/assembler.js` | object clone·순차 element loop | nonlinear batch adapter | CPU batch parity |
| P9-DEBT-07 | `src/dynamics/modal.js` | dense 행렬·고유치 책임 혼합 | solver/dynamics + compute/eigen | sparse operation parity |
| P9-DEBT-08 | `src/dynamics/globalBuckling.js` | assembly/recovery/eigen solver 혼합 | solver/buckling + compute/eigen | component extraction parity |
| P9-DEBT-09 | UI bridge와 test 호출처 | sync `analyzeModel` 의존 | product async service | call-site 0 + deprecation expiry |
| P9-DEBT-10 | legacy/preliminary engines | 여러 세대의 public 명칭과 adapter | explicit legacy registry | usage·migration·removal evidence |
| P9-DEBT-11 | Worker 구현 | 역할별 protocol/lifecycle 중복 | compute/runtime | common protocol contract |
| P9-DEBT-12 | 보고·telemetry | backend별 필드와 timing 불일치 | compute/telemetry | schema contract tests |

debt row는 owner, target milestone, callers, replacement, evidence와 removal 상태를 가져야 한다. `later`만 적은 항목은 허용하지 않는다.

## 4. 안전한 리팩토링 순서

```text
characterize behavior
  -> add golden/contract test
  -> extract responsibility without algorithm change
  -> old/new shadow comparison
  -> switch default behind explicit plan
  -> remove adapter and dead export
  -> update docs/evidence
```

수치알고리즘 변경은 extraction parity가 끝난 다음 별도 단계로 진행한다.

## 5. 탄성 orchestrator 분리

`analyzeModel`의 목표 책임은 public compatibility facade까지만 남긴다.

분리 단위:

- model migration/validation
- analysis dependency plan
- combination/factor grouping
- static solve orchestration
- P-Delta orchestration
- dynamic case orchestration
- recovery/envelope
- design/audit/qualification

각 단위는 plain data contract를 입력·출력하고 UI를 import하지 않는다. error와 warning 정렬순서를 golden contract로 고정한다.

## 6. Sparse 구현 단일화

### 목표

- 하나의 CSR/CSC schema
- TypedArray만 사용하는 production storage
- symbolic pattern과 numeric values 분리
- common matvec, transpose, submatrix와 diagnostics
- CPU/WASM/WebGPU adapter가 같은 buffer를 사용

### migration 규칙

1. 기존 두 구현의 property-based parity test 작성
2. 공통 read-only adapter 도입
3. 선형 solver를 typed contract로 전환
4. 비선형 assembler를 공통 contract로 전환
5. old format writer 제거
6. dense conversion 호출을 verification-only allowlist로 제한

production에서 dense conversion이 발생하면 diagnostics warning이 아니라 gate failure다.

## 7. Backend policy 단일화

공통 policy가 다음을 소유한다.

- target normalization
- capability와 matrix class 검사
- precision/determinism qualification
- memory/device preflight
- fallback policy
- failure code와 remediation
- provenance descriptor

탄성·비선형별 router는 구조공학 operation만 결정하고 backend 신뢰성 규칙을 복제하지 않는다.

## 8. Worker/runtime 정리

- 하나의 versioned message envelope 사용
- run token, sequence, acknowledgement와 terminal state 통일
- progress category와 monotonic percentage 규칙
- transferable ownership과 duplicate-transfer 검사
- resource ledger와 dispose acknowledgement
- Worker role은 capability로 선언하고 별도 protocol을 만들지 않음
- browser/Node test worker 차이는 adapter에 한정

main thread explicit production 실행경로는 테스트 전용 allowlist 밖에서 제거한다.

## 9. Element와 state hot-loop 정리

### 제거 대상

- 반복마다 `Array.from`/nested array local matrix 생성
- inner loop의 문자열·Map lookup
- element별 deep clone
- iteration마다 전체 state hash
- 동일 property의 반복 normalization/validation

### 대체

- type/property별 SoA batch
- precomputed integer index와 scatter
- reusable Float64Array workspace
- state offset table와 dirty range
- batch boundary validation
- accepted step 또는 evidence boundary hash

최적화 전후 element response, tangent, state bytes와 energy가 일치해야 한다.

## 10. Modal/Buckling 책임 분리

다음 세 계층을 분리한다.

1. 구조 domain과 K/M/Kg operator 생성
2. compute eigen operation
3. mode normalization, participation, buckling eligibility와 result recovery

고유치 solver가 구조 member ID나 design status를 알 수 없게 한다.

## 11. Public export와 API 정리

- production, compatibility, legacy export를 registry에서 구분한다.
- 새 production API는 product service를 통해서만 노출한다.
- internal compute helper를 root `src/index.js`에서 무분별하게 export하지 않는다.
- deprecated export는 warning, owner, caller count와 removal milestone을 가진다.
- test가 internal file을 직접 import해야 하면 이유와 replacement를 기록한다.
- Agent manifest와 user manual은 default production path만 설명한다.

## 12. Legacy 제거 정책

파일은 다음 조건을 모두 만족할 때만 제거한다.

- repository와 runtime caller 0
- persisted old project/result migration 또는 명시 unsupported 처리
- public API deprecation 기간 종료
- replacement parity와 regression test 통과
- 사용자 문서와 Agent capability에서 제거
- release note와 code review 기록

삭제 전 legacy fixture는 새 reader/migration test로 보존할 수 있다. 실행코드를 보존하는 것과 fixture를 보존하는 것을 구분한다.

## 13. Dependency와 파일 책임 gate

마일스톤 종료 시 검사한다.

- circular import 0
- UI -> product -> formulation -> compute 방향 준수
- backend가 UI/catalog/report/persistence를 import하지 않음
- 한 contract의 writer owner 1개
- duplicate stable-hash/schema/version constant 없음
- public export 추가·삭제가 manifest와 문서에 반영됨

파일 크기 자체를 실패기준으로 삼지 않지만 서로 다른 변경 이유가 한 파일에 누적되면 책임 분리 finding으로 등록한다.

## 14. Hot-path 코드 규칙

- inner loop에서 예외를 정상제어로 사용하지 않는다.
- production numeric buffer는 typed array와 명시적 unit을 사용한다.
- allocation은 session/preflight에서 추정 가능해야 한다.
- state mutation 함수는 commit/trial ownership을 이름과 contract로 드러낸다.
- reduction order와 parallel semantics를 문서화한다.
- performance shortcut은 diagnostics와 qualification에 남긴다.
- debug hash/trace는 bounded sampling 또는 단계경계에서 수행한다.

## 15. 테스트 정리

테스트를 다음 층으로 구분한다.

| 층 | 목적 |
| --- | --- |
| math unit | 독립 수식·kernel |
| contract | binary/backend/message schema |
| parity | old/new, CPU/GPU 비교 |
| integration | canonical domain부터 recovery |
| product | UI/Agent/report workflow |
| qualification | 독립기준·hardware·성능 |

같은 expected JSON을 여러 테스트에 복사하지 않고 fixture owner와 version을 둔다. 구현결과를 그대로 expected로 재생성하는 테스트는 regression이지 qualification임을 표시한다.

## 16. 생성물과 repository hygiene

- generated evidence는 전용 도구로만 생성한다.
- source revision, config hash, backend build와 생성 도구 version을 포함한다.
- 대용량 raw trace는 retention 기준을 적용한다.
- line-ending만 달라진 generated file을 마일스톤 commit에 포함하지 않는다.
- source, test, docs, evidence의 변경범위를 commit 전에 분류한다.
- 사용자의 unrelated worktree 변경을 stage하지 않는다.

## 17. 마일스톤별 cleanup budget

각 마일스톤은 최소 다음을 산출한다.

- 새 debt 추가 수
- 종료한 debt 수
- 남은 compatibility caller 수
- 제거한 duplicate implementation/export 수
- hot-path allocation/clone 변화
- dependency violation 수
- stale 문서·생성물 수

기능은 완료됐지만 debt가 증가하고 owner가 없으면 마일스톤은 `complete`가 아니다.

## 18. 최종 완료조건

- 탄성·비선형이 공통 compute/backend/runtime contract를 사용한다.
- production sparse schema owner가 하나다.
- sync/legacy caller는 승인된 allowlist만 남는다.
- GPU 전용 model/result/orchestrator가 없다.
- hot loop의 object clone과 unbounded allocation이 제거된다.
- public export와 Agent/API 문서가 현재 default 경로와 일치한다.
- debt register에 owner·milestone 없는 항목이 없다.
- 전체 회귀, parity, documentation integrity와 code review가 통과한다.

\n