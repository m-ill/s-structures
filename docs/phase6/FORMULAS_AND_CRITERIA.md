# Phase 6 — 핵심 식 · 판정 기준 · Config 레지스트리

```yaml
doc: formulas-and-criteria
phase: 6
date: 2026-07-09
status: canonical reference (WP-01~06 공통 인용)
```

이 문서는 Phase 6 각 WP가 구현해야 할 **정준 식**과 **합격/경고 임계값**을 한 곳에 고정한다. 각 WP 문서는 여기 §를 인용하고, 코드는 아래 [Config 레지스트리](#config-레지스트리)의 키로 임계값을 읽는다.

> **원칙 1 — 임계값은 전부 config로.** RSA·P-Delta·층간변위·우발편심·수렴 tolerance 등은 KDS/ASCE/Eurocode 등 **설계기준별로 바뀌는 값**이므로 소스에 하드코딩하지 않는다. 현재 코드는 `model.analysisSettings.*`에 흩어진 하드코딩 기본값(예: `pDeltaThetaLimit` 기본 0.25)을 쓰는데, Phase 6은 이를 **단일 `analysisCriteria` 네임스페이스**로 모으고 기준셋(standard preset)으로 교체 가능하게 한다.
>
> **원칙 2 — 부호규약 단일화.** `src/core/signConvention.js`의 `SIGN_CONVENTION`은 **축력 인장 양수(P axial tension positive)**다. 모든 신규 식(특히 기하강성 §5)은 이 규약 하나로 통일한다.

---

## §0. 공통 — 전역 평형과 좌표변환

```text
K u = F
[ Kff Kfc ][ uf ] = [ Ff ]      Kff uf = Ff − Kfc uc
[ Kcf Kcc ][ uc ]   [ Fc ]      Rc = Kcf uf + Kcc uc − Fc
```

부재 좌표변환 / 단력 복원:
```text
kglobal = Tᵀ klocal T,   fglobal = Tᵀ flocal,   ulocal = T uglobal
q_local = k_local u_local − f_eq        (consistent load 규약, §2와 통일)
```
현행 자산: `src/solver/linear3dElement.js`(`localK12`,`memberAxes`), `linear3dAssembly.js`(`assembleStiffness3D`), `linear3dRecovery.js`.

---

## §1. Sparse Solver + 특이성 진단 (WP-01)

**선형계 / 검사식**
```text
Kff uf = Ff',   Ff' = Ff − Kfc uc
대칭성:  e_sym = ‖K − Kᵀ‖∞ / max(‖K‖∞, 1)
잔차:    r = Kff uf − Ff',  e_res = ‖r‖₂ / max(‖Ff'‖₂, ‖Kff‖₂‖uf‖₂, 1)
조건수:  κ(K) = ‖K‖ ‖K⁻¹‖
기구모드: ‖Kq‖/‖q‖ < tol → null/mechanism
분해:    Pᵀ K P = L D Lᵀ  (SPD면 K = L Lᵀ)
```

**저장/ordering/solver**: assembly=COO triplet → solve=CSR/CSC · ordering=AMD/COLAMD(기본) · 1차 sparse LDLᵀ/Cholesky, 불안정 시 sparse LU fallback.

**판정 임계값** (config: `criteria.solver.*`)

| 지표 | 정상 | 경고 | 강경고/실패 |
| --- | --- | --- | --- |
| `e_sym` | <1e-10 | 1e-10~1e-8 | >1e-8 (조립/좌표변환 의심) |
| `e_res` | <1e-8 | 1e-8~1e-6 | >1e-6 (near-singular 의심) |
| `κ(K)` | <1e10 | 1e10~1e12 | 1e12~1e15 강경고, >1e15 singular 취급 |
| pivot 비 | — | — | min\|Dii\|/max\|Dii\| <1e-12 → near singular |

**필수 진단 출력**: DOF count · nonzero count · fill-in ratio · factorization/solve time · residual norm · symmetry error · pivot warning · suspected free-mechanism DOF list.

---

## §2. Consistent Load / Fixed-End Force (WP-02)

**일반식**
```text
f_eq = ∫ Nᵀ p dL         f_eq,global = Tᵀ f_eq,local
초기변형/온도: f_0 = ∫ Bᵀ D ε0 dV
온도 축변형:  εT = α ΔT        온도구배 곡률: κT = α ΔT_grad / h
부재력 복원:  q_local = k_local u_local − f_eq,local   (부호규약 §0과 통일)
```

**보 형상함수** (ξ=x/L): N1=1−3ξ²+2ξ³, N2=L(ξ−2ξ²+ξ³), N3=3ξ²−2ξ³, N4=L(−ξ²+ξ³).
```text
등분포 q:  f_v = [ qL/2,  qL²/12,  qL/2,  −qL²/12 ]ᵀ
사다리꼴:  q(x)=q1+(q2−q1)x/L,  f_v = ∫₀ᴸ Nᵀ q(x) dx
집중 P@a:  f_v = P[N1(ξa),N2(ξa),N3(ξa),N4(ξa)]ᵀ
축 등분포 p: f_axial=[pL/2, pL/2]ᵀ    비틀림 mx: f_torsion=[mxL/2, mxL/2]ᵀ
```

**station 내력 복원** (절점력 직선보간 금지 — 하중장 포함)
```text
V(x)=V_i − ∫₀ˣ q ds      M(x)=M_i + V_i x − ∫₀ˣ q(x−s) ds
N(x)=N_i − ∫₀ˣ p ds      T(x)=T_i − ∫₀ˣ mx ds
```

**합격 기준**
```text
하중 평형: Σf_eq = ∫p dx,  모멘트: ΣM_eq = ∫p x dx   (오차 < 1e-10)
분포하중 결과는 분할 수와 무관해야 함
```
**대표 benchmark**: 단순보 UDL R=qL/2·Mmax=qL²/8 · 고정단보 UDL Mi=−qL²/12·Mj=+qL²/12·V=qL/2 · 캔틸레버 UDL V=qL·M=qL²/2 · 중앙집중 R=P/2·Mmax=PL/4. 폐형해 대비 변위<1e-8~1e-6, 반력<1e-8~1e-6, 부재력<1e-7~1e-5.

---

## §3. Regression Suite — 오차식 · tolerance (WP-03)

```text
스칼라:  e_rel = |x_calc − x_ref| / max(|x_ref|, x_scale)
벡터:    e_vec = ‖x_calc − x_ref‖₂ / max(‖x_ref‖₂, x_scale)
힘 평형: e_force = ‖ΣF_ext + ΣR‖₂ / max(‖ΣF_ext‖₂, 1)
모멘트:  e_moment = ‖ΣM_ext + ΣM_reac‖₂ / max(‖ΣM_ext‖₂, 1)
에너지:  U=½uᵀKu, W=½uᵀF → |U−W|/max(|W|,1) < tol
```

**권장 tolerance** (config: `criteria.tolerance.*`, [VERIFICATION_MATRIX](VERIFICATION_MATRIX.md) 컬럼값)

| 계층 | tolerance |
| --- | --- |
| element closed-form | 1e-9 ~ 1e-7 |
| small frame | 1e-7 ~ 1e-5 |
| large frame | 1e-5 ~ 1e-3 |
| modal period | 1e-6 ~ 1e-4 |
| modal participation | 1e-6 ~ 1e-4 |
| RSA | 1e-4 ~ 1e-2 |
| P-Delta iterative | 1e-5 ~ 1e-3 |
| shell(등가모델 global) | 5e-2 (§6B) |

**레코드 저장**: model_id · model_hash · solver_version · input_unit · reference_source · expected · computed · relative_error · tolerance · pass/fail · timestamp.

---

## §4. RSA 후처리 (WP-04)

```text
고유치:  K φn = ωn² M φn      질량정규화: φiᵀ M φj = δij (아니면 Mn*=φnᵀMφn)
참여계수: Γn,d = (φnᵀ M rd)/(φnᵀ M φn)   (질량정규화 시 = φnᵀ M rd)
유효질량: Meff,n,d = Γn,d² (φnᵀ M φn)
총참여율: ηd = ΣMeff,n,d / Mtotal,d,   Mtotal,d = rdᵀ M rd
스펙트럼: qn,max = Γn Sa(Tn)/ωn²,  un,max = φn qn,max,  Rn = op(un,max)
```

**모드조합**
```text
SRSS: R = √(ΣRn²)
CQC:  R = √(Σi Σj ρij Ri Rj),   β = ωj/ωi,  ρii = 1
ρij(ξi,ξj) = 8√(ξiξj)(ξi+βξj)β^1.5 / [(1−β²)² + 4ξiξjβ(1+β²) + 4(ξi²+ξj²)β²]
ρij(ξ 동일) = 8ξ²(1+β)β^1.5 / [(1−β²)² + 4ξ²β(1+β)²]
```

**방향조합 / scaling / 우발편심**
```text
SRSS 방향: R_dir = √(Rx²+Ry²+Rz²)
100/30:   R1=±Rx±0.3Ry±0.3Rz, R2=±0.3Rx±Ry±0.3Rz, R3=±0.3Rx±0.3Ry±Rz
          R = max(|R1|,|R2|,|R3|)   (계수 0.3은 config)
밑면전단: V_RSA = √(ΣVn²) 또는 CQC,  scale = max(1, V_min/V_RSA),  R_scaled = scale·R_RSA
우발편심: ea = α L,  Mt = ± ea V    (α는 config)
```

**판정/기본값** (config: `criteria.rsa.*`)

| 항목 | 기준 |
| --- | --- |
| 질량참여 ηx,ηy | ≥0.90 권장, <0.90 warning, <0.80 strong warning |
| CQC 사용 | 인접모드 주기비 Ti/Tj ∈ 0.9~1.1 → CQC 권장 |
| SRSS 사용 | 모드 충분분리 시만 |
| 부호 | SRSS/CQC는 signed 아님 → 설계용 +E/−E envelope 별도 |
| 변위 scaling | 적용 여부는 기준별 option |

**필수 출력**: period · frequency · modal mass · Γ · effective mass ratio · cumulative mass ratio · base shear(scaling 전/후) · scale factor · story shear · story drift · overturning moment.
현행 자산: `dynamics/modal.js`(participation), `elasticCompleteness.js`, `results/rsaTrace.js`, `core/signedLateralCases.js`, `semiRigidDiaphragm.js`, `results/story*.js`.

---

## §5. P-Delta — 기하강성 / 접선강성 (WP-05)

```text
비선형 평형: R(u) = Fext − Fint(u) = 0
Newton-Raphson: Kt Δu = R,  u(k+1)=u(k)+Δu
접선강성: Kt = Ke + Kg(N)     ← 부호규약 §0(인장 양수 N), 압축은 N<0
```
> **부호 주의**: 압축을 양수 P로 두는 문헌은 `Kt = Ke − Kg(P)`로 쓴다. 본 프로젝트는 `SIGN_CONVENTION`이 **인장 양수**이므로 `Kt = Ke + Kg(N)` 하나로 통일한다. KG 정식화는 중복 조립하지 말고 공용 `src/solver/geometricStiffness*` 모듈로 추출해 좌굴/P-Delta 양쪽에서 재사용한다.

**2D beam-column 기하강성** (bending DOF [v_i,θ_i,v_j,θ_j], 압축 양수 P 표기의 정준형 — 코드는 인장양수로 부호전환)
```text
Kg = P/(30L) ×
[[ 36,  3L, −36,  3L],
 [ 3L, 4L², −3L, −L²],
 [−36, −3L,  36, −3L],
 [ 3L, −L², −3L, 4L²]]
일반형: Kg = ∫₀ᴸ N_axial Gᵀ G dx,  G = dN_bending/dx
3D: 두 횡방향(v-rz, w-ry) 블록에 각각 삽입
축력 업데이트: u_local=T u_global, δ=uj−ui, N=EA/L·δ → 매 iteration Kg(k)→Kt(k)
```

**좌굴 연결**
```text
(Ke − λ Kg0) φ = 0,  λcr = eigenvalue,  safety_ratio = λcr/λload
```

**수렴/발산/step** (config: `criteria.pdelta.*`)
```text
잔차 e_R=‖R‖₂/max(‖Fext‖₂,1) < 1e-6
변위 e_u=‖Δu‖₂/max(‖u‖₂,u_scale) < 1e-6
에너지 e_E=|Δuᵀ R|/max(|uᵀFext|,1) < 1e-8
max_iteration 20~50
발산: ‖u(k+1)‖ > amp_limit·‖u(1)‖  또는 e_R 3회연속 증가 → step cut, 실패 시 analysis failed
load step: Fext=λFtotal (λ:0→1), Δλ=1/n_step, 실패 Δλ/2, 여유 min(2Δλ,Δλ_max)
```

**층 안정지수 θ** — 현행 `analyzePDelta`의 `pDeltaThetaNegligible`(기본 0.1)/`pDeltaThetaLimit`(기본 0.25)를 아래로 재정의·config화
```text
θ = P_story Δ_story / (V_story h_story)
θ<0.05 정상 · 0.05~0.10 주의 · 0.10~0.20 P-Delta 필수 경고 · >0.20 강한 비선형/불안정 경고
```
> 현행 기본값(0.1/0.25)과 위 tier가 다르다 — **정확히 이래서 config로 뺀다.** 기준셋(KDS/ASCE)마다 θ 한계가 다르므로 preset으로 교체.

현행 자산: `dynamics/globalBuckling.js`의 좌굴 전용 `buildGlobalGeometricStiffness` 정식화(현재 내부 함수), `nonlinear/elements/corotationalBeam.js`, `nonlinear/control/*`(NR/arc-length), `results/unilateralTrace.js`. Phase 6 구현 시 KG 정식화는 공용 `src/solver/geometricStiffness*` 모듈로 추출한 뒤 좌굴/P-Delta 양쪽에서 재사용한다.

---

## §6. Shell — 등가모델 Scope (WP-06, **옵션 B 확정**)

> **오너 결정(2026-07-09): 실 shell FEM 미개발, 등가모델 유지 + scope 명시.** §6A(실 FEM 식)는 **후속 이연 참고용**으로만 보존한다.

**허용 (등가모델)**: 전체 횡강성 근사 · 벽체 mid-pier 등가축력/전단/모멘트 · diaphragm load path 근사 · preliminary global analysis.

**비허용 (보고 금지)**: slab local bending stress · wall opening 주변 응력 · shell/local 설계용 collector/chord force 정밀산정 · punching shear · mesh 기반 stress contour · plate deflection 설계값 · slab strip design 자동화. 반강체 diaphragm load-path force는 WP-04에서 허용하지만 정밀 shell 설계값으로 표시하지 않는다.

**필수 출력 경고**(모든 벽/슬래브 결과 경로):
```text
"This wall/slab result is based on equivalent frame/link model, not shell FEM."
```

**검증 기준** (config: `criteria.equivalentShell.*`) — reference(상용 shell 해석) 대비
```text
global drift error < 5~10%,  층전단 error < 5%,  벽체 base moment error < 10%
local stress: 보고하지 않음
```
현행 자산: `solver/wallSlabEquivalent.js`, `solver/shell/shellAssembly.js`(`expandShellsToFrameLinks`), `solver/shell/quad4.js`(계약/patch 유지).

<details><summary>§6A. (이연) 실 shell FEM 정식화 — 참고 보존</summary>

membrane εm=[∂u/∂x, ∂v/∂y, ∂u/∂y+∂v/∂x] · Kirchhoff κ=[−∂²w/∂x², −∂²w/∂y², −2∂²w/∂x∂y] · Mindlin κ=[∂θx/∂x, ∂θy/∂y, ∂θx/∂y+∂θy/∂x], γ=[θx+∂w/∂x, θy+∂w/∂y]. Dm=Et/(1−ν²)·[[1,ν,0],[ν,1,0],[0,0,(1−ν)/2]], Db=Et³/[12(1−ν²)]·(동형), Ds=κsGt·I2, G=E/[2(1+ν)], κs≈5/6. ke=∫BmᵀDmBm+∫BbᵀDbBb+∫BsᵀDsBs, fe=∫Nᵀp, me=∫ρtNᵀN. drilling k_drill=α·k_ref (α=1e-6~1e-4, 안정화에너지/총변형에너지<1e-4). locking: t/Lchar<1/20 thin, <1/100 강검증 → SRI/MITC/DSG. patch: rigid body 6모드(λ1~6≈0, λ_rigid/λ_elastic<1e-8), constant membrane/bending patch(stress err<1e-6~1e-4 / moment err<1e-4~1e-3), mesh convergence(displacement<1~5%, stress<5~10%).
</details>

---

## Config 레지스트리

새 네임스페이스 **`analysisCriteria`**로 모든 임계값을 모으고, **기준셋 preset**(`kds`/`asce`/`eurocode`/`custom`)으로 교체 가능하게 한다. 소비는 단일 accessor(예: `resolveCriterion(model, 'pdelta.thetaLimit')`)로 통일하고, 기존 `analysisSettings.*` 키는 하위호환 fallback으로 유지한다.

이 registry 자체는 [WP-00](workpackages/WP-00-analysis-criteria.md)의 선행 산출물이다. WP-01~WP-06은 각자 resolver를 새로 만들지 않는다.

| Config 키 | 의미 | 초기 기본값 | 기존 키(호환) |
| --- | --- | --- | --- |
| `criteria.solver.symWarn / symFail` | 대칭성 경고/실패 | 1e-8 / — | — |
| `criteria.solver.resWarn / resFail` | 잔차 경고/실패 | 1e-6 / — | — |
| `criteria.solver.condWarn / condSingular` | 조건수 경고/특이 | 1e12 / 1e15 | — |
| `criteria.solver.pivotSingular` | pivot 비 특이 | 1e-12 | — |
| `criteria.load.equilTol` | 하중/모멘트 평형 | 1e-10 | — |
| `criteria.tolerance.<계층>` | §3 계층별 tolerance | §3 표 | — |
| `criteria.rsa.massMin / massStrong` | 질량참여 경고 | 0.90 / 0.80 | — |
| `criteria.rsa.cqcPeriodRatio` | CQC 권장 주기비 | 0.9~1.1 | — |
| `criteria.rsa.dirFactor` | 100/30 계수 | 0.30 | — |
| `criteria.rsa.eccentricity` | 우발편심 α | 0.05 | — |
| `criteria.pdelta.eR / eU / eE` | 수렴 tolerance | 1e-6/1e-6/1e-8 | `pDeltaTolerance` |
| `criteria.pdelta.maxIter` | 최대 반복 | 30 | `pDeltaMaxIterations` |
| `criteria.pdelta.ampLimit` | 발산 증폭한계 | 2.5 | `pDeltaMaxAmplification` |
| `criteria.pdelta.thetaCaution / thetaRequire / thetaStrong` | θ tier | 0.05/0.10/0.20 | `pDeltaThetaNegligible`,`pDeltaThetaLimit` |
| `criteria.equivalentShell.driftErr / shearErr / momentErr` | §6B 검증 | 0.10/0.05/0.10 | — |

> 위 초기 기본값은 **개발용 seed**일 뿐, 실제 프로젝트 적용 기준은 반드시 설계기준 preset에서 확정한다. 값을 코드에 하드코딩하는 PR은 코드리뷰에서 반려한다.
