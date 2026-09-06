# Phase 8 Requirements Traceability

```yaml
document_status: governing
requirements_source: PRODUCTION_REQUIREMENTS.md
milestones_source: MILESTONE_EXECUTION_PLAN.md
verification_source: VERIFICATION_MATRIX.md
status: active
```

## 1. 추적 규칙

모든 production 요구사항은 다음 연결을 가져야 한다.

```text
Requirement
  -> Milestone
  -> Code owner/module boundary
  -> Verification IDs
  -> Evidence artifacts
  -> Release qualification
```

연결이 하나라도 없으면 요구사항 상태는 `uncovered`이며 해당 release는 완료될 수 없다.

## 2. 요구사항군 추적표

| 요구사항 | 마일스톤 | 주요 코드영역 | 검증군 | 필수 증거 |
| --- | --- | --- | --- | --- |
| P8-FR-MDL-01~08 | M0, M1, M9 | `src/solver/domain`, schema/migration, modeling transaction | DOM, MEI-01~08, INT | domain manifest, hash diff, migration report |
| P8-FR-PROP-01~08 | M0, M4, M6, M9 | material/section/nonlinear property registry | HNG, FIB, PMM, MEI-06~07 | property snapshot, source, calibration, geometry cross-check |
| P8-FR-CASE-01~08 | M0, M1, M5, M8, M9 | analysis case v2, state refs, dependency DAG | GOV, STATE, MEI-09~17 | case graph, predecessor records, stale tests |
| P8-FR-SOL-01~10 | M1, M2, M3, M7, M8 | element contract, assembler, Newton, controls, state store | STATE, EQ, CTRL, COR, ARC, DYN | residual/tangent logs, finite-difference evidence, rollback snapshots |
| P8-FR-ANA-01~08 | M5, M7, M8, M9 | gravity, Pushover, NLTH workflows | PUSH, ARC, DYN, INT, MEI | capacity/history/energy/reference comparison |
| P8-FR-RES-01~08 | M8, M9, M10 | recovery, dimensions, chunk store, UI/report/API | INT, UI, API, MEI-18~20, PERF-14~15 | result manifest, chunk hashes, UI/report parity |
| P8-NFR-01~12 | M2, M8, M10, M11 | worker, WASM backend, cache, checkpoint, release tooling | PERF-01~16, API, PILOT | performance profile, crash/cancel/restart evidence |

## 3. 마일스톤 산출물 추적

| 마일스톤 | 입력계약 | 산출물 | 다음 단계 gate |
| --- | --- | --- | --- |
| P8-M0 | Phase 7 schema/cases/run records, current legacy nonlinear | schema v5 contract, feature catalog, source register, test runner, workloads | migration/GOV pass |
| P8-M1 | schema v5, Phase 7 domain utilities | canonical domain, hashes, constraints, committed/trial state | DOM/STATE/MEI-01~08 pass |
| P8-M2 | element contract와 domain | MDOF residual/tangent Newton, worker/WASM sparse backend | EQ/CTRL-01~04 pass |
| P8-M3 | MDOF core | 3D corotational frame/truss | COR pass, Phase 7 linear limit pass |
| P8-M4 | corotational element, property registry | concentrated hinge/history/assignment | HNG pass |
| P8-M5 | hinge, gravity case DAG | formal displacement-control Pushover | PUSH/CTRL/MEI-09~15 pass |
| P8-M6 | material/section/reinforcement source | PMM, fiber section, distributed-plasticity path | FIB/PMM pass |
| P8-M6.1 | M6 PMM numerical contract, M2 Worker protocol | envelope preprocessor, validated persistent cache, progress/cancel/stale guard | PMM-09~14 pass |
| P8-M7 | Pushover/fiber | arc-length, post-peak, cyclic static | ARC/CYC pass |
| P8-M8 | static state kernel, mass domain | MDOF direct-integration NLTH | DYN pass, performance baseline |
| P8-M9 | all solver paths | canonical capability matrix, support spring/settlement, integrated recovery, origin/stale/run-record guard | INT-01~16 and MEI-01~20 pass; `p8-m9-integration-recovery.json` |
| P8-M10 | qualified result contracts | production UI/report/agent/MCP, job lifecycle, raw/downsample result access | UI/API pass; `p8-m10-ui-api.json`, ADR-011 |
| P8-M11 | integrated product | independent references, measured WASM/Worker performance, five reproducible pilots, numerical comparison contract, release manifest | implementation complete; Q0 candidate, Q1/Q4/Q5 blocked |

P8-M7 구현 증거는 `verification/evidence/validation/phase8/p8-m7-arc-cyclic.json`에 고정한다. `NL-ARC-01~10`, `NL-CYC-01~06`은 `implemented/candidate` 범위를 충족하며, 외부 상용 비교와 pilot 전에는 `verified` 또는 설계전달 가능 상태로 승격하지 않는다. GPU는 backend 정책 requirement만 covered이며 실제 가속 kernel은 uncovered가 아니라 후속 성능 범위로 명시적으로 제외한다.

## 4. 필수 Architecture Decision Records

| ADR | 결정 | 완료시점 | 검증 영향 |
| --- | --- | --- | --- |
| P8-ADR-001 | canonical analysis domain과 hash 경계 | M1 전 | DOM, MEI |
| P8-ADR-002 | finite 3D rotation parameterization과 corotational formulation | M3 전 | COR |
| P8-ADR-003 | concentrated hinge의 series compatibility와 regularization | M4 전 | HNG |
| P8-ADR-004 | distributed-plasticity element formulation과 integration rule | M6 전 | FIB, PMM |
| P8-ADR-005 | SPD/indefinite WASM sparse backend와 license | M2 전 | EQ, PERF |
| P8-ADR-006 | committed/trial storage, branch, checkpoint format | M1 전 | STATE, DYN |
| P8-ADR-007 | displacement/arc-length augmented solve와 branch policy | M5/M7 전 | CTRL, ARC |
| P8-ADR-008 | Newmark parameters, damping stiffness source, substep policy | M8 전 | DYN |
| P8-ADR-009 | model integration capability, result origin, granular stale and design-transfer policy | M9 완료 | INT, MEI |
| P8-ADR-010 | qualification registry와 design-transfer policy | M0 전 | GOV, MEI-20 |
| P8-ADR-011 | production workflow, async job, result slice/report와 automation parity | M10 완료 | UI, API |
| P8-ADR-012 | independent evidence, numerical comparison, pilot qualification과 fail-closed release manifest | M11 완료 | PERF, PILOT, Q1~Q5 |

ADR에는 후보안, 선택, 기각 이유, 수치·성능 영향, migration 영향, 재검토 조건을 기록한다.

## 5. Requirement 상태

| 상태 | 의미 |
| --- | --- |
| planned | 문서와 검증 ID가 있음 |
| test-defined | 실패하는 verification fixture가 있음 |
| implemented | code path가 존재 |
| verified | required evidence가 통과 |
| pilot-qualified | 지정 pilot과 독립 검토 통과 |
| released | release manifest에 포함 |
| blocked | dependency 또는 source가 없어 중단 |
| uncovered | milestone/code/test/evidence 연결 중 하나가 없음 |

`implemented`에서 `verified`로 자동 승격하지 않는다.

## 6. Evidence 디렉터리

```text
verification/specs/phase8/
  governance/
  domain-state/
  equilibrium-control/
  elements/
  hinges-fiber/
  pushover/
  nlth/
  modeling-elastic-integration/
  performance/
  ui-api/
  pilots/
  release-manifest.json
```

각 evidence는 `VERIFICATION_MATRIX.md`의 schema와 model/domain/case/solver/source hash를 가진다.

## 7. 변경관리

- 요구사항 변경은 관련 milestone, verification, UI/report, source 문서를 같은 변경으로 갱신한다.
- supported scope를 넓히면 capability matrix, unsupported tests, performance workload를 함께 추가한다.
- solver formulation을 바꾸면 기존 evidence를 재사용하지 않고 affected ID를 stale 처리한다.
- tolerance 완화는 기준해, 오차원인, 영향범위, 승인자를 evidence에 기록한다.
- performance target 완화로 Q4/Q5를 유지할 수 없다. release scope 또는 qualification을 낮춘다.
- Phase 7 모델 schema와 elastic result를 바꾸면 MEI와 전체 선형극한 regression을 다시 실행한다.

## 8. 최종 coverage gate

- P8-FR/P8-NFR requirement coverage 100%
- required verification pass 100%
- required ADR accepted 100%
- evidence integrity/hash pass 100%
- uncovered requirement 0
- blocked requirement가 P8-S1 범위에 0
- scope 밖 항목은 product UI/report에서 `unsupported`로 일치
