# Phase 6 — 탄성해석 엔진 평가 (착수 근거 + 완료 현황)

```yaml
doc: engine-assessment
phase: 6
date: 2026-07-09
updated: 2026-07-13
status: Phase 6 완료 (P6-M0~M6, 마일스톤 테스트 7/7 PASS)
basis: 소스 직접 검토 (src/solver, src/dynamics, src/nonlinear, src/results, src/verification)
```

> **최신 현황(2026-07-13)**: 아래 "착수 등급"은 2026-07-09 Phase 6 착수 시점의 baseline이며, **왜 Phase 6을 했는가의 근거로 보존**한다. Phase 6(WP-00~06)은 이후 전부 구현·검증됐고(`tests/p6-*.mjs` 7종 PASS), 각 표·절에 **현재 상태**를 병기했다. 실행 단계 현황의 단일 출처는 Phase 8의 [IMPLEMENTATION_STATUS.md](../phase8/IMPLEMENTATION_STATUS.md)이며, 정준 식·임계값은 [FORMULAS_AND_CRITERIA.md](FORMULAS_AND_CRITERIA.md)다.

이 문서는 Phase 6 착수 근거를 고정한다. "착수 등급"은 외부 기술 검토 판정을 소스 검토로 재확인한 값이다.

## 1. 등급표 (착수 baseline → 현재)

| 영역 | 착수 등급(2026-07-09) | 현재 상태(2026-07-13) |
| --- | --- | --- |
| 프레임 선형정적해석 | **A−** | 유지 — `linear3dAssembly.js`·`linear3dElement.js`(`localK12`)·`linear3dRecovery.js` |
| 하중조합/포락 | **B+** | **강화** — 전 조합 완전성 + envelope 소스일치 게이트 추가 (`linear3d.js` `buildCombinationCompleteness`, p7-m8) |
| P-Delta | **B− / C+** | **WP-05 완료** — Direct 기하강성 `Kt=Ke+Kg(N)` 배선(`pdelta/tangentStiffness.js`·`secondOrder.js`, p6-m5). legacy 등가하중법은 `comparisonOnly`로 강등·설계차단 |
| 모달/RSA | **B** | **WP-04 완료** — CQC·밑면전단 scaling·질량참여(≥0.9) 게이트·signed 전략(`p6-rsa-diaphragm-story`, p7-m9) |
| THA | **C+** | Phase 8 비선형 트랙으로 이관 — SDOF Newmark는 `legacy-preliminary`, MDOF NLTH는 P8-M8 planned |
| 좌굴 | **B−** | 공용 KG 모듈 `solver/geometricStiffness.js`(`mode:buckling`) 재사용으로 통합. 다중모드 확장은 잔여 |
| 다이어프램 | **B** | **WP-04** — 반강체 load-path force 보고(`semiRigidDiaphragm.js`) |
| 벽체/슬래브 | **C−** | **WP-06 옵션 B 확정** — 등가모델 유지 + 전 결과경로 scope 경고 강제·비허용 결과 미출력, 실 shell FEM 이연 |
| 검증 체계 | **B** | **WP-03 완료** — verification matrix 자동화·회귀표(`p6-verification-matrix`) |
| 대형모델 성능 | **C** | **WP-01 완료** — sparse LDLᵀ + singularity 진단(`solver/sparse/`, threshold 48, pivot 1e-12) |

한 줄 평(착수 시점): **프레임 중심 탄성해석 엔진으로는 A−급이나, 상용급 신뢰를 위해 sparse solver·consistent load·P-Delta 접선강성·검증 자동화·shell scope가 핵심 부족분.**
→ **현재: 5대 부족분 전부 해소(아래 §2). 탄성해석 트랙은 Phase 6으로 상용급 골격 완비, 잔여는 좌굴 다중모드·대형모델 성능 실측.**

## 2. 5대 빈칸 — 소스 확인 결과 (착수 진단)

> **해소 현황(2026-07-13)**: 아래 (1)~(5)는 착수 시점 진단이며 **전부 해소**됐다. (1)→WP-01 `solver/sparse/`, (2)→WP-02 `loads/fixedEnd/`(8종), (3)→WP-06 옵션 B(등가모델 확정·실 FEM 이연), (4)→WP-05 `solver/geometricStiffness.js`+`pdelta/`, (5)→WP-03 `p6-verification-matrix`. 각 항 끝에 완료 표시.

### (1) 선형 solver — dense 가우스소거

`src/solver/linear3dElement.js:13` `solveLinear(A, b)`는 부분피벗 가우스소거이며, 특이 판정은 `Math.abs(M[pivot][c]) < 1e-10` 단일 기준뿐이다. 전역강성행렬은 프레임에서 매우 sparse이므로 DOF가 커지면 메모리·시간이 급증한다. **1,000 DOF 초과 시 체감 병목.**

필요 방향: CSR/CSC 저장 · sparse LDLᵀ/Cholesky · pivoting/regularization 경고 · factorization 재사용 · 다중 RHS(조합 일괄) · near-singular DOF 진단. → **WP-01 ✅ 완료**: `solver/sparse/`(`cscMatrix`·`symbolicFactor`·`ldlt`·`solveSparse`), `solveLinearDetailed`가 `sparseThreshold`(48) 초과 시 sparse 라우팅, pivot 판정은 config `solver.pivotSingular`(1e-12). *(위 착수 진단의 `linear3dElement.js:13`·`<1e-10`은 착수 baseline 값이며 현재 코드와 다름.)*

### (2) 분포하중 — 점하중 분할 전개

`src/solver/elasticExpansion.js`의 `expandDistributed`는 부분등분포/사다리꼴을 `segments`개 점하중으로 쪼갠다. 시각화·근사엔 무방하나, **지점반력·고정단모멘트·부재 중간모멘트가 분할 수에 의존**한다(고정단/연속보/강접골조에서 오차 가시화). `linear3dRecovery.js`에 station 복원은 있으나 fixed-end force 기반이 아니다.

필요 구조: `element load = { 등가절점하중 fe, 고정단력 q0, 복원함수 V(x)/M(x)/N(x)/T(x), handcalc }`. → **WP-02 ✅ 완료**: `loads/fixedEnd/`(udl·udlPartial·trapezoid·pointLoad·memberMoment·settlement·temperature), `fixedEndUniformCoefficients`로 분할수-독립 고정단력.

### (3) shell 요소 — 실 FEM 부재

`src/solver/shell/quad4.js`는 스스로 *"compatible stiffness/benchmark contract before full global assembly … not a certified production shell solver"*라고 명시하고, `expandShellsToFrameLinks`로 프레임 링크화한다. 따라서 벽식 구조·슬래브-벽 상호작용·diaphragm/collector force·개구부 응력은 신뢰 불가.

현 상태: 프레임 해석기 = 가능 / 벽체·슬래브 포함 건물 FEM = 부족. → **WP-06 ✅ 옵션 B 확정**: 등가모델 유지 + 전 결과경로 scope 경고 강제 + 비허용 결과(local stress·punching 등) 미출력, 실 shell FEM은 이연(`p6-equivalent-shell-scope`).

### (4) P-Delta — 간이 2차효과

`src/solver/linear3d.js:394` `analyzePDelta`는 `makePDeltaLoads`로 등가 횡하중을 만들어 `analyzeAll`을 반복하는 **근사 방식**이다. 사용자가 "P-Delta 해석"에 기대하는 `Kt = Ke + Kg(N)`(기하강성/접선강성) 방식이 아니다.

**중요**: WP-05는 KG 행렬을 중복 구현하는 작업이 아니라, 정식화를 공용 모듈로 추출해 탄성 P-Delta 경로로 배선하는 작업이었다. → **WP-05 ✅ 완료**: 공용 기하강성 모듈 `src/solver/geometricStiffness.js`(`assembleGlobalGeometricStiffness`, `mode: tangent|buckling`)로 추출됨 — 좌굴(`dynamics/globalBuckling.js`)과 Direct P-Delta(`pdelta/tangentStiffness.js`가 `Kt=Ke+KG` 조립, `secondOrder.js`)가 **동일 모듈 재사용**. 부호는 인장양수 `Kt=Ke+Kg(N)` 그대로(부호전환 없음). legacy 등가하중 `analyzePDelta`는 잔존하되 `comparisonOnly`·설계차단으로 강등, Direct 경로가 설계 전달 담당(`p6-pdelta-tangent`).

### (5) 검증/벤치마크 자동화 — 계층 부족

`src/verification/benchmarkGate*.js`는 B01–B10(단순보/캔틸레버/부재해제)만 다룬다. 동적·안정성·shell 계층과 reference/tolerance/model-hash/solver-version 회귀표가 없다. → **WP-03 ✅ 완료**: verification matrix 자동화 + `{reference, computed, relError, tolerance, modelHash, solverVersion}` 회귀표(`p6-verification-matrix`).

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
