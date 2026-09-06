# Phase 15 Codebase Review Plan

```yaml
version: p15-codebase-review-plan-v1
status: proposed
created_at: 2026-08-27
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
review_record_path: docs/phase15/reviews/P15-M{n}-CODE-REVIEW.md
```

## 1. 목적

Phase 15 리뷰는 “테스트가 통과하는가”만 확인하지 않는다. 각 변경이 올바른 공학모델, 좌표·부호·단위, 수치 안정성, 모듈 경계와 독립 evidence를 동시에 지키는지 확인한다.

각 milestone에는 최소 다음 네 관점이 필요하다.

| 역할 | 책임 | 독립성 규칙 |
| --- | --- | --- |
| Solver implementer | production code, focused test, migration·rollback 설명 | 자기 변경의 최종 numerical/release 승인 불가 |
| Numerical reviewer | 행렬, 좌표변환, conditioning, residual, convergence, dense/sparse | 구현자와 다른 reviewer |
| Structural-domain reviewer | geometry, support, load, unit, axis, sign, probe, claim scope | fixture/reference 작성과 최종 승인을 가능하면 분리 |
| Verification/evidence reviewer | R1~R3 독립성, mutation, hash, stale, report fidelity | production solver 수정 금지 |

P15-M9에는 별도의 release owner와 구조전문가 sign-off가 필요하다. 역할은 한 사람이 일부 겸할 수 있지만 implementer 단독 승인은 허용하지 않는다.

## 2. 리뷰 시점

1. **Pre-change review**: requirement, discrepancy, red reproduction, reference/tolerance와 영향 파일 승인
2. **Extraction review**: behavior-preserving 이동의 import·API·full-precision parity 확인
3. **Numeric review**: 공식·좌표·부호·잔차·수렴·negative control 검토
4. **Integration review**: schema, UI/CLI/Agent/report, migration·rollback·성능 확인
5. **Milestone close review**: evidence hash·finding closure·status 승격 확인
6. **M8 codebase review**: 중복 owner·barrel·cycle·dead wrapper와 전체 회귀 감사
7. **M9 release review**: clean rerun·manifest·claim·owner 승인

## 3. PR 구성 규칙

- reference/tolerance PR과 production numeric PR을 분리한다.
- behavior-preserving extraction과 behavior change를 분리한다.
- 한 PR은 하나의 discrepancy cluster와 rollback route를 가진다.
- generated evidence/report는 코드 수정 PR과 분리해 재생성한다.
- PR 설명에는 다음이 필수다.

```text
Requirement / discrepancy / risk IDs
Before failure and reproduction command
Root cause and non-goals
Changed owner/API/files
Numerical derivation or contract
Migration/compatibility/rollback
Tests and quantitative results
Affected capability and stale evidence
Open limitations and reviewer roles
```

## 4. 파일·owner별 집중 리뷰

| 영역 | 현재 집중 파일 | 리뷰 질문 |
| --- | --- | --- |
| benchmark | `src/verification/benchmarks/strix21FirstBatch.js` | root barrel 역참조 제거, expected 분리, case isolation, signed metric, hash 결정성 |
| sparse | `src/compute/sparse/*`, `src/compute/elastic/factorSession.js` | 공통 owner, scaling 전후 residual, fallback, memory/lifecycle |
| frame assembly | `src/solver/linear3dAssembly.js` | private sparse 중복, 두 member/foundation build 경로, dense/sparse floor parity |
| membrane | `wallMembraneQm6.js`, `membraneWorkflow.js` | matrix basis·DOF order, global projection, stress tensor frame, probe lineage |
| plate | `plateWorkflow.js`, `slabPlateMitc4.js` | mesh dependency, boundary/assembly/solve/recovery 분리, κ·short-side provenance |
| foundation | `foundationSchema.js`, `winklerLine.js`, `linear3dRecovery.js`, `secondOrder.js` | validation 중복, end-action 부호, station closure, 1차/P-Delta 공통성 |
| stabilization | `shellStabilization.js`, `unsupportedRotationFloor.js` | solver/qualification 분리, 실제 solve, MAC owner, dense/sparse classifier |
| report/product | report·CLI·Agent surface | immutable artifact 소비, 숨은 계산 0, field/status parity |

## 5. 수치·구조공학 체크리스트

- [ ] element matrix의 basis와 DOF order가 데이터 계약에 있다.
- [ ] global assembly에 local matrix가 들어가면 fail-fast한다.
- [ ] K/M의 finite·symmetry·expected definiteness·rigid/null mode를 검사한다.
- [ ] 하중 resultant와 origin moment가 보존된다.
- [ ] support 이름이 아니라 실제 constrained DOF가 evidence에 있다.
- [ ] sign convention과 local/global axis 변환이 probe까지 추적된다.
- [ ] iterative solve는 원 system true residual을 검사한다.
- [ ] 외력-반력·moment·energy와 station endpoint가 닫힌다.
- [ ] mesh/time-step/mode/parameter convergence가 primary metric와 별도로 PASS한다.
- [ ] rotation/reflection/unit/permutation/scaling metamorphic test가 있다.
- [ ] 의도적 결함 mutation이 반드시 실패한다.
- [ ] reference 일치를 위해 stiffness·mass·probe·tolerance를 임의 조정하지 않았다.

## 6. Sparse·성능 체크리스트

- [ ] fine model에서 dense n×n allocation이 없다.
- [ ] assembler duplicate 합산과 ordering이 결정적이다.
- [ ] scaling/preconditioner가 원 물리행렬을 변경하지 않는다.
- [ ] IC breakdown, non-SPD, max-iteration과 fallback reason이 구분된다.
- [ ] fallback 후 true residual·equilibrium·energy를 다시 검사한다.
- [ ] factor/cache identity가 source matrix·settings 변경에 stale된다.
- [ ] session은 성공·예외·cancel 모두 allocation을 해제한다.
- [ ] runtime/memory가 M0 budget 안이며 성능 결과를 숨기지 않는다.

## 7. 아키텍처·모듈 체크리스트

- [ ] canonical owner가 하나이며 동등 공식 복제가 없다.
- [ ] `src/**` 내부에서 root `src/index.js`를 import하지 않는다.
- [ ] core/compute가 solver·verification·UI/report를 역참조하지 않는다.
- [ ] production owner가 reference/oracle/benchmark expected를 import하지 않는다.
- [ ] report는 immutable artifact만 읽고 solve/recovery를 재실행하지 않는다.
- [ ] dense/sparse가 동일 boundary/recovery/stabilization classifier를 사용한다.
- [ ] compatibility alias와 removal milestone이 문서화됐다.
- [ ] 전체 `src` import cycle 0, UI numeric-core direct import 0이다.
- [ ] public reason code와 diagnostics가 test·문서에 매핑된다.

## 8. Evidence·claim 체크리스트

- [ ] source title/version/page/hash와 reference 등급이 있다.
- [ ] tolerance·probe·unit·axis·sign이 실행 전에 동결됐다.
- [ ] canonicalModel/calculation/result/runRecord hash가 non-null이다.
- [ ] timestamp·hostname·hardware가 calculation hash에서 제외됐다.
- [ ] failure/blocked/not-run/stale/partial이 PASS로 집계되지 않는다.
- [ ] evidence와 report 값·상태·제한이 완전히 일치한다.
- [ ] P3S2-SS claim에 `identicalToStrixP3S2=false`가 강제된다.
- [ ] MIDAS·STRIX 비교는 mapping difference와 program version을 기록한다.

## 9. Finding severity와 closure

| Severity | 정의 | 처리 |
| --- | --- | --- |
| Critical | 안전·평형·단위·부호·reference 독립성·release를 거짓으로 만들 수 있음 | 즉시 stop, milestone/release 차단 |
| High | 주요 수치경로·호환성·evidence 무결성 오류 | merge/close 차단 |
| Medium | 제한된 경로·유지보수·진단·성능 결함 | owner·기한·release 영향 기록 후 조건부 허용 가능 |
| Low | 명명·문서·비핵심 개선 | backlog 가능 |

closure는 코드 변경만으로 끝나지 않는다. red→green test, regression, evidence hash, reviewer 확인과 stale impact가 모두 있어야 한다.

## 10. Milestone 승인 매트릭스

| Milestone | Solver | Numerical | Structural-domain | Verification | Architecture | Release |
| --- | --- | --- | --- | --- | --- | --- |
| M0 | consult | required | required | required | required | — |
| M1 | consult | required | required | required | required | — |
| M2 | required | required | consult | required | required | — |
| M3~M5 | required | required | required | required | consult | — |
| M6 | required | required | required | required | required | — |
| M7 | consult | required | required | required | consult | — |
| M8 | required | required | required | required | required | — |
| M9 | consult | required | required | required | required | required |

`required` 역할의 승인 또는 명시적 BLOCKED가 없으면 milestone을 완료로 표시하지 않는다.

## 11. Review record 형식

각 `reviews/P15-Mn-CODE-REVIEW.md`는 다음을 포함한다.

```yaml
milestone:
source_revision:
dirty_summary_hash:
reviewed_changes:
requirements:
discrepancies:
evidence_hashes:
reviewers:
verdict: PASS | PASS_WITH_MEDIUM | FAIL | BLOCKED
open_findings:
```

본문에는 scope, architecture diff, numeric derivation, executed commands, quantitative results, findings, limitations, rollback과 status recommendation을 기록한다.
