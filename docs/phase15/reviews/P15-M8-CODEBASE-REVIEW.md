# P15-M8 코드베이스·모듈화 리뷰

```yaml
milestone: P15-M8
reviewed_at: 2026-08-28
source_revision: a44eb98601e4fbcd2913bbb34a809d126452f793
dirty_summary_hash: abbe93771cc777da480a6278452fc88d39209c96
dirty_entry_count: 456
reviewed_changes:
  - tools/check-phase15-architecture.mjs
  - src/compute/sparse/assembly.js
  - src/solver/linear3dAssembly.js
  - src/solver/shell/unsupportedRotationFloor.js
  - src/solver/shell/shellStabilization.js
  - src/solver/shell/plateBoundary.js
  - src/solver/foundation/foundationRecovery.js
  - src/core/modelHash.js
  - src/verification/matrix/record.js
  - src/ui/m3App.js
  - src/ui/m3State.js
  - tests/p15-m8-architecture-and-modularization.mjs
  - tests/p15-m8-sparse-and-stabilization-ownership.mjs
  - tests/p15-m5-winkler-recovery.mjs
  - tests/p7-m10-sparse-integrity.mjs
requirements:
  - P15-ARCH-01
  - P15-ARCH-02
  - P15-ARCH-03
  - P15-ARCH-04
  - P15-ARCH-05
  - P15-ARCH-06
  - P15-ARCH-07
  - P15-NUM-06
  - P15-STAB-07
discrepancies:
  - P15-D004
  - P15-D010
  - P15-D012
  - P15-D015
  - P15-D016
evidence_hashes:
  architecture_source_digest: 7293013eaea14530412cd88980384f62b2a03da3d20da057e291a9a0a6fc2fc9
  architecture_audit_hash: 6a14c4435a2a198ac932c6c0030ced759671054a06a38aa5cccada9c65db3368
  stabilization_qualification_hash: d6f8d46cba4b8f0f6ec1265a60592d18316cf42a76e0f2da15e969d52cb1ef17
  dense_csc_floor_plan_hash: eb56dfa5d7791952ef440f697a4e2fcad34a16afd9d529a7770efe9935f23d46
  production_floor_plan_hash: 49440a10008a7a320ed6243ffbfc7e87571675e183e51f7448dbfaeb1bc7694d
  first_batch_calculation_hash: 0ec54af68e176c42f6659e9e51fdc9dc53e2c2e6648b6b0b7f5ca549ed50ede1
  first_batch_result_hash: 862be01f9bc70ac73add343699bcc102e9a28d34cbb4fa06a76c8464019c61cd
  full_regression_hash: c5ecb34f90de19e255ea4c8c8b424cbd6198181f0cf13664d63a6302b3e0fa21
reviewers:
  architecture: Codex static audit and manual review
  numerical: focused automated parity/regression only; independent approval pending
  structural_domain: independent approval pending
  verification: mutation fixture and evidence-hash audit only; independent approval pending
verdict: BLOCKED
resolved_findings:
  - P15-M8-F01
  - P15-M8-F02
open_findings:
  - P15-M8-F03
  - P15-M8-F04
  - P15-M8-F05
  - P15-M8-F06
  - P15-M8-F07
  - P15-M8-F08
```

## 1. 결론

M8에서 목표한 네 수치 owner의 단일화와 전체 `src` cycle 제거는 확인됐다. private sparse accumulator/CSC submatrix는 공통 sparse adapter로 이관됐고, dense/CSC unsupported-rotation floor는 동일 plan owner와 동일 plan hash를 사용한다. plate boundary와 Winkler recovery도 각각 단일 canonical owner를 가진다.

production run record의 verification 역참조와 두 UI bridge의 internal root barrel import는 제거됐다. 그러나 `P15-ARCH-02`, `P15-ARCH-04`~`07`과 남은 product-layer dependency·compatibility·NFR 기준은 아직 충족하지 못했다. 따라서 이 문서는 M8 완료 또는 M9 release 승격을 승인하지 않는다.

## 2. 리뷰 범위와 방법

- 전체 `src/**/*.js|mjs` literal import/export edge를 정적 분석했다. 파일·edge 수와 source digest는 병행 수정 뒤 재생성되는 최종 architecture artifact를 정본으로 삼는다.
- Tarjan SCC로 전체 cycle을 검사하고, 의도적 fixture mutation으로 cycle·root barrel·UI→numeric·production→verification·duplicate owner 탐지를 검증했다.
- sparse/boundary/foundation recovery/stabilization owner 정의와 consumer를 정적 inventory로 확인했다.
- 실제 production `analyzeComponent3D`에서 dense/CSC shell 응답과 floor plan hash를 비교했다.
- SB7 경계조건 회귀는 8/32/64요소 production 모델로 확인했다. 자유 uniform torsion은 numerical floor로 숨기지 않고 평면 benchmark fixture가 비대상 `rx`를 명시적으로 구속한다.
- legacy wrapper는 이름·정책 필드·consumer를 정적 inventory로 확인했다. 동작 parity, 저장/재열기, 성능은 별도 evidence가 없어 PASS로 간주하지 않았다.

감사 artifact는 `verification/evidence/validation/phase15/p15-m8-architecture-audit.json`이다. 도구는 `--fail-on-findings`를 지원하며, 현재 baseline에서는 의도대로 non-zero gate가 발생해야 한다.

## 3. 아키텍처 결과

| 항목 | 실측 | 판정 |
| --- | ---: | --- |
| 감사 source file | 683 | INFO |
| literal import edge | 2307 | INFO |
| 전체 `src` import cycle | 0 | PASS |
| unresolved relative import | 0 | PASS |
| solver upward import | 0 | PASS |
| internal→root barrel | 0 | PASS |
| UI→numeric core direct import | 40 | BLOCKED |
| production→verification import | 11 | BLOCKED |
| report→solver execution owner | 1 | BLOCKED |
| undocumented compatibility wrapper | 5 | BLOCKED |
| overdue compatibility policy | 4 | BLOCKED |

### Canonical owner

| 관심사 | Canonical owner | owner 수 | 중복 | 판정 |
| --- | --- | ---: | ---: | --- |
| sparse assembler | `src/compute/sparse/assembly.js` | 1 | 0 | PASS |
| plate boundary | `src/solver/shell/plateBoundary.js` | 1 | 0 | PASS |
| foundation end/station recovery | `src/solver/foundation/foundationRecovery.js` | 1 | 0 | PASS |
| unsupported-rotation classifier | `src/solver/shell/unsupportedRotationFloor.js` | 1 | 0 | PASS |

owner gate는 canonical 파일이 실제 존재하고 `ownerCount===1`이며 duplicate가 0일 때만 통과하도록 fail-closed 처리했다. 단순히 “중복이 발견되지 않음”만으로 canonical 부재를 PASS시키지 않는다.

## 4. 구현 리뷰

### 4.1 Sparse assembly와 factor policy

- `linear3dAssembly.js:44,47-50`은 기존 `createElasticFactorSession`/SPD 기본 경로를 보존하면서 공통 mutable sparse adapter와 deterministic CSC submatrix를 사용한다.
- 기존 private accumulator, private CSC finalize/submatrix 구현은 제거됐다.
- sparse production solve는 `scaled-ic0-pcg`를 사용했고 dense/sparse node displacement 상대차는 `1e-9` 기준을 통과했다.
- 공통 mutable adapter는 unfinished matrix에 spring·stabilization을 추가해야 하는 호환 경로다. 신규 element block은 계속 `createDeterministicSparseAssembler`를 사용해야 한다.

### 4.2 Unsupported rotation

- `unsupportedRotationFloor.js`가 dense/CSC storage-independent plan의 canonical owner다.
- dense와 CSC는 `canonicalPlanHash=eb56...`로 일치했고 실제 production shell도 동일 backend plan hash를 반환했다.
- global rigid rotation은 `rejectedRigidMechanismDofs`로 보호한다. SB7의 자유 uniform torsion을 floor로 숨기는 것은 잘못이며, 평면 benchmark 모델의 N0 `rx`를 명시적으로 구속했다.
- 비강체 exact-null drilling 회귀는 M6 fixture의 affected DOF와 M8 dense/CSC parity로 유지된다.

### 4.3 Boundary/recovery/model hash

- plate boundary는 `plateBoundary.js`로 추출됐고 workflow의 기존 export는 호환 surface로 유지된다.
- linear/P-Delta foundation end/station 계산은 `foundationRecovery.js`를 공유한다.
- production에서 verification record의 `modelHash`를 가져오던 소비자는 `src/core/modelHash.js`로 이동했다. verification record는 이 core owner를 재-export해 기존 public API를 보존한다.

## 5. 실행한 검증

| 명령 | 결과 | 핵심 수치 |
| --- | --- | --- |
| `node tools/run-phase15-tests.mjs --from=8 --to=8` | test process PASS, milestone BLOCKED | cycle 0, owner 4×1, forbidden import 잔존 |
| `node tests/p15-m8-architecture-and-modularization.mjs` | PASS | mutation detector와 deterministic audit hash PASS |
| `node tests/p15-m8-sparse-and-stabilization-ownership.mjs` | PASS | dense/CSC plan·응답 parity, sparse `scaled-ic0-pcg` |
| `node tests/p15-m2-sparse-numeric-infrastructure.mjs` | PASS | true residual 0, IC breakdown reason 보존 |
| `node tests/p15-m5-winkler-recovery.mjs` | PASS | SB7 8요소 `-0.0893324123 in`; 32/64 dense/sparse PASS |
| `node tests/p15-m6-real-shell-stabilization.mjs` | PASS | min MAC `0.999999999998`, max static shift `1.553e-6` |
| `node tests/p14-m9-shell-stabilization.mjs` | PASS | legacy floor sweep parity 유지 |
| `node tests/p15-m7-existing-pass-qualification.mjs` | PASS | 6 case, mutation kill 10 |
| `node tests/benchmark-strix21-first-batch.mjs` | PASS | 12 attempted; PASS 9, CUSTOM_PASS 1, intended BLOCKED 2; metric 52/52 |
| `node tests/p10-m9c-global-assembly.mjs` | PASS | reaction shear error `2.91e-16` |
| `node tests/p14-m5-membrane-workflow.mjs` | PASS | mesh/result/probe hash 생성 |
| `node tests/p7-m11-run-record.mjs` | PASS | run record lifecycle 유지 |
| `node tests/p7-m11-ui-run-records.mjs` | PASS | UI run record lifecycle 유지 |
| `node tests/p13-m1-unified-run-workspace.mjs` | PASS | lifecycle/stale/race/migration PASS |
| `node tests/p13-m2-model-check-repair.mjs` | PASS | model hash owner 이동 회귀 PASS |
| `node tests/m3-ui-state.mjs` | PASS | root barrel 제거 후 state PASS |
| `node tests/p7-m10-sparse-integrity.mjs` | PASS | qualified `scaled-ic0-pcg`, 5,010 free DOF, residual `8.88e-16`, dense conversion 0 |

legacy sparse integrity assertion은 이전 `sparse-cg` backend 이름과 LDLT certification shape를 고정하고 있었다. Phase 15 SPD policy에 맞춰 IC(0) factor storage, CSC-only input, fallback 여부, true residual과 storage 계약을 검증하도록 migration했다.

## 6. Findings

| ID | Severity | 위치 | 발견 내용 | 권고 | 상태 |
| --- | --- | --- | --- | --- | --- |
| P15-M8-F01 | Critical | `src/core/analysisEvidenceAcceptance.js`, `src/core/analysisRunRecord.js`, `src/verification/analysisEvidenceAdapter.js`, `tests/p15-m8-analysis-evidence-boundary.mjs` | core run record의 verification record/registry 직접 import를 제거했다. core는 특정 audit·matrix·artifact 버전을 모른 채 generic comparison assertion, 실행 subject binding, trusted producer contract, source/integrity hash만 fail-closed 판정한다. 버전별 legacy evidence 검증은 verification producer adapter가 담당한다. raw/self-declared evidence와 producer·subject·source·assertion 변조는 모두 `candidate`, 설계전달 차단으로 회귀했다. | adapter를 거치지 않은 legacy payload는 의도적으로 신뢰하지 않으며, 신규 evidence producer도 core acceptance contract와 별도 product trust review를 통과해야 한다. | RESOLVED 2026-08-27; P7/P8/P13/M8 focused PASS, core→verification 0, 전체 M8은 F03~F08로 계속 BLOCKED |
| P15-M8-F02 | High | `src/ui/indexAgentApi.js`, `src/ui/indexBridge.js`, `tests/p15-m8-architecture-and-modularization.mjs` | 두 UI bridge의 `../index.js` 역참조를 제거하고 각 symbol을 canonical owner에서 직접 import하도록 이관했다. 전체 `src` cycle 0과 공개 bridge/agent 동작을 유지했으며 architecture test가 internal root barrel 0을 명시적으로 고정한다. | root barrel은 외부 consumer 전용으로 유지하고 신규 내부 역참조를 architecture gate에서 즉시 차단한다. | RESOLVED 2026-08-27; M3/M9/P7-M3 UI, agent capability/command, P10/P11/P13 bridge parity, M8 architecture focused PASS; 전체 M8은 F03~F08로 계속 BLOCKED |
| P15-M8-F03 | High | `src/ui/agentManifest.js:79-269`, `src/ui/indexAgentApi.js`, `src/ui/indexBridge.js`, `src/ui/indexPhase13ElasticWorkspace.js:21-40`, `src/ui/indexResultsPanel.js:2` | root barrel 제거로 실제 direct dependency가 드러나 UI→numeric import 40개와 production→verification import 11개가 남았다. manifest와 bridge가 VERSION·benchmark symbol을 위해 solver/verification module을 직접 평가한다. | 빌드 시 생성한 static capability/version manifest와 immutable product-result contract를 둔다. UI는 service/result만 소비한다. | OPEN |
| P15-M8-F04 | High | `src/report/detailedReport.js:14,108` | report가 `buildWallSlabEquivalentTrace` solver owner를 import해 report 생성 중 recovery/trace를 재실행한다. 동일 run artifact와 값이 달라질 수 있다. | analysis completion 시 immutable equivalent-shell trace를 저장하고 report는 hash 검증 후 해당 snapshot만 렌더링한다. | OPEN |
| P15-M8-F05 | High | `src/nonlinear/legacy/*.js`, `src/solver/domain/compatibility.js`, `src/ui/indexResultCompatibility.js`, `src/compute/compatibility/syncFacade.js:9-10`, `src/compute/governance/compatibilityRegistry.js:96`, `src/compute/product/legacyUiCompatibility.js:13` | wrapper 14개 중 5개에 removal policy가 없고 4개 policy가 Phase 9/10 기한을 넘겼다. 기존 P9 audit는 날짜가 아니라 `status==='expired'`만 검사해 이를 놓친다. | consumer별 parity test, owner, review/delete milestone, public API break 승인 조건을 registry에 등록하고 날짜 기반 CI gate를 사용한다. | OPEN |
| P15-M8-F06 | High | P15-ARCH-05 evidence | legacy project migration/save/reopen/undo/backup의 단일 M8 evidence가 없다. 일부 개별 회귀 통과를 전체 기준 충족으로 확대할 수 없다. | 대표 legacy project를 동결하고 save→reopen hash, undo/redo, backup/recovery를 한 workflow test와 artifact로 생성한다. | NOT RUN, M8 차단 |
| P15-M8-F07 | High | P15-ARCH-06 evidence | M0 대비 runtime/memory `≤1.25x` 비교 artifact가 없다. | 동일 hardware/runtime에서 M0 case set을 3회 실행해 median runtime, peak RSS/CSC storage, dense allocation count를 기록한다. | NOT RUN, M8 차단 |
| P15-M8-F08 | Medium | `src/compute/sparse/assembly.js:241-273` | mutable adapter는 insertion 순서의 native floating addition을 사용한다. 공통 owner와 lifecycle은 확보했지만 대규모 element contribution의 compensated 결정성 debt가 남는다. | element contribution은 source metadata를 가진 compensated deterministic assembler로 단계 이관한다. mutable adapter는 unfinished matrix 증분이 필요한 compatibility 경로로만 제한한다. | OPEN; legacy sparse policy test는 migration 완료 |

## 7. Compatibility consumer inventory

문서화되지 않은 wrapper와 현재 직접 consumer 수는 다음과 같다.

| Wrapper | consumer 수 |
| --- | ---: |
| `src/nonlinear/legacy/contract.js` | 4 |
| `src/nonlinear/legacy/preliminaryPushover.js` | 2 |
| `src/nonlinear/legacy/sdofNewmarkTrace.js` | 2 |
| `src/solver/domain/compatibility.js` | 4 |
| `src/ui/indexResultCompatibility.js` | 3 |

삭제는 consumer parity와 public API 승인을 확보한 뒤 해야 한다. 이번 M8에서는 inventory만 자동화했고 무단 삭제하지 않았다.

## 8. 제한과 rollback

- 작업 트리는 리뷰 record 자체를 제외한 캡처 시점에 456개 dirty entry가 있었다. `source_revision`만으로 재현할 수 없으므로 source digest와 dirty summary hash를 함께 기록했다.
- 정적 import parser는 literal ESM import/export/dynamic import를 대상으로 한다. 계산된 specifier나 런타임 registry 호출은 별도 runtime test가 필요하다.
- owner audit는 등록 symbol 정의를 탐지한다. 이름이 다른 동등 공식은 numerical reviewer의 수식 검토와 mutation이 추가로 필요하다.
- independent numerical/structural/verification reviewer sign-off가 없다.
- rollback은 owner 추출을 통째로 되돌리는 대신 public wrapper를 유지한 채 consumer를 이전 owner로 되돌리는 단위로 수행한다. SPD/factor session 정책과 physical rigid-mode protection은 rollback 대상이 아니다.

## 9. Status recommendation

- `P15-ARCH-01`: PASS
- `P15-ARCH-03`: PASS
- `P15-ARCH-02`, `P15-ARCH-04`~`07`: BLOCKED
- `P15-D015`: 구현·focused parity evidence는 해결 후보이나 discrepancy status authority와 독립 리뷰 전에는 CLOSED로 승격하지 않는다.
- `P15-M8`: BLOCKED 유지
- `P15-M9`: 실행·manifest 생성과 source-bound 전체 회귀 364건은 완료했다. M8 Critical/High 0, legacy/performance, 독립 clean environment, 동일 환경 10회 NFR, reviewer·R4 gate 전까지 `BLOCKED`를 유지한다.
