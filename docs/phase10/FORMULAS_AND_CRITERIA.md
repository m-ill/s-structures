# Phase 10 — 핵심 식 · 판정 기준 · Config 레지스트리

```yaml
doc: formulas-and-criteria
phase: 10
date: 2026-07-21
status: canonical reference (WP-00~11 공통 인용)
inherits: docs/phase6/FORMULAS_AND_CRITERIA.md (§0 전역평형·§2 consistent load·§5 기하강성 규약은 그대로 유효)
```

> **원칙 (phase6 계승)**: ① 임계값은 전부 `analysisCriteria` config — 하드코딩 PR 반려. ② 부호규약은 축력 **인장 양수** 단일 —
> 모든 신규 식이 `Kt = Ke + Kg(N)` 계열을 따른다. ③ 정준 식은 이 문서가 단일 출처이고 WP는 §를 인용한다.

---

## §1. 즉시 보정 — θ 3-tier · RSA scaling 적용 (WP-00)

**θ 3-tier 판정** — 기존 2문턱(`pDeltaDesignStatus`)을 config 3키 전부로 분기:
```text
θ < thetaCaution                  → OK
thetaCaution ≤ θ < thetaRequire   → CAUTION      (주의, 설계 진행 가능)
thetaRequire ≤ θ < thetaStrong    → REQUIRE-2ND  (2차해석 필수 — Direct P-Delta 미사용 시 설계 차단)
θ ≥ thetaStrong                   → NG           (불안정 경고, 설계 차단)
```
- REQUIRE-2ND에서 `pDeltaMethod='direct'`로 이미 해석한 경우는 통과, 아니면 `designBlocked` + `PDELTA_SECOND_ORDER_REQUIRED`.
- 하위호환: 기존 'OK'/'WARN'/'NG' 소비자를 위해 `statusLegacy` 필드 병행 (additive).

**RSA scaling 적용 정책** — trace(산정)에서 적용(전 응답 곱)으로:
```text
scale_d = max(1, V_min,d / V_RSA,d)     (방향 d별, 기존 baseShearScale.js 식 유지)
적용 대상: 해당 방향 RSA 변위·관성력·부재력·층 결과 전부에 scale_d 곱
기록: 모든 스케일된 값에 {scaled:true, scaleFactor, beforeValue} provenance
```
- `V_min,d`는 오너/기준 입력(`analysisSettings.rsa.minimumBaseShear`) — 자동 산출하지 않는다(기준별 상이).
- 적용 여부 자체는 config `rsa.applyBaseShearScaling`(기본 true). 미적용 시 기존 trace-only 동작 유지.

---

## §2. Timoshenko 전단변형 요소 (WP-02)

**전단 파라미터** (각 휨평면별):
```text
Φ_z = 12 E Iz / (G As_y L²)      (강축 휨, y방향 전단)
Φ_y = 12 E Iy / (G As_z L²)      (약축 휨, z방향 전단)
As = 단면 전단유효면적 — materials/sectionProperties.js 산정법 소비
     (사각형 5A/6, 일반 근사 0.9A, I형강 웨브면적 등 — 신규 산정법도 그 모듈에만 추가)
```

**수정 강성 항** (기존 az/bz/cz/dz 자리 대체, Φ→0에서 Euler–Bernoulli로 수렴):
```text
k_vv = 12EI / ((1+Φ) L³)         k_vθ = 6EI / ((1+Φ) L²)
k_θθ = (4+Φ) EI / ((1+Φ) L)      k_θθ' = (2−Φ) EI / ((1+Φ) L)
```

**동반 갱신 (강성만 바꾸면 불일치 발생 — 전부 한 마일스톤에서)**:
```text
고정단력: 집중하중 P@a 의 fixed-end (Φ 반영식). UDL 대칭 케이스는 Φ 무관(±qL²/12 유지) — 회귀 앵커
복원함수: 처짐 v(x) = 휨성분 + 전단성분(V(x)/(G·As) 적분)
응축:     condenseReleasedDofs는 수정 k에 그대로 적용 (Schur 일반형이므로 코드 변경 없음 — 검증만)
KG:       기하강성도 Timoshenko 일관형 사용 시 Φ 보정 — 1차 범위에서는 기존 KG 유지 허용,
          차이는 limitation code `TIMOSHENKO_CONSISTENT_KG_NOT_IMPLEMENTED`와 summary trace로 노출
```

**판정 기준** (config: `criteria.element.*`)
```text
Φ=0 회귀:   기존 EB 결과 대비 상대오차 < 1e-12 (해석적으로 동일해야 함)
깊은 보:    단순보 중앙집중 폐형해 δ = PL³/(48EI) + PL/(4GAs) 대비 < 1e-9
얕은 보:    L/h ≥ slenderCutoff(기본 60) 사각형 보에서 max(Φ_y,Φ_z) < shallowTol(기본 1e-3) — sanity gate
활성화:     analysisSettings.shearDeformation (기본 true), 요소별 override 허용
```

얕은 보 sanity 기준 fixture는 `L/h=60` 사각형 보이며 두 평면의 Φ를 config tolerance로 검증한다. 신규 모델은 canonical
`analysisSettings.shearDeformation=true`가 기본이다. 이 필드가 없던 기존 모델은 migration에서 false(EB)로
고정해 과거 결과를 보존하고, legacy `includeShearDeformation` alias는 읽기 호환만 제공한다. canonical과
alias가 충돌하거나 값 타입이 boolean이 아니면 임의 우선순위를 택하지 않고 fail-closed한다.

compute의 9-wide WebGPU shadow kernel/CPU reference 계약은 구현됐고, NVIDIA Ampere/Chrome 149 실제
장치에서도 144개 행렬값이 최대 상대오차 `9.78e-8`로 PASS했다. 원시 증거는
[P9-M4 browser artifact](../../verification/evidence/validation/phase9/p9-m4-browser-raw.json)에 결속한다. 다만
다중 vendor/browser 행렬(`P9-GPU-PLT-12`)과 XV-09 SAP2000 기준해는 여전히 pending이므로 M11 release
판정은 계속 차단한다.

---

## §3. 부분강접 — 회전스프링 단부 (WP-03)

**모델·스키마**: 부재 단부와 절점 사이 회전스프링 k_θ를 국부 y·z 휨 및 i/j단별로 독립 지정한다.
release(이진)의 일반화이며 k_θ→∞가 강접, k_θ=0이 해당 축 release와 등가다.

```text
member.releases.spring = { ryI?, rzI?, ryJ?, rzJ? }
local DOF                 ryI=4, rzI=5, ryJ=10, rzJ=11
축별 기준강성             ry*=E·Iy/L, rz*=E·Iz/L
```

- 키 **미지정(absent)**은 강접이다. 명시적 숫자 `0`은 해당 축 release다. 따라서 `0`을 falsy 기본값으로
  치환하지 않으며 DomainBinary도 presence mask로 둘을 구분한다.
- 값은 유한한 비음수 number만 허용한다. `Infinity`·`NaN`·문자열·음수와 미등록 키는 fail-closed한다.
- 이진 `pin`과 같은 단부의 spring 지정은 충돌이다. 반대 단부의 spring은 독립적으로 허용한다.
- frame 휨 요소에만 적용하며 truss·tensionOnly·compressionOnly 지정은 차단한다.

**고정도 계수**는 보고·경고용 Monforton–Wu 계열 trace이며 강성 계산에는 직접 사용하지 않는다.

```text
ρ = k_θ L/(EI)
r = 1 / (1 + 3/ρ)                 (r=1 강접, r=0 힌지)
```

**정준 구현 — 내부 회전 DOF 정적 응축**: 원 국부 부재 강성·고정단력을 `K`, `f0`, 절점 국부변위를
`u`, 실제 부재단 국부변위를 `d`라 한다. spring 축 집합을 `S`, 나머지를 `R`,
`D=diag(k_θ)`, `A=K_SS+D`로 두면 다음 안정 Schur block을 사용한다.

```text
Z = A⁻¹ K_SR,       Q = A⁻¹ D,       P = A⁻¹ K_SS

K̄_RR = K_RR − K_RS Z
K̄_RS = K_RS Q,     K̄_SR = K̄_RSᵀ
K̄_SS = D P                         (수치 대칭화)

ȳ = A⁻¹ f0_S
f̄0_R = f0_R − K_RS ȳ
f̄0_S = D ȳ
```

`A`는 단부별 강성 차가 커도 거짓 singular가 나지 않도록 대각 평형화한 좌표에서 푼다. 특히 `K̄_SS`를
`K_SS−K_SS A⁻¹K_SS`로 직접 빼지 않아 k_θ→∞ cancellation을 피하고, k_θ=0인 행·열과 고정단력은 정확히
release 극한으로 보낸다. 응축 실패나 비유한 결과는 원 강접 K로 되돌리지 않고 fail-closed한다.

**복구·평형 폐합**:

```text
d_R = u_R
A d_S = D u_S − K_SR u_R − f0_S
p = K d + f0
p_s = k_s (u_s − d_s)              (각 spring축 모멘트 폐합)
```

`d_S`와 `u_S`가 거의 같은 강접 극한에서는 두 회전을 직접 빼지 않고 `A⁻¹[K_SR,K_SS]` 기반 상대회전
연산자로 slip과 spring moment를 복구한다. 강성, equivalent nodal load, 실제 부재단 회전, 단부력 및
station 복원이 모두 같은 `K/f0` 계약을 사용한다.

Timoshenko가 활성화되면 §2의 Φ 보정 `K`와 consistent `f0`가 위 식에 그대로 들어가므로 별도 경험식 없이
전단변형과 부분강접이 결합된다. DomainBinary v3는 `[ryI,rzI,ryJ,rzJ]` Float64 값과 4-bit presence mask를
전달하며, mask 0은 강접·present zero는 release로 해석한다.

**기하비선형 한계**:

- 유한 spring의 Direct P-Delta는 응축된 Ke에 기존 비응축 프리즘 KG를 더하는 1차 근사이며
  `PARTIAL_FIXITY_PRISMATIC_KG_APPROXIMATION`을 summary/designEligibility에 노출한다.
- 명시적 zero spring은 release와 같은 Ke/KG 공통변환이 필요하므로
  `DIRECT_PDELTA_PARTIAL_FIXITY_RELEASE_LIMIT_UNSUPPORTED`로 차단한다.
- global buckling은 `BUCKLING_PARTIAL_FIXITY_UNSUPPORTED`, corotational/nonlinear 경로는
  `NONLINEAR_PARTIAL_FIXITY_UNSUPPORTED`로 fail-closed한다. 이 경로들은 silent ignore하지 않는다.

**판정 기준** (config: `criteria.connection.*`)
```text
k_θ→∞: 강접 결과 대비 < rigidLimitTol (기본 1e-9)
k_θ=0:  release 결과 대비 < releaseLimitTol (기본 1e-9)
중간값: 단부 스프링 보 EB/Timoshenko 폐형해 대비 < closedFormTol (기본 1e-7)
경고: k_θ가 stiffRatioWarn(기본 1e4·EI/L) 초과 → "강접으로 모델링 권장" / releaseRatioWarn(기본 1e-4·EI/L) 미만 → "release 권장"
```

---

## §4. 단부 오프셋 3D · 삽입점 · 패널존 (WP-04)

**강체 오프셋 변환** (현행 축방향 단축의 일반화):
```text
절점→부재단 강체팔 r = [rx, ry, rz] (국부 or 전역 지정):
u_end = u_node + θ_node × r        →  12×12 변환 T_off (블록별 [I, skew(r); 0, I])
k̄ = T_offᵀ k T_off,   q̄0 = T_offᵀ q0
```
- 삽입점(insertion point): 단면 도심과 배치 기준점(상단/모서리 등)의 y/z 편심을 동일 r 메커니즘으로 처리.
- 현행 `endOffset.{i,j}`(축방향)는 r의 축방향 성분 특수경우로 흡수 — 기존 모델 하위호환 유지.
- `rigidFactor<1`(부분 강체)은 이번에도 **비지원 유지** — 지원하려면 별도 유연구간 요소가 필요하므로 명시 차단.
- 구현 부호계약: 벡터 `r`은 **절점에서 유연 부재단으로 향하는 벡터**다. 숫자형 i/j는 기존대로 i단 `+x`, j단 `-x`의 축방향 길이로 해석한다.
- 삽입점 이름은 `centroid`, 상·하·좌·우 중심 및 네 모서리 9종이다. catalog `dims/params`의 단면 치수는 mm→m로 정규화한다.

**패널존** (옵션, 보-기둥 접합): 회전스프링 근사(탄성 1차 분기)
```text
K_pz = G · t_p · d_b · d_c          (Krawinkler 탄성 분기)
       t_p: 패널 두께, d_b: 보 깊이, d_c: 기둥 깊이
모델: 접합 절점에 회전스프링(§3 메커니즘 재사용) 자동 부여, 소스='panelZone'
```

`joint`는 제품 schema의 `node`와 동의어다. `axis`는 `y|z`이고 생략 시 연결 부재의
`localAxis.strongAxis`를 사용한다. 같은 단부·축의 명시 spring은 `PANEL_ZONE_SPRING_CONFLICT`로
차단한다. 벡터 오프셋/비도심 삽입점의 nonlinear corotational 해석은 검증 전까지
`NONLINEAR_3D_OFFSET_UNSUPPORTED`로 차단한다.

**판정 기준** (config: `criteria.offset.*`)
```text
r=0 회귀: 기존 결과 대비 < 1e-12
강체팔 평형: 오프셋 부재의 절점 평형에서 모멘트 전달 오차 < 1e-10 (평형감사 확장)
벤치마크: 편심 보(도심 offset e)의 축력-모멘트 결합 폐형해 N·e 대비 < 1e-8
```

---

## §5. 일반 MPC · rigid link (WP-05)

**계약**: P8-M1 구속 시스템 `u = T q + u_bar`의 **행 추가**로 구현한다. 신규 구속 엔진 금지.
```text
일반 MPC:    u_s = Σ_i c_i u_m,i + d     (slave DOF 소거, T에 c_i 행 결합)
rigid link:  u_s = u_m + θ_m × r          (6DOF 완전 강체 — MPC의 특수형, 다이어프램과 동일 계보)
master-slave: 방향 선택형 rigid link
```

**정합성 규칙** (config: `criteria.constraint.*`)
```text
충돌 검출: slave 재정의(이중 구속)·순환 참조(s→m→s)·지지와 충돌 → 에러 코드로 차단
  CONSTRAINT_SLAVE_REDEFINED / CONSTRAINT_CYCLE / CONSTRAINT_SUPPORT_CONFLICT
검증: 강체 링크 2절점 모델 = 단일 절점 등가 결과 < 1e-10
      MPC 경유 반력 합 = 외력 합 (평형감사 통과)
다이어프램 회귀: 기존 다이어프램 결과와 T-행 표현 결과 일치 < 1e-10 (내부 표현 통일 검증)
질량·KG 변환: 모달(M)·P-Delta(KG)도 동일 T로 축약 — 모달 diaphragm 변환(modalDiaphragm.js)과 일원화
```

---

## §6. 변단면(비프리즘) 부재 (WP-06)

**강성**: 단면성질의 길이방향 변화를 Gauss 적분:
```text
k = ∫₀ᴸ Bᵀ(x) D(x) B(x) dx,   D(x) = diag(EA(x), EIy(x), EIz(x), GJ(x))
프로파일: linear / parabolic-depth(I ∝ h(x)³ 근사) / 구간별 상수 — 프로파일 종류는 스키마에 명시
적분점: gaussPoints (기본 5, config)
```
**동반**: 고정단력·station 복원도 동일 적분 기반. 질량(lumped)은 ∫ρA(x)dx 분배. KG는 N(x)·I(x) 반영.

**판정 기준** (config: `criteria.taper.*`)
```text
프리즘 회귀: 상수 프로파일 → 기존 결과 < 1e-12
폐형해: 선형 변단면 캔틸레버 처짐(문헌 폐형해) < 1e-6
수렴: 적분점 5→10 변화 < 1e-8 (적분 수렴 확인)
```

---

## §7. Prestressed 모달·RSA · 좌굴 다중모드 · 직접적분 THA (WP-07)

**prestressed 모달**:
```text
(Ke + Kg(N_G)) φ = ω² M φ        N_G: 중력조합(오너 지정 comboId) 수렴 축력, 인장 양수
RSA: 위 모드·주기로 수행하되 해석 중 강성 고정(모드중첩 성립 조건)
provenance.stiffnessBasis = 'elastic-Ke' | 'gravity-tangent-Kt' 명시 (기존 결과와 구분)
```
**좌굴 다중모드**: `(Ke + λ Kg(N_ref)) φ = 0`을 P9-M6 requested-mode sparse eigen으로 5~10모드
(shift-invert). 모드별 λcr·형상·조합별 재계산.

**선형 직접적분 THA** (모드중첩 보완): P8 Newmark(β=1/4) 재사용, 상수 K·M·Rayleigh C:
```text
M ü + C u̇ + K u = −M r a_g(t),   C = a0 M + a1 K (Rayleigh, 두 기준모드 지정)
선형이므로 스텝당 반복 불요 — 유효강성 K_eff 1회 분해 재사용 (compute factorSession 활용)
```

**판정 기준** (config: `criteria.dynamics.*`)
```text
prestressed 회귀: N_G=0 → elastic 모달과 < 1e-10
물리 방향성: 압축 중력 → 주기 증가 확인 (부호규약 §0 검증 앵커)
좌굴: Euler 기둥 λcr 폐형해 < 1e-6, 최저모드는 기존 inverse iteration과 < 1e-8 일치
직접적분: 모드중첩 THA와 선형 SDOF 케이스 상호 < 1e-6, 에너지 오차 < energyTol(기본 1e-8)
```

---

## §8. Warping torsion · LTB (WP-08, ADR-001 옵션 B accepted)

**옵션 A — 7번째 DOF(Vlasov) 요소**: 절점당 7DOF(뒤틀림 θ'), 부재 14×14:
```text
비틀림 블록: GJ(St.Venant) + EC_w(warping) 결합 — 표준 Vlasov 보 강성
경계: 뒤틀림 자유/구속 지원단 구분
```
**옵션 B — 설계식 LTB 검토**(해석 DOF 불변): 탄성 임계모멘트
```text
M_cr = C1 (π²EIz/(kL)²) √( (k/kw)² Cw/Iz + (kL)² GJ/(π² EIz) )   (+ 하중고 보정)
C1: 모멘트 구배 계수(config), 결과는 검토(check) 계층에 배치 — 해석 결과 아님을 명시
```
> ADR-001 결정(2026-07-22): **옵션 B를 P10-M8로 구현**. 옵션 A는 별도 승인·영향평가가 필요한 후속 범위다.

구현 계약은 `type=design-check-not-analysis-result`, `analysisDofChanged=false`이며 결과에
`{Mcr, Mmax, ratio, C1, Lb, k, kw, governingCombinationId, limitations}`를 포함한다. 적용식은
등단면 이중대칭 부재를 전제로 하며 하중고 보정, warping 변위·bimoment·warping 응력은 제공하지 않는다.

**판정 기준** (config: `criteria.ltb.*`): 단순보 균일모멘트 M_cr 폐형해 < 1e-6 (옵션 B) /
warping 고정 캔틸레버 비틀림 폐형해 < 1e-6 (옵션 A, 후속 범위).

---

## §9. 벽·슬래브 FEM — 2D 분해 단계 도입 (WP-09, ADR-002 옵션 C)

full shell을 한 번에 만들지 않고 **면내 2D(membrane) → 면외 2D(plate) → 결합(flat shell)** 3단계로 도입한다.
기저 정식화는 [phase6 FORMULAS §6A(이연 보존)](../phase6/FORMULAS_AND_CRITERIA.md)의 Dm·Db를 단계별로 분리 소비한다.

**§9a. 벽 membrane (평면응력, M9a)**
```text
평면응력: Dm = E·t/(1−ν²) · [[1,ν,0],[ν,1,0],[0,0,(1−ν)/2]]
요소: Q4 compatible 변위 + QM6-EAS enhanced strain 4모드, 2×2 적분
      H_a(ξ,η) = det(J0)/det(J) · H_a(J0⁻¹,ξ,η)
      J0는 요소 중심 Jacobian이며, enhanced 4DOF는 Schur 정적응축
국부 DOF: 면내 u,v (절점당 2) — 임의 평면 배치는 평면변환 T로 전역 6DOF에 사상
drilling: c_d = θn − 0.5·(v,x − u,y)
          k_d = ∫ B_dᵀ·(αGt)·B_d dA,  B_d,i=[0.5N_i,y, −0.5N_i,x, N_i]
          α = criteria.shell.drillingAlpha (1e-6~1e-4), 2×2 적분
```
중심 Jacobian과 `det(J0)/det(J)` 스케일은 왜곡된 쌍선형 사변형에서도 enhanced strain의 가중 평균을 0으로 유지한다.
Hughes–Brezzi curl penalty는 독립 drilling 회전을 변위장의 연속체 회전에 연결하며, 독립 절점 회전에만 대각 스프링을
넣지 않는다. 판정은 상수응력 patch 오차 <1e-10, 3×3 네 요소 왜곡 patch의 중심 변위 <1e-8·자유절점 잔차 <1e-10,
캔틸레버 벽 보이론 `δ=PH³/(3EI)+1.2PH/(GA)` 상대오차 < `shell.wallBeamTol`, 그리고 개구부 평형감사다.

**§9b. 슬래브 plate (Mindlin–Reissner MITC4, M9b)**
```text
국부 DOF: [w, rx, ry] (물리 회전)
κ = [ry,x; −rx,y; ry,y−rx,x]
γ = [w,x+ry; w,y−rx]
Db = E·t³/[12(1−ν²)]·[[1,ν,0],[ν,1,0],[0,0,(1−ν)/2]]
Ds = (5/6)·G·t·I
요소: Bathe–Dvorkin MITC4 mixed covariant shear, bending·shear 모두 2×2 적분
      γξ는 (0,−1)/(0,+1), γη는 (−1,0)/(+1,0) tying 값을 보간하고 J⁻¹로 물리 전단 복원
하중: f_i = ∫ N_i·p·n·det(J)dξdη (Q4 2×2 consistent pressure)
```
양의 압력은 초기 기준면의 절점 순서 오른손 normal 방향인 선형 dead load다. 판정은 raw 강체모드와 상수곡률 patch,
Reissner–Mindlin Navier 기준의 정사각·2:1·4:1, 단변/두께비 15~100 행렬, 8×8→10×10 메시수렴, 그리고
정적/모달/RSA 회귀다. 과거 Kirchhoff 정사각판 단일 anchor와 `DKQ` 호환 이름은 정식 qualification 근거로 쓰지 않는다.

**§9c. flat shell 통합 (M9c — 정식 개발 범위)**
```text
요소: 절점당 6DOF flat shell = QM6-EAS membrane + Hughes–Brezzi drilling + MITC4 plate
  k_e(24×24) = k_m + k_d + k_b
  사후 강체모드 projector는 사용하지 않으며 raw k_e 자체가 강체 6모드를 소거해야 한다.
비평면 기준면 이격 d의 강체팔:
  U_plane = U + d·(n×R)
  u_plane = e1·U − d·ry,  v_plane = e2·U + d·rx,  θn = n·R
  |d|/L_char > shell.warpTol → 경고·공학검토, > 3·warpTol → 요소 분할 요구
벽-프레임 결합: 동일 전역 회전 DOF의 θn과 연속체 curl을 penalty로 연결
```
판정: raw 강체 6모드 정규화 잔차 <1e-12, planar/경고수준 warped 불변량, compatible affine drilling 에너지 0,
독립 drilling mode 양의 에너지, 상수 membrane/bending patch, locking·mesh 수렴, Q4 압력 총력·도심모멘트 평형,
그리고 XV-10 상용 대조다. 기존 `criteria.shell.spuriousEnergyMax` 키는 하위호환을 위해 유지하되 현재 의미는
Allman 기생모드 에너지비가 아니라 `max|k_d|/max|k_m| < 1e-4`인 drilling stiffness 영향도다. 실제 해석 에너지비는
변위가 있을 때 `uᵀk_du/uᵀk_eu`로 별도 감사한다.

**§9d. GPU 실행 범위 (M9d) — precomputed transport만 구현**

CPU f64가 QM6-EAS·MITC4·drilling 정식과 24×24 행렬 생성의 유일한 formulation owner다. 현재 WebGPU 셸 범위는
CPU가 미리 계산한 행렬과 복원 연산자를 전달·재구성하는 계층이며, 정식 자체를 GPU에서 생성하지 않는다.

```text
구현된 범위:
  K1 precomputed matrix reconstruction:
    CPU 24×24 행렬을 element scale로 정규화한 f32 payload를 GPU에서 복원
  K2 deterministic gather:
    사전계산 gatherOffsets/gatherEntries로 fixed-order 합산
  K3 generic operator recovery:
    CPU가 만든 복원 operator와 변위의 일반 행렬-벡터 연산

구현되지 않은 범위:
  QM6-EAS 중심-J/정적응축, MITC4 tying shear, Hughes–Brezzi drilling을
  E·ν·t·geometry에서 직접 생성하는 formulation-native GPU stiffness kernel
```

따라서 precomputed f32 reconstruction/gather/recovery parity는 내부 transport 검증일 뿐
`nativeFormulationKernelsImplemented`나 `nativeWebGpuKernelsQualified`를 뜻하지 않는다. 자동 설계 라우팅은 CPU f64로
고정하고, formulation-native 구현·다중 장치 검증 전에는 GPU 결과를 release 근거로 사용할 수 없다. 내부 CPU f64
qualification artifact는 35개 record 전부 PASS하는 계약이며, 현재 artifact hash는
`45389db66c1633dc99e11566`이다. 이 요소/커널 적격은 사용자 모델 메시수렴 증거를 대신하지 않는다.

**통합 규칙 (전 단계 공통)**:
```text
요소 등록: canonical domain element descriptor에 wallMembrane/slabPlate/(shell) 타입 additive
조립: compute domainBinary·sparse 패턴 블록 확장 — CPU reference ↔ WASM/GPU 일치 게이트
경계: 벽-프레임 접합은 §5 MPC/rigid link 재사용
병행: 등가모델은 'equivalent' 유지, 신규는 'membrane'/'plate'/'shell' formulation 명시 — 모델별 선택
경고: 등가 경로 문구 영구 유지. 신규 경로는 해당 단계가 커버하는 응답에서만 해제
      (예: M9a 완료 → 벽 면내 응력 보고 허용, 벽 면외는 여전히 차단)
```

---

## §10. 하중 생성·전달 완성 (WP-10)

```text
1방향 슬래브: 부담폭 분배 (지지 보 2변)
2방향 슬래브: 45° 항복선 분배 — 단변 삼각형, 장변 사다리꼴
  삼각형 등가 UDL: w·Lx/3,  사다리꼴: w·Lx/6·(3−(Lx/Ly)²)   (지지 보 단위길이당)
전달 경로: 슬래브 면하중 → 보 분포하중(loads/fixedEnd 소비 가능한 형태) → 벽/기둥
검증: Σ(보 전달하중) = 슬래브 총하중 오차 < loadgen.equilTol (기본 1e-10)
풍: 층 부담면적 산정 자동화 확장(현행 tributaryWidth 입력의 기하 유도), 풍상·풍하 부호 구분
질량원: 슬래브 면하중 질량 변환을 §질량원 dedup 규칙에 통합
```

---

## §11. 독립 교차검증 (WP-01) — 기준해 artifact 계약

외부 solver 실행은 저장소 밖(오너 입력물)이다. 저장소는 **기준해를 버전 고정 artifact로 수입**해 자동 대조한다.

```text
reference artifact (verification/evidence/validation/phase10/xv/*.json):
{
  version, caseId, status: 'ready'|'pending-reference',
  source: 'opensees'|'sap2000'|'etabs'|'hand-calc',
  sourceVersion, date, author,
  model: { modelHash, unitSystem },        ← 저장소 모델과 해시 결속
  quantities: [ { path, value, unit, tolerance, scale? } ],   ← 절점변위/반력/단부력/주기/질량참여/V_RSA/λcr/θ
  provenance: { inputFiles, notes }, artifactHash
}
대조: e_rel = |computed − reference| / max(|reference|, scale) ≤ tolerance (계층별, §아래 표)
M1 하네스 게이트: XV-01·02 hand-calc pass + XV-03~08 모델·executor·pending artifact + BM-01~10 pass
M11 release 게이트: XV-01~10 required-source green, pending-reference 0, source 정책 충족
  → 'externally-cross-validated' 배지. 하나라도 미충족이면 탄성 release 게이트 차단
```

- `quantities[].unit`은 artifact/model의 단위 계약을 검증하기 위한 메타데이터다. 러너는 자동 단위변환을 하지 않으므로
  외부 solver 값은 러너 응답 단위로 사전 정규화해야 한다.
- suite에서 케이스별 활성 reference artifact는 하나다. M1 hand-calc artifact는 이력으로 보존하되,
  M11에서는 required-source 정책을 충족하는 외부 artifact를 활성화한다.
- XV-01은 hand-calc anchor로 release에 사용할 수 있다. XV-02~10은 외부 solver source가 필요하다.
  현재 XV-02 hand-calc artifact는 M1 하네스에는 유효하지만 release source에는 부적격이다.
- 현재 구현 범위에서 XV-02는 전체 모멘트골조가 아니라 **3층 대칭 3D 캔틸레버-기둥 + rigid-diaphragm 분석 하네스**다.

**권장 tolerance** (config: `criteria.xval.*`)

| 응답량 | tolerance |
| --- | --- |
| 절점변위·반력 | 1e-4 (모델링 등가성 한계 반영) |
| 부재 단부력·중간단면력 | 1e-3 |
| 고유주기 | 1e-3 |
| 질량참여율 | 1e-3 |
| RSA 밑면전단 | 5e-3 |
| P-Delta 증폭·θ | 5e-3 |
| 좌굴 λcr | 5e-3 |

**병적 모델 배터리(BM 계층)**: 각 케이스는 단순히 "실패한다"가 아니라 아래 canonical 결과와 위치
(절점/DOF/부재/solver target)를 반환해야 pass한다.

| ID | canonical 결과 |
| --- | --- |
| BM-01 | `NO_SUPPORT` |
| BM-02 | `DUPLICATE_MEMBER` |
| BM-03 | `ZERO_LENGTH_MEMBER` |
| BM-04 | `MECHANISM_DOF` |
| BM-05 | `AUTO_STABILIZED_FREE_ROTATIONS` |
| BM-06 | `MASSLESS_DOF_CONDENSED` |
| BM-07 | `SOLVER_CONDITION_WARN` |
| BM-08 | `UNIT_SYSTEM_PARITY` |
| BM-09 | `DISCONNECTED_COMPONENTS_ANALYZED` |
| BM-10 | `SOLVER_PIVOT_NEAR_SINGULAR` |

BM-07 본체는 극단 강성비 truss + spring을 조립·해석하는 **end-to-end product model**이다. condition estimate
약 1.333e12에서 `SOLVER_CONDITION_WARN`을 보존하고 의도된 `SINGULAR` 실패를 보고해야 한다. BM-08은
m-kN 원본과 mm-N 원본을 각각 canonical m-kN으로 **명시적 정규화한 뒤**, 두 axial truss product model을
조립·해석해 strain·reaction ratio parity를 검증한다. 자동 변환 API가 아니며 제품 스키마의 m-kN 제약은 유지된다.
BM-10 본체는 극연성 spring + truss를 조립·해석하는 **end-to-end product model**이며 `B.uy`에서
`SOLVER_PIVOT_NEAR_SINGULAR`와 validation `WARN`을 요구한다. 별도의 coupled raw 2×2 matrix는
dense / sparse LDLT / CG 세 경로의 pivot localization 일치를 고정하는 kernel-level 보조 회귀다.

---

## Config 레지스트리 (Phase 10 추가)

기존 `analysisCriteria` 네임스페이스에 **additive**로 추가한다. resolver는 기존 `resolveCriterion` 그대로.

| Config 키 | 의미 | 초기 기본값 |
| --- | --- | --- |
| `criteria.element.shearSlenderCutoff` | Timoshenko diagnostic sanity 세장비 | 60 |
| `criteria.element.shearShallowTol` | 얕은 보 EB 대비 허용차 | 1e-3 |
| `criteria.element.shearPhiZeroTol` | Φ=0 Euler–Bernoulli 회귀 허용차 | 1e-12 |
| `criteria.element.shearDeepBeamTol` | 깊은 보 폐형해 허용차 | 1e-9 |
| `criteria.element.shearReleaseTol` | Timoshenko+release 변위·잔류력 허용차 | 1e-8 |
| `criteria.connection.stiffRatioWarn` | 강접 권장 경고 k_θL/EI | 1e4 |
| `criteria.connection.releaseRatioWarn` | release 권장 경고 k_θL/EI | 1e-4 |
| `criteria.connection.rigidLimitTol` | CN-F01 강접 극한 허용차 | 1e-9 |
| `criteria.connection.releaseLimitTol` | CN-F02 release 극한 허용차 | 1e-9 |
| `criteria.connection.closedFormTol` | CN-F03 부분강접 폐형해 허용차 | 1e-7 |
| `criteria.offset.equilibriumTol` | 강체팔 평형 오차 | 1e-10 |
| `criteria.constraint.consistencyTol` | MPC 등가/평형 검증 | 1e-10 |
| `criteria.taper.gaussPoints` | 변단면 적분점 | 5 |
| `criteria.taper.convergenceTol` | 적분 수렴 검증 | 1e-8 |
| `criteria.dynamics.energyTol` | 직접적분 에너지 오차 | 1e-8 |
| `criteria.dynamics.bucklingModes` | 좌굴 요청 모드 수 | 6 |
| `criteria.ltb.c1Default` | LTB 모멘트구배 계수 | 1.0 |
| `criteria.shell.drillingAlpha` | Hughes–Brezzi curl penalty 계수 α (`αGt`) | 1e-5 |
| `criteria.shell.wallBeamTol` | 캔틸레버 벽 vs 보이론 허용오차 | 5e-2 |
| `criteria.shell.plateTol` | 판 폐형해 허용오차 | 1e-2 |
| `criteria.shell.warpTol` | 비평면 사영거리 경고비 \|d\|/L_char | 1e-2 |
| `criteria.shell.spuriousEnergyMax` | 하위호환 키: drilling stiffness 영향도 `max\|k_d\|/max\|k_m\|` 상한 | 1e-4 |
| `criteria.shell.gpuResidualRefine` | GPU 반복개선 잔차 게이트 | 1e-10 |
| `criteria.shell.*` (기타) | phase6 §6A 게이트 키 승격 (M9c) | §6A 표 |
| `criteria.loadgen.equilTol` | 슬래브 전달 평형 | 1e-10 |
| `criteria.solver.pivotWarn` | near-singular pivot ratio 경고 기준 | 1e-8 |
| `criteria.xval.displacementReaction` | 절점변위·반력 tolerance | 1e-4 |
| `criteria.xval.memberForce` | 부재 단부력·중간단면력 tolerance | 1e-3 |
| `criteria.xval.period` | 고유주기 tolerance | 1e-3 |
| `criteria.xval.massParticipation` | 질량참여율 tolerance | 1e-3 |
| `criteria.xval.rsaBaseShear` | RSA 밑면전단 tolerance | 5e-3 |
| `criteria.xval.pdelta` | P-Delta 증폭·θ tolerance | 5e-3 |
| `criteria.xval.buckling` | 좌굴 λcr tolerance | 5e-3 |
| `rsa.applyBaseShearScaling` | scaling 전 응답 적용 | true |

> 초기 기본값은 개발 seed다. 기준 적용값은 preset에서 확정하며, 값 하드코딩 PR은 반려한다 (phase6 원칙 유지).
