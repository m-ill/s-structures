# Phase 15 Qualification Policy

```yaml
version: p15-qualification-policy-v1
status: proposed
created_at: 2026-08-27
extends: docs/phase14/QUALIFICATION_POLICY.md
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

## 1. 정책 목적

Phase 14의 R1~R5 reference 등급과 claim ladder를 유지한다. Phase 15는 다음 결함을 추가로 차단한다.

- 잘못된 benchmark 조립·경계·probe를 요소식 실패로 오판
- 너무 거친 메시 한 점으로 PASS/FAIL 판정
- solver fallback·false convergence·평형 실패 은폐
- 부호를 절대값으로 제거하거나 여러 성분의 상쇄로 PASS
- synthetic input이 예정한 0%·MAC=1을 실제 qualification으로 표시
- timestamp/null payload 때문에 결정성이 없는 evidence

## 2. Reference 역할

| 등급 | 역할 | Phase 15 사용 |
| --- | --- | --- |
| R1 | 폐형해·정확해·보존법칙 | SB1·SB7·SB8 일부·SB9·SB10·PD1·판 Navier |
| R2 | NAFEMS·CSI·ASME·공개 benchmark | SB2·SB3·SB5·SB6·SM5와 공개값 |
| R3 | production import가 없는 독립 구현 | high-order membrane/plate, generalized eigen, exact recurrence |
| R4 | MIDAS·STRIX·SAP2000 등 별도 solver | 동일 메시·동일 공학모델 교차비교 |
| R5 | S-Structures 자체 사양·sensitivity | shell stabilization custom qualification |

R4 일치는 primary truth를 대체하지 않는다. P3S2-SS는 R5 custom capability이며 STRIX P3S2 동일 요소 PASS라고 부르지 않는다.

## 3. Manifest 사전 동결

각 case는 실행 전에 다음을 갖는다.

```text
caseId / specVersion / claimScope
source title/version/page/file hash/license note
reference level and full-precision values
geometry/material/section/support/load/mass/damping
mesh or step sequence
unit/axis/sign/result kind/probe
solver settings and expected formulation path
relativeTolerance (fraction) / absoluteTolerance / rationale
mandatory invariant/metamorphic/negative-control IDs
review owner and approval hash
```

결과를 본 뒤 tolerance·probe·reference를 바꾸면 기존 evidence는 `INVALIDATED`다. tolerance를 `%`로 저장하지 않는다.

## 4. 공통 정적 gate

사례별 characteristic scale과 floor는 manifest에 고정한다.

| Gate | 기본 목표 |
| --- | --- |
| force equilibrium | normalized residual ≤ `1e-8` |
| moment equilibrium | normalized residual ≤ `1e-8` |
| linear energy | normalized residual ≤ `1e-8` |
| matrix symmetry | normalized residual ≤ `1e-12` |
| dense/sparse displacement | relative difference ≤ `1e-9` |
| dense/sparse force/result | relative difference ≤ `1e-8` |
| load scaling 0.1×/10× | relative linearity error ≤ `1e-9` |
| unit round-trip | relative difference ≤ `1e-10` |
| permutation | relative difference ≤ `1e-10` |

iterative solver는 scaled residual뿐 아니라 원래 system의 true residual을 기록한다. fallback이 발생하면 case가 자동 실패하는 것은 아니지만 이유·경로·최종 gate가 모두 evidence에 있어야 한다.

## 5. 공통 고유치 gate

| Gate | 기본 목표 |
| --- | --- |
| generalized eigen residual | ≤ `1e-8` |
| mass orthogonality off-diagonal | ≤ `1e-8` |
| dense/sparse eigenvalue difference | ≤ `1e-8` |
| 동일 모델 dense/sparse mass-weighted MAC | ≥ `0.999999` |
| benchmark/reference matched MAC | 사례별, 기본 ≥ `0.99` |

mode는 번호가 아니라 mass-weighted MAC와 participation으로 매칭한다.

## 6. 사례별 primary gate

| 사례 | Primary acceptance | 수렴·추가 gate |
| --- | --- | --- |
| SB2 | R2 stress 오차 ≤3%, 동일 메시 R4 차이 ≤0.75% | 24×12→48×24→64×32→96×48, 마지막 두 단계 변화 ≤1.5% |
| SB3 | normalized displacement 오차 ≤1% | 4→8→12→16, 마지막 변화 ≤0.5%, rotation/reflection |
| SB5 | 8 coefficients 각각 ≤1% | 각 3+ level, 5:1 short-side 8→12→16→24 이상, final change ≤1% |
| SB6 | hard-SS 6 coefficients 각각 ≤1% | 각 3+ level, hard/soft negative control, thin-limit |
| SB7 | center displacement·moment 각각 ≤0.1% | 8→16→32→64, endpoint closure, dense/sparse |
| P3S2-SS | custom static/period shift 각각 <0.5%, MAC ≥0.99 | actual solve per point, energy·null-mode·range gates |
| SB1 | signed closed-form quantities 각각 ≤0.01% | 1→2→4→8, energy·reaction |
| SB8 | six frequencies 각각 ≤0.1% | 32→64→128→256, MAC·mass·Timoshenko scope |
| SB9 | bending·axial·combined 각각 ≤0.1% | component identity와 refinement |
| SB10 | signed forces/displacements/reactions 각각 ≤0.1% | magnitude-only mutation FAIL |
| PD1 | four published responses 각각 frozen tolerance | mesh/load-step, stage equilibrium·work |
| SM5 | first three eigenvalues 각각 ≤0.5%, MAC ≥0.99 | mass unit·orthogonality·participation |

reference 반올림 정밀도보다 엄격한 tolerance를 주장하지 않는다. 위 값과 source precision이 충돌하면 M0에서 더 보수적인 tolerance를 승인하고 이유를 manifest에 기록한다.

## 7. 필수 변형시험

적용 가능한 선형 사례는 다음 batch를 공통 실행한다.

1. 하중 0.1×·10× scaling
2. E·I·k·mass의 차원 scaling law
3. 30°·90° rigid rotation과 좌우 반사
4. N-mm ↔ kN-m round-trip
5. node/member/element 순서 permutation
6. mesh/mode/step refinement
7. 외력-반력·moment·energy audit
8. dense/sparse parity
9. zero load, invalid/near-singular와 failure injection

PD1처럼 비선형 경로는 선형 하중 scaling 대신 zero-nonlinearity limit, monotonic trend, load-step refinement와 state rollback을 사용한다.

## 8. Negative-control 정책

qualification suite 자체가 오류를 잡는지 다음 mutation을 실행한다.

- SB2·SB3: local matrix를 global DOF에 직접 조립
- SB5: 과소 메시와 preconditioner 제거
- SB6: hard fixture를 w-only soft로 치환
- SB7: `foundationEnd` 누락
- P3S2-SS: 동일 response vector 재사용, out-of-range clamp, solve 생략
- SB10: absolute magnitude 비교
- SB9: bending 또는 axial component 제거
- SB8/SM5: mass unit·shear deformation mutation

열거된 mutation kill rate가 100%가 아니면 관련 capability는 PASS가 아니다.

## 9. Evidence 상태

| 상태 | 의미 |
| --- | --- |
| PASS | 모든 frozen mandatory gate와 review 충족 |
| FAIL | 수치·불변식·수렴·평형·mutation·NFR 위반 |
| BLOCKED | source/input/environment/license/owner 승인 없음 |
| NOT_RUN | 실행 전 |
| NOT_APPLICABLE | 승인된 기술 사유와 reviewer 존재 |
| INVALIDATED | source/code/reference/tolerance/input/hash 변경 |
| SELF_TEST | 내부 invariant만 통과, 독립자격 아님 |

`CUSTOM_PASS`라는 단일 상태는 사용하지 않는다. custom capability도 `SELF_TEST`, `internally-verified-custom`, `independently-qualified-custom`을 구분한다.

## 10. Claim·release 규칙

- benchmark 한 숫자 PASS만으로 capability를 release하지 않는다.
- `independently-qualified`는 R1~R3와 mandatory convergence/metamorphic/mutation을 모두 요구한다.
- `cross-solver-compared`는 동등 모델 mapping과 R4 full-precision 결과가 있을 때만 사용한다.
- `releaseAllowed`는 migration, product surface, NFR, code review와 clean rerun까지 요구한다.
- `S-Structures custom stabilization independently-qualified`는 가능하지만 `STRIX P3S2 identical` 표기는 금지한다.
- “MIDAS·STRIX와 동일 성능”은 명시된 사례·버전·metric·tolerance 범위 밖에서는 사용하지 않는다.
