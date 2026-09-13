# Phase 14 Winkler Foundation Production Design

```yaml
version: p14-winkler-design-v2
status: review-ready
milestone: P14-M1
benchmark_target: SB7
behavior_scope: linear-bilateral-distributed-foundation
```

## 1. 결정

단순히 보를 잘게 나누고 절점스프링을 배치하는 편의기능만 추가하지 않는다. production owner는 frame displacement interpolation에 기초한 **분포 Winkler foundation stiffness**로 구현한다. 절점스프링 모델은 migration/import 또는 결과 비교용 근사 옵션으로만 남긴다.

## 2. 공학 모델

local transverse displacement `w(x)`와 ground displacement `wg(x)`에 대해

```text
p(x) = k(x) [w(x) - wg(x)]
Kf = ∫ N(x)^T k(x) N(x) dx
rf = ∫ N(x)^T k(x) [N(x)d - wg(x)] dx
Uf = 1/2 ∫ k(x) [w(x)-wg(x)]² dx
```

Phase 14 최초 범위는 `wg=0`, `k≥0`, bilateral linear다. compression-only, uplift/gap, plastic soil, coupled p-y/t-z/q-z와 frequency-dependent foundation은 비범위다.

## 3. 요소 정식화

### 3.1 Euler-Bernoulli 기준

균일 `k`, 길이 `L`, bending DOF `[wi, θi, wj, θj]`에 대한 Hermite consistent matrix의 기준형은 다음이다.

```text
kL/420 *
[ 156,   22L,    54,  -13L
   22L,  4L²,   13L,  -3L²
    54,   13L,   156,  -22L
  -13L, -3L²,  -22L,   4L² ]
```

이 식은 독립 reference fixture로 사용한다. production 구현은 실제 element interpolation을 공통 integrator에 제공해 `∫NᵀkN dx`를 계산하고, hard-coded benchmark matrix 분기를 두지 않는다.

### 3.2 Timoshenko·3D

- local-y, local-z foundation을 독립 지원한다.
- local-y는 `[uy_i, rz_i, uy_j, rz_j]`, local-z는 `[uz_i, -ry_i, uz_j, -ry_j]`에 사상한다. 부호는 기존 frame local-axis 계약을 단일 owner로 사용한다.
- Timoshenko가 켜진 경우 현재 beam kinematics와 일치하는 transverse interpolation을 사용한다.
- 기존 fixed-end load 경로의 EB/Timoshenko shape function과 5점 Gauss 적분을 공통 보간 모듈로 추출해 foundation과 공유한다. production과 reference가 서로 다른 보간 정의를 갖지 않게 한다.
- 조립 순서는 `Ks(frame/taper) → Kf 추가 → binary release condensation → partial-fixity/panel-zone condensation → offset/global transform → dense/sparse assembly`로 제안하고, M1 ADR과 element-force recovery test로 동결한다.
- `assembleLinear3D`와 stiffness-only/modal/P-Delta assembly가 같은 foundation builder를 호출해야 한다. 어느 한 경로만 구현하면 안 된다.
- foundation은 elastic stiffness에만 기여하고 질량과 geometric stiffness를 자동 생성하지 않는다.
- exact/dynamic-stiffness Winkler 전용 요소는 독립 oracle로만 사용한다. v1 production owner는 기존 frame 요소에 consistent distributed matrix를 결합하는 방식이다.

## 4. 데이터 모델

`foundationProperties[]`와 `member.foundationId`를 additive하게 추가한다.

필수 필드:

- `id`, `type=winkler-line`, `behavior=linear-bilateral`
- `localY.lineStiffness`, `localZ.lineStiffness`
- 선택적 derivation: `subgradeModulus`, `tributaryWidth`, source·unit trace
- version, name, notes

canonical solver 값은 line stiffness `F/L²`이다. subgrade modulus `F/L³`와 tributary width를 보존하되, direct 값과 derived 값이 함께 있으면 owner 입력방식과 parity tolerance를 명시한다.

validation:

- finite nonnegative stiffness
- line stiffness와 derived inputs가 함께 있으면 parity 확인
- truss/cable/zero-length/shell assignment 차단
- local axis 미정·길이 0·unsupported nonlinear analysis 차단
- 단위 차원 `F/L²` 강제
- schema v5→v6 additive migration, default `foundationProperties=[]`, unique reference, copy/delete/undo/save-reopen 계약

v1은 uniform·full-member·`wg=0`·frame-only로 제한한다. generated member와 taper는 별도 qualification 전까지 fail-closed한다. offset을 지원할 때 foundation 작용 길이는 변형 가능한 clear span으로 정의하며, gross span 작용이 필요하면 명시적 member split을 사용한다.

## 5. 조립·복구 데이터 계약

assembly/release 복구와 설계용 frame 내력을 분리하기 위해 element metadata를 다음처럼 보존한다.

```text
klStructural = Ks
klFoundation = Kf
klTotal      = Ks + Kf
```

- 조립과 released DOF 복원은 `klTotal`을 사용한다.
- 보의 설계용 end/station force는 `klStructural·d + f0_external`을 사용한다.
- 지반 등가절점력을 보 전단·모멘트에 단순 혼합하지 않는다.
- soil reaction은 `-k(x)N(x)d`로 별도 복구하고 station 전단·모멘트 적분에는 이 변위종속 분포하중을 포함한다.
- foundation member의 변형 복구는 foundation coupling을 무시하는 기존 fixed-end bubble 보정에 의존하지 않고 동일 interpolation을 사용하며 mesh-convergence gate를 둔다.

## 6. 결과 계약

member station별:

- `foundationReactionLocalY/Z` — `F/L`
- `foundationResultantY/Z` — `F`
- resultant centroid와 end-equivalent force
- beam displacement, shear, moment와 foundation energy

case audit:

```text
external load + support reaction + integrated foundation reaction = residual
```

raw station curve와 equivalent nodal/resultant를 구분한다. UI·CSV·report는 local axis와 부호를 표시한다.

전체평형에는 support reaction뿐 아니라 적분한 foundation force와 global moment를 포함한다. `1/2 dᵀKf d`와 station 적분 에너지도 서로 대조한다.

## 7. 해시·캐시·wire 계약

foundation 변경이 stale result와 factor cache를 반드시 무효화하도록 다음 owner를 동시에 갱신한다.

- `analysisDomainHashes.propertyHash`: `foundationProperties`와 `member.foundationId`
- element descriptor formulation/property hash
- `factorGroups.stiffnessIdentity`
- canonical snapshot과 expansion trace
- DomainBinary wire contract/version
- Phase 13 capability qualification impact map

foundation assignment·강성·derivation owner가 바뀌었는데 위 identity가 같으면 production defect로 판정한다. dense/sparse/cache/hybrid parity와 변경 전후 stale test를 mandatory로 둔다.

## 8. 제품 표면

### Project/CLI/Agent

- `createFoundationProperty`
- `assignMemberFoundation`
- `previewFoundationDerivation`
- `inspectFoundationPreflight`
- `queryFoundationReaction`

모든 mutation은 Preview → Apply → Undo와 model hash를 사용한다.

### UI

- Member Inspector의 `Elastic Foundation` section
- direct line stiffness / soil modulus × width 입력방식 선택
- local-y/z 방향 glyph와 tributary width preview
- reaction diagram, resultant, equilibrium warning
- unsupported behavior는 비활성화가 아니라 reason code와 함께 표시

## 9. 구현 순서

1. schema·unit dimension·migration·hash
2. independent Hermite matrix fixture
3. common foundation integrator와 EB local matrix
4. Timoshenko·3D transform·release·offset coupling
5. assembly, solver preflight, stiffness-only/modal/P-Delta와 sparse path
6. structural/foundation/total matrix 분리와 force/reaction/energy recovery
7. property·element·factor·wire hash와 stale invalidation
8. CLI·Agent API·UI·report parity
9. performance·failure·save/reopen·rollback
10. 그 후에만 SB7과 MIDAS/STRIX 비교 실행

## 10. 내부 개발시험

- `k=0`은 기존 frame과 tolerance-identical
- matrix symmetry, PSD와 analytical uniform-k matrix parity
- rigid translation `w=c`에서 `Uf=1/2·kL·c²`, `k<0`은 reject
- load scaling, unit round-trip, local-axis 90° rotation, member reversal
- 1·2·4·8·16 요소에서 continuum solution 수렴
- external + support + foundation force/moment 평형 상대잔차 `≤1e-8`
- `1/2 dᵀKf d`와 적분 energy parity
- release·offset·Timoshenko 각각의 independent small model
- dense/sparse/cache/hybrid result와 factor identity parity
- negative·NaN·unknown reference·unsupported formulation·stale cache failure injection
- 10,000-member sparse assembly에서 선형 memory와 performance budget

## 11. 향후 SB7 동결 후보

아래 값은 구현 후 독립 qualification과 상용 프로그램 비교에 사용할 **계획 fixture**이며, 현재 실행 결과가 아니다.

```text
L = 180 in
E = 3600 ksi
I = 139,968 in^4
kline = 16.6667 kip/in^2
Pcenter = 500 kip
support = pin-roller
selfWeight = off
Uz reference = -0.0893327 in
My reference = 17,697.995034 kip-in
candidate tolerance = 0.1% each
```

기존 node-spring 시험은 regression·수렴 비교용일 뿐 분포 Winkler qualification으로 승격하지 않는다. reference provenance와 full-precision hash를 M0에서 확정하기 전에는 위 tolerance도 release gate로 사용하지 않는다.

## 12. 완료조건

`implementation-complete`:

- schema부터 report까지 기능이 연결되고 focused tests 통과

`independently-qualified`:

- exact continuum/Hermite reference, refinement, 평형·에너지·변형시험 통과

`cross-solver-compared`:

- 동일 모델의 MIDAS·STRIX full-precision 결과와 mapping audit 완료

`release-allowed`:

- migration, UI/API/report parity, failure injection, performance, review와 manifest가 green
