# Phase 10 독립 검증 리뷰 — 코드베이스 정합성·수치 정확도

```yaml
review: P10-INDEPENDENT-VERIFICATION
date: 2026-07-23
reviewer: independent code+numeric verification pass
scope: Phase 10 신규 소스 (00c73e7..HEAD, src/ +9,443 lines)
original_head: 5fb3993 (feat: complete phase 10 milestone 11 release gate)
original_verdict: 1 HIGH 결함(수치) + 1 HIGH 테스트 커버리지 공백 + 2 MEDIUM, 나머지 PASS
current_verdict: REMEDIATED — CPU f64 수치·통합 지적 해결, 외부 XV·formulation-native WebGPU release 차단 유지
review_state: superseded-by-appendix-a-remediation
release_impact: release 차단 유지 (XV-02~10 required-source 및 formulation-native WebGPU 장치 qualification 필요)
```

> **현재 상태 안내:** §0~§8은 `5fb3993` 시점의 원 리뷰를 변경하지 않고 보존한 역사 기록이다.
> 현재 판정은 [Appendix A](#appendix-a--2026-07-23-remediation--resolution)가 우선하며,
> CPU f64 지적은 해결됐지만 제품 release와 사용자 모델 설계 전이는 계속 차단된다.

## 0. 요약 (TL;DR)

Phase 10 M0~M11이 전부 커밋됐고(오늘 2026-07-23 HEAD), Phase 10 전용 테스트(`test:p10`)는 **전부 통과**한다. 신규 모듈 대부분은 정식(formulation)이 정확하고, 검증·제한(limitation) 라벨링과 release-gate 분리가 정직하게 되어 있다.

그러나 **판/셸 굽힘 요소(DKQ plate, M9b·M9c)에 심각한 수치 결함**이 있다. 이 요소는 **정사각형 패널에서만 정확**하고, 종횡비가 커지면 오차가 급증한다(직사각형 2:1에서 7.8%, 4:1에서 61%, 두꺼운 4:1에서 219%). 근본 원인은 횡전단 처리(감차적분 + 경험적 0.415 안정화)와 굽힘-전단 결합이 **요소 종횡비에 대해 불변이 아니기** 때문이다. 이 요소는 `linear3dAssembly.js`에서 전역 강성에 **직접 조립**된다.

이 결함이 여태 드러나지 않은 이유는 **내부 검증이 정사각·중간두께(a/t=20) 판 한 케이스만 검사**하기 때문이다(`p10-m9b-slab-plate.mjs`, `<1% PASS`). 그래서 M9 코드리뷰가 "patch test 통과 / 판 0.75% 오차"를 근거로 완료 판정했지만, 그 근거는 **가장 유리한 단일 케이스**에 국한된다.

**완화 요인**: shell FEM은 이미 `release-blocked`(외부 교차검증 XV-10 전까지 설계 전달 차단)이고, 모델이 `formulation`을 명시할 때만 쓰이는 opt-in이며, 등가모델(옵션 B) 경로는 영구 유지된다. 따라서 이 결함은 **정확히 외부 교차검증 게이트가 잡도록 설계된 종류**다. 다만 (a) 내부 테스트가 "9/9 PASS"로 잘못된 확신을 주고, (b) 외부 XV가 성공하려면 이 결함을 먼저 고쳐야 하므로, **지금 고치는 것이 외부 검증 사이클보다 저렴하다.**

---

## 1. 리뷰 방법

- 범위: `git diff 00c73e7..HEAD -- src/` (신규/변경 109개 파일, +9,443 lines) 중 수치 정확도가 중요한 신규 자립 모듈 우선.
- 손 검산: 강성/변환 행렬의 항별 부호·인덱스 검증.
- 수치 프로브: 폐형해(Navier 급수, Timoshenko 보)와 대조하는 독립 스크립트를 작성해 실제 실행.
- 테스트: phase별 러너를 개별 실행(`run-phase{7,8,9,10}-tests.mjs`, `run-milestone-tests.mjs`).

## 2. 테스트 현황

| 스위트 | 결과 | 비고 |
| --- | --- | --- |
| `test:p10` (Phase 10) | **PASS** (EXIT 0) | M0~M11 전 evidence green |
| `test:p7` | **PASS** | |
| `test:p9` | **PASS** | |
| `test:p8` | 미완(타임아웃) | 비선형 e2e가 무거워 리뷰어 타임아웃에 SIGTERM(143). **실제 assertion 실패는 관측되지 않음** |
| `run-milestone-tests` (m0~m50) | 미완(타임아웃) | 서버 spawn e2e 포함으로 느림. m46에서 SIGTERM(143) — 타임아웃 산물 |

- 참고: 지난 세션의 `m17-e2e-entrypoint.mjs` 버전 문자열 불일치(`p8-m10` vs `p9-m10`)는 **이미 수정됨**.
- 참고: 전체 `npm test`는 이 Windows/Node 24 장비에서 서버 spawn 실패 직후 libuv `UV_HANDLE_CLOSING` assertion으로 러너가 죽는 경우가 있다(테스트 로직이 아닌 실행환경 이슈). CI는 Linux에서 도는 것을 권장.

---

## 3. HIGH — 판/셸 굽힘 요소의 종횡비 결함

**위치**: `src/solver/shell/shellElementMath.js`(`dkqPlateLocal`, `bendingB`, `shearB`) → `src/solver/shell/slabPlateDkq.js`(M9b), `flatShellAllmanDkq.js`(M9c, 판요소를 중첩하므로 결함 상속) → `src/solver/linear3dAssembly.js:132-145`(전역 조립).

### 3.1 재현 (독립 프로브, 6×6 메시, 단순지지 정사각/직사각 판, 등분포, Navier 급수 대조)

| 케이스 | 요소 계산 | Navier 폐형해 | 상대오차 |
| --- | --- | --- | --- |
| 정사각 4×4 (a/t=20) | 4.694e-4 | 4.732e-4 | **0.81%** ✅ |
| 직사각 6×3 (2:1) | 4.022e-4 | 3.733e-4 | **7.75%** ⚠ |
| 직사각 8×2 (4:1) | 1.503e-4 | 0.933e-4 | **61.06%** ❌ |

두께 민감도(4:1 판 고정, 두께만 변경):

| 두께 t | 단변/두께 | 상대오차 |
| --- | --- | --- |
| 0.8 | 3 | **219%** |
| 0.4 | 5 | 153% |
| 0.2 | 10 | 61% |
| 0.1 | 20 | 33% |
| 0.05 | 40 | 80% |

올바른 4절점 판요소(MITC4/정식 DKQ)라면 6×6 메시에서 어떤 종횡비·두께든 수 % 이내로 수렴해야 한다.

### 3.2 진단

- 오차가 **두꺼운 판일수록, 종횡비가 클수록** 커진다 → 지배 원인은 **횡전단**이다. `dkqPlateLocal`은 전단을 (중앙 1점) 감차적분 결과에 `stabilization=0.415`로 완전적분을 혼합(`K += reduced + 0.415*(full-reduced)`)하는데, 이 경험적 계수와 혼합이 **정사각 요소에만 캘리브레이션**되어 종횡비 불변이 아니다.
- 부차적으로 `bendingB`의 굽힘 곡률이 참조하는 회전 DOF와 `shearB`의 전단이 참조하는 회전 DOF가 교차되어 있어(κx는 θ@idx1, γxz는 θ@idx2), Mindlin 판의 굽힘-전단 정합성이 의심된다. 단, 단순 transpose 수정을 시도하니 정사각 케이스가 오히려 38% 과강성이 되어, **한 줄 수정으로 해결되지 않는 정식 자체의 문제**임을 확인했다.
- 결론: `stabilization=0.415`는 인용 없는 매직 상수이며, 이 요소는 **검증된 판요소 정식(MITC4 또는 정식 DKQ)으로 재유도/교체**가 필요하다.

### 3.3 영향 범위

- `formulation: 'plate'` 또는 `'shell'`을 가진 모든 shell 요소 → 전역 정적 해석의 변위·부재력이 비정사각 패널에서 크게 틀림.
- Modal/RSA도 같은 강성을 쓰므로 셸이 포함된 동적 결과에 파급.
- **완화**: 설계 전달은 release-gate에서 차단됨(`externallyCrossValidated=false`). 등가모델(옵션 B)은 영향 없음.

### 3.4 권고

1. **(필수)** 판/셸 굽힘 요소를 검증된 정식(MITC4 권장, 종횡비/두께 불변)으로 교체하거나, 최소한 `0.415` 안정화의 종횡비 의존성을 제거하도록 재유도.
2. **(필수, §4와 연동)** 비정사각·두꺼운·얇은 케이스로 회귀 테스트 확장 후 재검증.
3. 교체 전까지 `slabPlateDkq`/`flatShellAllmanDkq` 결과에 **"정사각 근접 패널에 한해 신뢰"** 제한 문구를 강제.

---

## 4. HIGH — 테스트 커버리지 공백이 §3을 은폐

**위치**: `tests/p10-m9b-slab-plate.mjs`, `tests/helpers/p10Shell.mjs`(`squarePlateBenchmark`, `wallCantileverBenchmark`).

- 판 벤치마크는 **정사각(a=4,a=4)·단일 두께(a/t=20)** 한 케이스만 `relativeError < 1e-2`로 검사한다. 이는 §3.1에서 본 **유일하게 통과하는 케이스**다.
- 정사각·등분포는 x↔y 완전대칭이라, §3.2의 전단/굽힘 결함이 대칭성에 가려 드러나지 않는다.
- 그 결과 M9 evidence "9/9 PASS"와 M9 코드리뷰의 "patch test 통과 / 0.75% 오차" 판정이 **실제 정확도를 과대평가**한다.

**권고**: 셸 검증 매트릭스에 최소한 (a) 직사각 2:1·4:1 판, (b) 두꺼운/얇은 판(a/t = 5·10·40), (c) 왜곡(비직교) 요소 patch test, (d) membrane 종횡비 케이스를 추가하고, 통과 기준을 명시. 이 케이스들이 green이 되기 전에는 shell FEM의 내부 gate를 PASS로 두지 않을 것.

---

## 5. MEDIUM — QM6 벽 membrane 왜곡 민감도

**위치**: `src/solver/shell/shellElementMath.js`(`qm6MembraneLocal`, `incompatibleB`).

- 프로브(벽 캔틸레버): 세장(2×4) 요소는 2.6~3.9%로 양호하나, **단변형(6×2, 요소 종횡비 3:1)에서 14.5%** 오차.
- 원인: 비적합 모드 gradient를 **가우스점 Jacobian**(`shape.inverseJacobian`)으로 계산한다. 원조 Wilson Q6는 왜곡 요소에서 patch test를 잃으며, 이를 고치는 QM6(Taylor–Beresford–Wilson)는 **요소 중심 Jacobian**으로 비적합 모드를 평가한다. 이름은 "QM6"이나 구현은 중심 보정이 빠진 Q6에 가깝다.
- 심각도는 판요소보다 낮음(파국적 아님). 왜곡/고종횡비 메시에서 정확도 저하로 문서화·개선 필요.

**권고**: 비적합 모드 gradient를 중심 Jacobian으로 평가(정식 QM6)하거나, 왜곡 요소 정확도 한계를 명시하고 §4 patch test로 강제.

---

## 6. MEDIUM/LOW — 명칭 vs 실제 정식

- `flatShellAllmanDkq`: "Allman drilling + DKQ"를 표방하나 실제로는 **QM6 membrane + 페널티 drilling 안정화 + 안정화된 Mindlin 판**이다. drilling은 Allman 회전 보간이 아니라 `drillingAlpha` 페널티 stabilization. 외부 검토자가 정식을 오인할 수 있으므로 명칭을 실제 구현에 맞게 조정 권고(version 문자열/`drilling.method` 라벨).

---

## 7. PASS — 정확하고 잘 구현된 부분 (근거)

| 모듈 | 확인 내용 |
| --- | --- |
| Timoshenko (M2, `timoshenko.js`) | φ = 12EI/(GA_s L²) 및 **Iy↔Az, Iz↔Ay 교차 매핑 정확**(자주 틀리는 지점). KG는 EB 유지로 정직하게 limitation 라벨 |
| 부재 오프셋 (M4, `memberOffsets.js`) | rigidArmTransform12의 6개 커플링 항 손 검산 전부 정확(`u_face=u_joint+θ×r`), 합성순서·복원 `M_joint=M_face+r×F_face` 정합 |
| 부분강접 (M3, `partialFixity.js`) | fixity factor `1/(1+3/ratio)` 표준식 정확, 스케일드 대칭 정적응축·k→∞/0 감사, release 충돌 검출 |
| 패널존 (M4, `panelZone.js`) | `K_pz=G·tp·db·dc` 회전스프링, 부분강접 머신 재사용, 스프링 충돌 검출 |
| 변단면 (M6, `taperedMember.js`) | **force-based flexibility + Gauss–Legendre** — 비프리즘 부재의 정확한 방법. 평형행렬 B 변환·segments 연속성 검증 정합 |
| RSA base-shear scaling (M0, `baseShearScale.js`) | `scale=max(1,V_min/V_RSA)`를 부재력·변위·관성력 전반에 일관 적용, 이중적용 가드. **v3 명세서가 지적한 `applied:false` 공백을 제대로 해소** |
| 전반 | 임계값 config 외부화, 인장양수 규약, 정직한 limitation 코드, 구현완료 vs 외부검증 분리(release gate) 일관 |

---

## 8. 결론 및 우선순위

Phase 10은 **범위(무엇을 지원/미지원하는지)를 정직하게 라벨링**했고 프레임 계열 신규 기능(Timoshenko·오프셋·부분강접·패널존·변단면·RSA scaling)은 정식이 견실하다. 유일한 실질 결함은 **판/셸 굽힘 요소의 종횡비 정확도**이며, 이는 이미 release-blocked 범위 안에 있으나 내부 테스트가 이를 은폐하고 있다.

**권고 우선순위**
1. **[HIGH]** §4 — 셸 검증 매트릭스에 비정사각·두께·왜곡·patch test 추가(먼저 해서 결함을 CI에 고정).
2. **[HIGH]** §3 — 판/셸 굽힘 요소를 MITC4 등 검증된 정식으로 교체/재유도. 외부 XV-10 전 완료 필요.
3. **[MEDIUM]** §5 — QM6 중심 Jacobian 보정 또는 왜곡 한계 명시.
4. **[LOW]** §6 — 명칭을 실제 정식에 맞게 조정.
5. 프레임 계열 기능(§7)과 release gate 구조는 **그대로 유지**.

> 재현 스크립트는 `tests/helpers/p10Shell.mjs`를 종횡비/두께 파라미터화하면 그대로 얻을 수 있다(리뷰 중 임시 프로브로 실행·확인).

---

## Appendix A — 2026-07-23 remediation / resolution

이 appendix는 위 독립 리뷰 원문과 당시 측정값을 수정하지 않고, 지적별 후속조치와 현재 판정을 기록한다.
원문의 thick-plate Kirchhoff 비교는 결함 탐지 프로브로는 유효했지만 최종 합격 기준으로는 횡전단 변형을 포함하지
않는다. remediation qualification은 이를 Reissner–Mindlin Navier 기준으로 교체하고 종횡비·두께·메시수렴을 함께
검사한다.

| 원문 지적 | 조치 | 현재 내부 판정 |
| --- | --- | --- |
| §3 plate 종횡비/두께 결함 | 경험계수 `0.415`, reduced/full shear 혼합, 임의 `w` 대각항을 제거하고 Bathe–Dvorkin MITC4 covariant tying shear로 교체 | RESOLVED — CPU f64 |
| §4 테스트 공백 | 정사각·2:1·4:1, 단변/t=15~100, 8×8→10×10 수렴, raw 강체/곡률, 모달 시험 추가 | RESOLVED — CPU f64 |
| §5 QM6 왜곡 민감도 | 중심 Jacobian과 `det(J0)/det(J)` mapping을 쓰는 QM6-EAS, 내부 4모드 정적응축, 왜곡 3×3 patch 추가 | RESOLVED — CPU f64 |
| §6 명칭 불일치 | canonical `slabPlateMitc4`와 `flatShellQm6Mitc4`를 추가하고 과거 DKQ/Allman 이름은 deprecated facade로 한정 | RESOLVED |
| 독립 후속감사: drilling | 절점별 독립 대각 스프링을 `θn−0.5(v,x−u,y)` Hughes–Brezzi curl-compatible penalty로 교체 | RESOLVED — CPU f64 |
| 독립 후속감사: warped rigid mode | `U_plane=U+d(n×R)` 기준면 강체팔을 넣고 flat-shell의 사후 rigid-energy projection 제거 | RESOLVED — CPU f64 |
| 독립 후속감사: 왜곡 Q4 압력 | `f_i=∫N_i p n detJ` 2×2 consistent load로 교체해 총력과 도심모멘트 보존 | RESOLVED — CPU f64 |
| 통합 후속감사: 셸 입력 계약 | 셸 ID 중복, 잘못된 결과 집계, 압력 target/value alias 충돌 및 binary round-trip을 공통 typed resolver로 fail-closed 처리 | RESOLVED |
| 통합 후속감사: 해석 결과 전파 | 정적·모달 UI/API 결과에 수치 qualification과 사용자 모델 mesh-convergence 차단 사유를 전파 | RESOLVED |
| 통합 후속감사: 평형·질량원 | 셸 압력을 6성분 평형 감사에 포함하고 물리 셸 면적질량을 modal mass source에 포함; 생성/massless 연결부재는 제외 | RESOLVED |
| 증거 후속감사: M11 무결성 | exact case/version/hash/source hash, 중복, 수치 재계산, 성능 측정 계약을 검증해 forged PASS를 차단 | RESOLVED |

확대된 M9 CPU f64 evidence 계약은 35개 record 전부 PASS를 요구하며 committed hash는
`45389db66c1633dc99e11566`이다. CPU 요소/커널은 내부 수치 qualification을 통과했지만, 사용자 모델 설계 전이는
메시수렴 provenance가 없으므로 차단한다. warning-warped 요소는 reference-plane 근사에 대한 공학검토도 필요하다.

### 남은 release blocker

- 엄격한 외부-source 기준에서는 XV-01만 green이다. XV-02 손계산은 외부 검증원으로 부적격이고 XV-03~10의
  required-source artifact가 아직 green이 아니다.
- 현재 WebGPU 셸 구현은 CPU가 미리 계산한 f32 행렬의 reconstruction, fixed-order gather, generic recovery
  operator 적용이다.
- QM6-EAS·MITC4·drilling을 재료·기하에서 직접 만드는 formulation-native WebGPU stiffness generation은
  미구현·미적격이며, precomputed transport parity는 이를 대체하지 않는다.

따라서 독립 리뷰의 CPU 수치 결함은 해소됐지만 M11의 `release.allowed=false`와
`externallyCrossValidated=false`는 XV 및 formulation-native GPU qualification이 끝날 때까지 유지한다.
