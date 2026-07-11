# Phase 6 Development Hub — 탄성해석 엔진 상용급 보강

```yaml
phase: 6
status: planning
start: 2026-07-09
mission: 이미 구현된 자체 탄성해석 엔진을 "프레임 중심 MVP"에서 "상용/실무 검토용으로 신뢰할 수 있는 건축구조 탄성해석 엔진"으로 끌어올린다.
scope_owner: 오너 확정 대기
```

> **엔진은 100% 자체 구현이다.** 강성행렬 조립·선형 풀이·모달·RSA·좌굴·corotational 비선형·Newmark NLTH가 `src/solver`·`src/dynamics`·`src/nonlinear`에 직접 작성되어 있고 외부 해석 엔진 의존이 없다(zero-dependency). Phase 6은 새 엔진 도입이 **아니라**, 기존 엔진의 수치 정확도·확장성·검증 신뢰도를 상용급으로 보강하는 작업이다.

---

## Why Phase 6 — 외부 기술 검토 요약

독립 검토 결과, 현재 상태는 **"프레임 중심 건축 탄성해석 엔진"으로는 충분하지만 "건축구조 범용 탄성해석 프로그램"이라 부르기엔 부족**하다는 판정을 받았다. 강점(선형 정적 3D 강성법, 좌표변환/조립/DOF 관리/단력 복원/조합·포락/자중, 해석 전 validation gate + 해석 후 평형 audit, 모달·RSA·THA preliminary·좌굴·P-Delta·다이어프램·인장/압축전용 반복)은 명확하다. 그러나 상용급으로 내놓기엔 **5개의 핵심 빈칸**이 남아 있다.

| # | 핵심 빈칸 | 현재 구현 | Phase 6 목표 |
| --- | --- | --- | --- |
| 1 | **선형 solver** | dense 가우스소거 (`solveLinear`) | CSR/CSC sparse + LDLᵀ/Cholesky, factorization 재사용, singularity 진단 |
| 2 | **분포하중 처리** | 점하중 분할 전개 (`expandDistributed`) | consistent equivalent nodal load + fixed-end force + station 복원식 |
| 3 | **shell 요소** | quad4 = 강성/벤치마크 계약만, 실 FEM 아님 → 프레임 링크 전개 | 실 shell FEM **또는** "등가모델"로 scope 명시 |
| 4 | **P-Delta** | 등가 횡하중 반복법 (`analyzePDelta`) | 기하강성 `Kt = Ke + Kg(N)` 접선강성/2차 해석 |
| 5 | **검증 자동화** | 요소·조립 벤치마크 gate (B01–B10) | 5계층 검증 매트릭스 + reference/tolerance/model-hash 회귀표 |

전체 근거·등급표는 [ENGINE_ASSESSMENT.md](ENGINE_ASSESSMENT.md)에 고정한다.

---

## 이미 구현된 자산 지도 (중복개발 금지)

Phase 6 작업 전, **아래 자산은 재사용/확장 대상이며 중복 구현하지 않는다.** 특히 4번 P-Delta는 기하강성 정식화가 좌굴 경로에 이미 존재하므로, 새 수식을 따로 만드는 작업이 아니라 좌굴 전용 내부 함수를 공용 기하강성 모듈로 추출하고 탄성 P-Delta 경로로 배선하는 작업이다.

| 기능 | 기존 파일 | 상태 | Phase 6에서의 취급 |
| --- | --- | --- | --- |
| 전역강성 조립 | `src/solver/linear3dAssembly.js` (`assembleStiffness3D`) | dense | WP-01: sparse 조립으로 대체/병행 |
| 선형 풀이 | `src/solver/linear3dElement.js:13` (`solveLinear`, Gauss+부분피벗) | dense | WP-01: sparse factorization으로 교체, 인터페이스 유지 |
| 분포/온도/모멘트 하중 전개 | `src/solver/elasticExpansion.js` (`expandDistributed`) | 점하중 분할 | WP-02: consistent load / fixed-end force로 대체 |
| station별 내력 복원 | `src/solver/linear3dRecovery.js` (`recoverMemberStations`) | endForces+spanLoads 기반 | WP-02: fixed-end force 기반으로 정밀화 |
| 평형 audit | `src/solver/analysisAudit.js`, `linear3dPost.js` (`buildEquilibriumSummary`) | 있음 | 회귀 게이트로 유지 |
| 해석 전 검증 gate | `src/core/validation.js` (`validateModel`) | 있음 | WP-01 singularity 진단과 통합 |
| **기하강성 KG 조립** | `src/dynamics/globalBuckling.js` (`buildGlobalGeometricStiffness`) | 있음, **좌굴 전용 내부 함수(export 아님)** | **WP-05: 공용 모듈로 추출 후 탄성 P-Delta 경로에서 재사용** |
| corotational 프레임 | `src/nonlinear/elements/corotationalBeam.js` | 있음 | WP-05: 접선강성 2차 해석 옵션의 기반 |
| Newton-Raphson/arc-length/변위제어 | `src/nonlinear/control/*` | 있음 | WP-05: 반복 스킴 재사용 |
| Newmark/Rayleigh/지반가속도 | `src/nonlinear/dynamics/*` | 있음 | THA 검증(부록)에서 재사용 |
| 모달 solver + 질량참여 | `src/dynamics/modal.js` (`jacobiEigen`, `participation`), `elasticCompleteness.js` | dense Jacobi | WP-04: sparse eigen + residual mass |
| RSA trace / 부호 케이스 | `src/results/rsaTrace.js`, `src/core/signedLateralCases.js` | 있음(우발편심 부호) | WP-04: scaling·story·부호조합 후처리 확장 |
| 다이어프램(강체/반강체) | `src/solver/semiRigidDiaphragm.js`, `diaphragm*`, `src/core/diaphragmGroups.js` | 있음 | WP-04: chord/collector/shear force reporting 보강 |
| 층 결과·질량/강성중심·편심 | `src/results/story*.js`, `storyCenter.js`(중심=기하중심), `src/core/storyMassEccentricity.js`, `storyStiffnessProxy.js`(**proxy**) | 부분/근사 | WP-04: 실제 CoM/CoR·편심으로 정밀화 |
| 인장/압축 전용 반복 | `src/results/unilateralTrace.js` | 있음 | WP-05: 비선형 조합 실행순서 정정 |
| shell 계약/패치테스트 | `src/solver/shell/quad4.js`, `shellAssembly.js`, `wallSlabEquivalent.js`, `expandShellsToFrameLinks` | 계약만(실 FEM 아님) | WP-06: 실 FEM 또는 scope 명시 |
| 요소·조립 벤치마크 gate | `src/verification/benchmarkGate*.js` (B01–B10) | 있음 | WP-03: 5계층 매트릭스로 확장 |

---

## Scope 결정 — WP-06 shell = 등가모델 확정 (오너, 2026-07-09)

**실 shell FEM은 개발하지 않는다. 등가모델(옵션 B)을 유지하고 scope를 전면 명시한다.** 벽체/슬래브는 "등가모델"임을 UI·문서·결과 경로 전부에 표기하고, slab local stress·plate deflection·collector 정밀 force 등은 **보고하지 않는다**. 실 shell FEM은 Nice-to-have로 이연(별도 게이트). 상세 허용/비허용·검증 기준은 [FORMULAS_AND_CRITERIA §6](FORMULAS_AND_CRITERIA.md#6-shell--등가모델-scope-wp-06-옵션-b-확정)·[WP-06](workpackages/WP-06-shell-scope.md).

---

## 문서 지도

| 문서 | 내용 |
| --- | --- |
| [ENGINE_ASSESSMENT.md](ENGINE_ASSESSMENT.md) | 현재 엔진 등급표·빈칸 근거·기존 자산 정밀 매핑 |
| [FORMULAS_AND_CRITERIA.md](FORMULAS_AND_CRITERIA.md) | **정준 식·판정 임계값·Config 레지스트리** (WP 공통 인용) |
| [ROADMAP.md](ROADMAP.md) | P6-M0~M6 마일스톤·수용 게이트·코드리뷰 체크포인트 |
| [MILESTONE_EXECUTION_PLAN.md](MILESTONE_EXECUTION_PLAN.md) | P6-M0~M6 단계별 작업 분류, batch 순서, 완료 조건 |
| [VERIFICATION_MATRIX.md](VERIFICATION_MATRIX.md) | 5계층 검증 테스트 매트릭스 + 회귀표 스키마 |
| [workpackages/WP-00-analysis-criteria.md](workpackages/WP-00-analysis-criteria.md) | `analysisCriteria` registry, preset, fallback, resolver |
| [workpackages/WP-01-sparse-solver.md](workpackages/WP-01-sparse-solver.md) | sparse solver + singularity 진단 |
| [workpackages/WP-02-consistent-loads.md](workpackages/WP-02-consistent-loads.md) | consistent load / fixed-end force |
| [workpackages/WP-03-benchmark-suite.md](workpackages/WP-03-benchmark-suite.md) | 회귀 벤치마크 자동화 |
| [workpackages/WP-04-rsa-diaphragm-story.md](workpackages/WP-04-rsa-diaphragm-story.md) | RSA 후처리·다이어프램 force·층 결과 |
| [workpackages/WP-05-pdelta-tangent.md](workpackages/WP-05-pdelta-tangent.md) | 기하강성 P-Delta·비선형 조합 실행 |
| [workpackages/WP-06-shell-scope.md](workpackages/WP-06-shell-scope.md) | shell FEM 또는 등가모델 scope |

---

## 공통 개발 규칙 (모든 WP 공통)

1. **모듈 크기**: 기존 solver의 마이크로 모듈 관례를 따른다(`diaphragmRows.js` 7줄 등). **새 모듈은 단일 책임 원칙, 공개 함수 본문은 가능하면 1000자 이내**로 작성하고, 초과 시 파일을 분할한다(`*Cases.js`/`*RunCase.js`/`*Rows.js` 패턴). 큰 함수 하나보다 작은 순수함수 여러 개를 선호한다.
2. **zero-dependency 유지**: sparse solver 포함 어떤 것도 node_modules를 추가하지 않는다(`desktop/`만 예외). 필요한 수치 알고리즘은 자체 구현한다.
3. **인터페이스 하위호환**: `solveLinear`·`analyzeModel`·`analyzePDelta` 등 공개 API의 반환 계약은 유지하고, 내부 구현만 교체한다. 계약 변경 시 `src/core/*Contract.js`에 명시.
4. **단계별 코드리뷰 필수**: 각 WP는 착수 → 구현 → **`/code-review high`** → 수정 → **검증표 갱신** 순서로 진행하고, 리뷰 통과 전 다음 WP로 넘어가지 않는다. 리뷰 결과는 해당 WP 문서 하단 "Review Log"에 기록.
5. **회귀 테스트 조건**: `npm test`(현재 148 스위트) green 유지가 merge 조건. 신규 기능은 반드시 [VERIFICATION_MATRIX.md](VERIFICATION_MATRIX.md)의 대응 테스트를 추가한다.
6. **한계 정직 표기**: 근사·proxy·미구현은 결과 객체의 `limitations`/`warnings` 필드와 UI에 반드시 노출한다(현행 `quad4.limitations` 관례 유지).
7. **임계값은 config로**: 모든 tolerance·경고 한계·설계기준 계수(RSA 방향계수·우발편심 α·P-Delta θ·층간변위 등)는 소스에 하드코딩하지 않고 [FORMULAS_AND_CRITERIA.md의 Config 레지스트리](FORMULAS_AND_CRITERIA.md#config-레지스트리)(`analysisCriteria` 네임스페이스)로 뺀다. 기준셋(KDS/ASCE/Eurocode) preset으로 교체 가능해야 하며, 하드코딩 PR은 코드리뷰에서 반려한다. 정준 식·판정 기준은 모두 [FORMULAS_AND_CRITERIA.md](FORMULAS_AND_CRITERIA.md)를 단일 출처로 삼는다.
