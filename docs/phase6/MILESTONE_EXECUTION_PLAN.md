# Phase 6 Milestone Execution Plan

```yaml
doc: milestone-execution-plan
phase: 6
status: active implementation breakdown
source: ROADMAP.md, FORMULAS_AND_CRITERIA.md, workpackages/WP-00~06
```

## Execution Strategy

Phase 6는 기능을 많이 붙이는 단계가 아니라, 이미 있는 자체 해석 엔진을 실무 검토용 신뢰도로 끌어올리는 단계다. 따라서 각 마일스톤은 아래 순서를 따른다.

```text
criteria fixed
-> numerical kernel
-> load/recovery accuracy
-> verification gate
-> design postprocessing
-> second-order stability
-> scope honesty
```

권장 진행 순서:

```text
P6-M0
  -> P6-M1
  -> P6-M2
  -> P6-M3
  -> P6-M4 and P6-M5
  -> P6-M6 final scope gate
```

P6-M6는 문서/표시 작업 일부를 먼저 진행할 수 있지만, 최종 통과는 P6-M3 검증 체계 이후로 둔다.

## Milestone Dependency Map

| Milestone | Name | Depends on | Can run in parallel with | Blocks |
| --- | --- | --- | --- | --- |
| P6-M0 | Analysis Criteria Registry | none | none | all Phase 6 WPs |
| P6-M1 | Sparse Solver + Singularity | M0 | none | M2, M3, M4, M5 scale work |
| P6-M2 | Consistent Loads / Fixed-End Force | M0, M1 | none | M3 element/assembly verification |
| P6-M3 | Regression Benchmark Suite | M0, M1, M2 | M6 scope text draft | M4/M5 completion gates |
| P6-M4 | RSA / Diaphragm / Story Results | M0, M3 | M5 | final elastic design postprocessing |
| P6-M5 | P-Delta Tangent / Nonlinear Combo | M0, M3 | M4 | second-order stability output |
| P6-M6 | Equivalent Shell Scope | M0, M3 for final gate | M1~M5 documentation updates | final-use honesty gate |

## P6-M0 — Analysis Criteria Registry

Goal: 모든 임계값과 설계기준별 계수를 `analysisCriteria`로 통일한다.

| Step | Task | Files | Done when |
| --- | --- | --- | --- |
| M0-1 | criteria schema 추가 | `src/core/schema.js`, `src/core/model.js` | `model.analysisCriteria` 저장/복원 가능 |
| M0-2 | resolver 구현 | `src/core/analysisCriteria.js` | `resolveCriterion(model, key)` 단일 진입점 제공 |
| M0-3 | preset/override merge | `src/core/analysisCriteria.js` | `kds/asce/eurocode/custom` 구조와 project override 적용 |
| M0-4 | legacy fallback | `src/core/analysisCriteria.js` | 기존 `analysisSettings.*` 값이 trace에 `legacyFallback`으로 기록 |
| M0-5 | validation | `src/core/validation.js` | unknown key, wrong type, out-of-range warning |
| M0-6 | tests/docs | `tests/p6-analysis-criteria.mjs` | `FORMULAS_AND_CRITERIA.md`의 모든 key가 테스트됨 |

Gate:

- `analysisCriteria` 없는 기존 모델이 계속 실행된다.
- Phase 6 WP가 직접 하드코딩한 threshold를 읽지 않는다.
- 보고서/agent trace가 resolved criteria source를 보여줄 수 있다.

## P6-M1 — Sparse Solver + Singularity

Goal: dense solver 병목과 특이성 진단 부족을 해결한다.

| Step | Task | Files | Done when |
| --- | --- | --- | --- |
| M1-1 | sparse matrix storage | `src/solver/sparse/cscMatrix.js` | COO triplet -> CSR/CSC 변환 |
| M1-2 | sparse assembly adapter | `src/solver/linear3dAssembly.js` | dense/sparse 조립 결과 상호검증 가능 |
| M1-3 | symbolic ordering | `src/solver/sparse/symbolicFactor.js` | ordering/fill-in trace 산출 |
| M1-4 | numeric factorization | `src/solver/sparse/ldlt.js` | sparse LDLT/Cholesky solve 가능 |
| M1-5 | solve facade | `src/solver/sparse/solveSparse.js`, `linear3dElement.js` | `solveLinear(A,b)` 계약 유지 |
| M1-6 | diagnostics | `src/solver/sparse/diagnostics.js`, `src/core/validation.js` | pivot/condition/mechanism DOF warning |
| M1-7 | performance gate | `tests/p6-sparse-solver.mjs` | B01~B10 + 5,000 DOF benchmark 로그 |

Gate:

- small benchmark에서 dense=sparse 상대오차 기준 통과.
- near-singular 모델이 원인 DOF를 보고한다.
- 다중 RHS 조합 풀이가 조합별 풀이와 일치한다.

## P6-M2 — Consistent Loads / Fixed-End Force

Goal: 분포하중 점하중 분할 근사를 요소 fixed-end force 기반으로 교체한다.

| Step | Task | Files | Done when |
| --- | --- | --- | --- |
| M2-1 | element load contract | `src/loads/fixedEnd/index.js` | `{fe, q0, recovery, handcalc}` 계약 고정 |
| M2-2 | basic load types | `udl.js`, `pointLoad.js`, `memberMoment.js` | UDL/집중/모멘트 폐형식 통과 |
| M2-3 | advanced load types | `udlPartial.js`, `trapezoid.js`, `temperature.js`, `settlement.js` | 부분UDL/사다리꼴/온도/침하 통과 |
| M2-4 | assembly integration | `src/solver/elasticExpansion.js`, `linear3dAssembly.js` | `fe`가 전역 하중에 정확히 반영 |
| M2-5 | recovery integration | `src/solver/linear3dRecovery.js` | station `V/M/N/T`가 `q0` 기반 복원 |
| M2-6 | regression tests | `tests/p6-consistent-loads.mjs` | fixed-fixed UDL, trapezoid, continuous beam 통과 |

Gate:

- 분포하중 결과가 분할 수와 무관하다.
- 고정단보 반력/고정단모멘트가 이론값과 일치한다.
- 기존 station 결과 UI/API 계약이 깨지지 않는다.

## P6-M3 — Regression Benchmark Suite

Goal: 결과가 “나온다”와 “맞다”를 분리하는 자동 검증 체계를 만든다.

| Step | Task | Files | Done when |
| --- | --- | --- | --- |
| M3-1 | record schema | `src/verification/matrix/record.js` | `{caseId, reference, computed, relError, tolerance, modelHash, solverVersion, status}` |
| M3-2 | element/assembly cases | `elementCases.js`, `assemblyCases.js` | E01~E11, A01~A06 등록 |
| M3-3 | dynamic/stability cases | `dynamicCases.js`, `stabilityCases.js` | D01~D06, S01~S05 등록 |
| M3-4 | runner | `src/verification/matrix/runner.js` | tolerance 초과 시 fail |
| M3-5 | CI test | `tests/p6-verification-matrix.mjs` | `npm test`에 통합 |
| M3-6 | diff/report | `verification/evidence/validation/` | modelHash/solverVersion 변경 diff 산출 |

Gate:

- 모든 신규 기능 PR은 같은 PR에서 verification matrix case를 추가한다.
- reference source가 각 case에 명시된다.
- tolerance는 `analysisCriteria`를 통해 읽힌다.

## P6-M4 — RSA / Diaphragm / Story Results

Goal: modal/RSA 결과를 설계 검토용 story/result 흐름으로 완성한다.

| Step | Task | Files | Done when |
| --- | --- | --- | --- |
| M4-1 | modal sparse eigen | `src/dynamics/eigen/lanczos.js` | sparse generalized eigen trace |
| M4-2 | mass participation | `src/results/rsa/massParticipation.js` | 누적 질량참여율과 residual mass warning |
| M4-3 | RSA scaling | `src/results/rsa/baseShearScale.js` | base shear scaling trace |
| M4-4 | direction/sign strategy | `src/results/rsa/directional.js`, `signedResponse.js` | SRSS/CQC 부호 소실 경고와 signed strategy |
| M4-5 | story results | `src/results/story/drift.js`, `shear.js`, `overturning.js` | story drift/shear/OTM rows |
| M4-6 | centers/torsion | `src/results/story/centers.js` | 실 CoM/CoR/eccentricity |
| M4-7 | diaphragm load path | `src/results/diaphragm/forces.js` | 반강체 diaphragm load-path force, shell/local design warning |
| M4-8 | UI/report/API | `src/ui/`, `src/report/`, agent API | result trace와 warning 노출 |

Gate:

- RSA one-mode exact, CQC close-mode 통과.
- 질량참여율 부족은 warning으로 노출된다.
- RSA 부재력은 signed design combination이 아니라는 경고가 UI/report/API에 남는다.

## P6-M5 — P-Delta Tangent / Nonlinear Combo

Goal: 등가 횡하중 반복법과 별개로 기하강성 직접 2차해석 경로를 만든다.

| Step | Task | Files | Done when |
| --- | --- | --- | --- |
| M5-1 | KG extraction | `src/solver/geometricStiffness.js`, `src/dynamics/globalBuckling.js` | 좌굴 KG 정식화가 공용 모듈로 추출 |
| M5-2 | sign adapter | `src/solver/geometricStiffness.js` | tension-positive `N`으로 `Kt=Ke+Kg(N)` 조립 |
| M5-3 | tangent assembly | `src/solver/pdelta/tangentStiffness.js` | direct-analysis tangent matrix trace |
| M5-4 | second-order solver | `src/solver/pdelta/secondOrder.js` | load step별 축력 갱신 + NR/modified NR |
| M5-5 | nonlinear combo guard | `src/solver/nonlinearCombo.js` | 조합 후 선형중첩 차단 |
| M5-6 | P-Delta split | `src/solver/pdelta/split.js` | P-Δ/P-δ 구분 옵션과 표시 |
| M5-7 | design/report/API | `src/results/pDeltaTrace.js`, `src/report/`, `src/ui/` | final direct result가 story/member design summary로 노출 |
| M5-8 | benchmarks | `tests/p6-pdelta-tangent.mjs` | S01~S05 통과 |

Gate:

- `Kt=Ke+Kg(N)` 부호 테스트 통과.
- P-Delta cantilever/sway frame 이론값 수렴.
- 좌굴 λcr와 P-Delta 증폭이 일관된다.
- equivalent-load P-Delta와 direct-analysis P-Delta가 명확히 구분된다.

## P6-M6 — Equivalent Shell Scope

Goal: 실 shell FEM을 개발하지 않는 대신 등가모델 범위와 금지 결과를 전면 명시한다.

| Step | Task | Files | Done when |
| --- | --- | --- | --- |
| M6-1 | scope helper | `src/solver/shell/equivalentScope.js` | 허용/비허용 플래그와 경고 문자열 |
| M6-2 | result warnings | wall/slab result paths | 모든 벽/슬래브 결과에 등가모델 warning |
| M6-3 | forbidden fields guard | result/report serializers | local stress/plate deflection/shell precision force 미출력 |
| M6-4 | UI badges | result panel/report | equivalent model badge 표시 |
| M6-5 | equivalent validation | `tests/p6-equivalent-shell-scope.mjs` | global drift/shear/base moment tolerance 검증 |
| M6-6 | manual/status | `docs/user-manual/STATUS_AND_LIMITS.md` | 사용자 문서에 scope 명시 |

Gate:

- 실 shell FEM처럼 보이는 결과가 출력되지 않는다.
- 등가모델 warning 커버리지가 테스트로 강제된다.
- shell/local 정밀설계용 collector/chord force는 금지되고, WP-04 diaphragm load-path force와 구분된다.

## Recommended Build Batches

작업을 너무 크게 잡지 않기 위해 아래 단위로 끊는다.

| Batch | Scope | Expected result |
| --- | --- | --- |
| B0 | M0 only | criteria resolver + migration + tests |
| B1 | M1 core | sparse storage/factorization + dense fallback |
| B2 | M1 diagnostics | singularity report + validation integration |
| B3 | M2 load contract | `fe/q0/recovery` contract + UDL/point |
| B4 | M2 full loads | trapezoid/temperature/settlement + station recovery |
| B5 | M3 runner | record schema + E/A cases |
| B6 | M3 expansion | dynamic/stability cases + CI gate |
| B7 | M4 RSA | modal/RSA scaling/sign/story trace |
| B8 | M4 diaphragm/story | CoM/CoR + diaphragm load-path reporting |
| B9 | M5 KG | common KG module + sign tests |
| B10 | M5 direct solve | tangent solver + nonlinear combo guard |
| B11 | M5 output | UI/report/API + benchmark gates |
| B12 | M6 scope | equivalent shell warnings + forbidden fields |

Each batch ends with:

```text
implementation
-> targeted tests
-> docs update if public behavior changed
-> review log entry in the relevant WP
```
