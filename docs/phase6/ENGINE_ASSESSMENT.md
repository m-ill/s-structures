# Phase 6 — 현재 탄성해석 엔진 평가

```yaml
doc: engine-assessment
phase: 6
date: 2026-07-09
basis: 소스 직접 검토 (src/solver, src/dynamics, src/nonlinear, src/results, src/verification)
```

이 문서는 Phase 6 착수 근거를 고정한다. 등급은 외부 기술 검토 판정을 소스 검토로 재확인한 값이다.

## 1. 현재 등급표

| 영역 | 등급 | 근거 (파일) |
| --- | --- | --- |
| 프레임 선형정적해석 | **A−** | `linear3dAssembly.js`, `linear3dElement.js`, `linear3dRecovery.js` — 3D 강성법·좌표변환·조립·DOF·단력복원 완비 |
| 하중조합/포락 | **B+** | `core/combinations.js`, `linear3dPost.js`(`makeEnvelope`), `results/combinationEnvelope*.js` |
| P-Delta | **B− / C+** | `linear3d.js:394` `analyzePDelta` — **등가 횡하중 반복법(근사)**, 기하강성 미사용. 명시 필요 |
| 모달/RSA | **B** | `dynamics/modal.js`(dense Jacobi + participation), `results/rsaTrace.js` — SRSS/CQC 있으나 후처리 부족 |
| THA | **C+** | `nonlinear/dynamics/newmark.js`,`rayleigh.js`,`groundMotion.js` — preliminary 수준 |
| 좌굴 | **B−** | `dynamics/globalBuckling.js` — KG 조립 + inverse iteration, **최저모드 1개** |
| 다이어프램 | **B** | `solver/semiRigidDiaphragm.js`, `diaphragm*` — 축약/등가가새 있으나 force reporting 부족 |
| 벽체/슬래브 | **C−** | `solver/shell/quad4.js` — **실 shell FEM 아님**, 프레임 링크 전개 |
| 검증 체계 | **B** | `verification/benchmarkGate*.js`(B01–B10) — 요소·조립 계층만 |
| 대형모델 성능 | **C** | `linear3dElement.js:13` `solveLinear` — **dense 가우스소거** 병목 |

한 줄 평: **프레임 중심 탄성해석 엔진으로는 A−급이나, 상용급 신뢰를 위해 sparse solver·consistent load·P-Delta 접선강성·검증 자동화·shell scope가 핵심 부족분.**

## 2. 5대 빈칸 — 소스 확인 결과

### (1) 선형 solver — dense 가우스소거

`src/solver/linear3dElement.js:13` `solveLinear(A, b)`는 부분피벗 가우스소거이며, 특이 판정은 `Math.abs(M[pivot][c]) < 1e-10` 단일 기준뿐이다. 전역강성행렬은 프레임에서 매우 sparse이므로 DOF가 커지면 메모리·시간이 급증한다. **1,000 DOF 초과 시 체감 병목.**

필요 방향: CSR/CSC 저장 · sparse LDLᵀ/Cholesky · pivoting/regularization 경고 · factorization 재사용 · 다중 RHS(조합 일괄) · near-singular DOF 진단. → **WP-01**

### (2) 분포하중 — 점하중 분할 전개

`src/solver/elasticExpansion.js`의 `expandDistributed`는 부분등분포/사다리꼴을 `segments`개 점하중으로 쪼갠다. 시각화·근사엔 무방하나, **지점반력·고정단모멘트·부재 중간모멘트가 분할 수에 의존**한다(고정단/연속보/강접골조에서 오차 가시화). `linear3dRecovery.js`에 station 복원은 있으나 fixed-end force 기반이 아니다.

필요 구조: `element load = { 등가절점하중 fe, 고정단력 q0, 복원함수 V(x)/M(x)/N(x)/T(x), handcalc }`. → **WP-02**

### (3) shell 요소 — 실 FEM 부재

`src/solver/shell/quad4.js`는 스스로 *"compatible stiffness/benchmark contract before full global assembly … not a certified production shell solver"*라고 명시하고, `expandShellsToFrameLinks`로 프레임 링크화한다. 따라서 벽식 구조·슬래브-벽 상호작용·diaphragm/collector force·개구부 응력은 신뢰 불가.

현 상태: 프레임 해석기 = 가능 / 벽체·슬래브 포함 건물 FEM = 부족. → **WP-06 (scope 결정)**

### (4) P-Delta — 간이 2차효과

`src/solver/linear3d.js:394` `analyzePDelta`는 `makePDeltaLoads`로 등가 횡하중을 만들어 `analyzeAll`을 반복하는 **근사 방식**이다. 사용자가 "P-Delta 해석"에 기대하는 `Kt = Ke + Kg(N)`(기하강성/접선강성) 방식이 아니다.

**중요**: 기하강성 정식화 `buildGlobalGeometricStiffness`가 `src/dynamics/globalBuckling.js`에 **이미 존재**하나 현재는 좌굴 전용 내부 함수다. WP-05는 같은 KG 행렬을 중복 구현하는 작업이 아니라, 이 정식화와 테스트를 공용 기하강성 모듈로 추출한 뒤 탄성 P-Delta 경로로 배선 + corotational(`nonlinear/elements/corotationalBeam.js`)·NR(`nonlinear/control/*`) 재사용을 정리하는 작업이다. 현 구현은 `현재: iterative equivalent lateral load P-Delta approximation`으로 명시하고 `향후: geometric stiffness second-order`로 확장. P-Δ / P-δ 구분 옵션 포함. → **WP-05**

### (5) 검증/벤치마크 자동화 — 계층 부족

`src/verification/benchmarkGate*.js`는 B01–B10(단순보/캔틸레버/부재해제)만 다룬다. 동적·안정성·shell 계층과 reference/tolerance/model-hash/solver-version 회귀표가 없다. → **WP-03**

## 3. 부수 보완 포인트 (WP-04에 통합)

- **RSA 후처리**: 질량참여율 자동체크(`elasticCompleteness.js` 일부 존재), residual mass, 밑면전단 scaling, X/Y 방향조합(SRSS/100·30/CQC3), 우발/다이어프램 편심, **부호 문제**(SRSS/CQC는 부호 소실 → 설계조합 `1.2D+1.0E+0.5L`에서 signed dominant mode 또는 ELF 부호 전략 필요, `signedLateralCases.js` 확장), story shear/drift/overturning, gravity 조합 envelope.
- **다이어프램 force**: 강체는 membrane force 미보고가 정상, 반강체만 chord/shear/collector 보고. CoM/CoR/편심(현 `storyCenter.js`=기하중심, `storyStiffnessProxy.js`=proxy → 실제값으로 정밀화).
- **좌굴 다중모드**: 최소 5~10 모드, shift-invert, mode normalization, pre-load별 KG, tension member KG 부호. → WP-05 부록.
- **모달 solver**: dense Jacobi → sparse Lanczos/subspace, mass normalization, rigid-body/near-zero mode 경고. → WP-04.
- **인장/압축 전용 조합**: `unilateralTrace.js` 존재하나 **비선형 load case는 조합 후 선형중첩 금지** — `F = 1.2D+1.6L+1.0W` 전체로 iteration 수행하도록 Analysis Center 실행구조 정정. → WP-05.

## 4. Must / Should / Nice 분류

**Must-have (Phase 6 본체)**: sparse solver · consistent element load · fixed-end 기반 부재력 복원 · end release/partial fixity/rigid offset 안정화 · MPC/rigid link/diaphragm constraint 통합 · singularity 원인추적 · condition number/pivot 경고 · 단위계 검증 · local axis 자동검증 · regression suite.

**Should-have (Phase 6 선택 편입)**: 층별 결과(drift/shear/overturning) · CoM/CoR/편심률 · accidental torsion · diaphragm force reporting · stiffness/cracked modifier · foundation/soil spring · compression-only support/uplift · 자동 조합 템플릿 · 계산서 trace.

**Nice-to-have (Phase 6+ 이연)**: 실 shell FEM · construction stage · moving load · cable/sag · geometric nonlinear corotational frame(범용) · ground motion scaling · damping/link device · pushover 확장 · NLTH 확장.
