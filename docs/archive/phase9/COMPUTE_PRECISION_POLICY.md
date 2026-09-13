# Phase 9 Compute Precision and Determinism Policy

```yaml
version: p9-compute-precision-v1
status: proposed
canonical_result_precision: f64
webgpu_runtime_precision: f32-or-f16-only-at-planning-baseline
```

## 1. 목적

GPU 사용 여부와 관계없이 구조해석의 평형, 설계상태, event, 에너지와 보고서가 신뢰할 수 있는 범위에 있도록 precision, correction, determinism과 qualification 규칙을 고정한다.

## 2. 플랫폼 사실

Phase 9 계획 시점의 WGSL concrete floating-point type은 `f32`와 선택적 `f16`이다. `AbstractFloat`는 shader-creation 시점의 abstract type이며 GPU runtime storage/operation용 `f64`가 아니다. 공식 기준은 다음을 따른다.

- [WGSL floating-point types](https://gpuweb.github.io/gpuweb/wgsl/#floating-point-types)
- [WGSL scalar types](https://gpuweb.github.io/gpuweb/wgsl/#scalar-types)
- [WebGPU limits](https://gpuweb.github.io/gpuweb/#limits)

따라서 현재 WebGPU만으로 Phase 8 CPU/WASM `f64` solver를 동일 정밀도로 복제한다고 주장하지 않는다.

## 3. Precision mode

| Mode | 계산 | 설계전달 |
| --- | --- | --- |
| `f64-canonical` | CPU/WASM `f64` 전체 계산 | 기존 해석 qualification에 따름 |
| `mixed-f32-f64` | GPU `f32` kernel + CPU `f64` residual/correction/audit | 기능별 parity gate 통과 시 가능 |
| `f32-screening` | GPU `f32`만 사용한 preview/estimate | 불가, 항상 design-blocked |
| `reference-small` | 독립 dense/고정밀 기준구현 | 검증용, production 결과 아님 |

`mixed-f32-f64`는 CPU fallback이 아니라 하나의 명시적 algorithm이다. execution plan에 GPU operation과 CPU correction을 모두 기록한다.

## 4. Canonical numeric representation

- 모델 좌표, 재료·단면, 하중, 질량과 결과 저장은 `f64` canonical unit을 유지한다.
- GPU upload 직전에 scaling된 `f32` buffer를 생성하며 원본 `f64`를 덮어쓰지 않는다.
- index는 범위에 따라 `u32/i32`를 사용하고 overflow를 preflight한다.
- 단위변환은 GPU kernel 안에서 암묵적으로 수행하지 않는다.
- 결과 readback은 canonical unit과 `f64` container로 복원한다.

## 5. Scaling과 conditioning

mixed precision 실행 전에 다음을 평가한다.

- DOF별 characteristic scale
- diagonal 또는 row/column equilibration
- matrix symmetry error
- zero/negative diagonal과 pivot risk
- condition indicator와 rigid/mechanism suspicion
- load/displacement magnitude range

preflight는 `conditionIndicator * unitRoundoffF32`가 승인한 안정성 범위를 벗어나거나 scaling ratio가 hardware profile 한계를 초과하면 GPU solve를 차단한다. 임계값은 독립 fixture와 실제 pilot으로 고정하며 문서만으로 임의 완화하지 않는다.

## 6. SPD mixed-precision solve

첫 production 후보는 SPD system이다.

```text
1. CPU f64에서 matrix/RHS scaling과 eligibility 검사
2. GPU f32에서 preconditioned iterative solve
3. CPU f64에서 원본 K와 b로 residual r = b - Kx 계산
4. residual이 기준을 넘으면 correction system 해결
5. x <- x + delta x 후 CPU f64 residual 재계산
6. 반복 상한 안에 수렴하면 recovery/audit 진행
7. 실패하면 GPU 결과 폐기
```

다음은 금지한다.

- GPU가 보고한 f32 residual만으로 수렴 승인
- scaled matrix residual을 원본 평형 residual로 대체
- correction 반복상한을 넘긴 결과를 warning만 붙여 사용
- explicit GPU 요청을 CPU-only solve로 몰래 교체

## 7. General/indefinite matrix

softening, finite release, noncoaxial finite rotation, displacement-control augmented system과 arc-length는 general 또는 indefinite matrix를 요구할 수 있다.

P9-S1의 초기 정책:

- pivoted general/indefinite solve는 CPU/WASM `f64`를 사용한다.
- GPU는 element/fiber/assembly/reduction을 담당할 수 있다.
- GPU general solver가 추가되면 별도 ADR, pivot strategy, backward error와 singular benchmark가 필요하다.
- matrix class를 SPD로 강제하기 위한 임의 stiffness floor는 허용하지 않는다.

## 8. Assembly determinism

GPU scatter에서 동일 global entry에 여러 element contribution이 도착한다. 부동소수점 덧셈 순서가 달라지면 결과도 달라진다.

허용 가능한 방법:

1. element coloring으로 write conflict 제거
2. contribution tuple 생성 후 stable sort와 segmented reduction
3. fixed reduction tree와 compensated summation

검증되지 않은 float atomic 누산은 production에서 금지한다. assembly method, workgroup size, reduction tree와 hash를 run record에 남긴다.

## 9. Determinism 정의

### 동일 실행환경

같은 model, case, backend build, adapter identity bucket, driver/browser build와 execution plan에서는 다음을 요구한다.

- result channel hash 또는 지정 tolerance 안의 동일값
- step/iteration acceptance 동일
- normalized event order 동일
- governing combination/member/status 동일
- checkpoint/restart 연속실행 일치

### 다른 환경

GPU vendor·driver가 다르면 bitwise equality를 요구하지 않는다. 다음 channel별 tolerance와 상태 불변성을 요구한다.

- displacement, reaction, member force
- eigenvalue/period/participation
- drift, P-Delta amplification
- capacity curve와 hinge transition
- NLTH peak/history/energy
- design ratio와 OK/NG/UNCK 상태

## 10. 공통 합격기준

GPU 결과는 최소한 다음을 모두 통과해야 한다.

- 입력·matrix·result 값 finite
- CPU `f64` 원본 방정식 residual
- 기존 equilibrium force/moment audit
- constraint와 prescribed DOF closure
- member end/station recovery closure
- design envelope governing identity 또는 승인된 tie 규칙
- source/model/case/backend hash 일치

기존 analysis criteria가 더 엄격하면 기존 기준을 적용한다. Phase 9가 허용오차를 완화하지 않는다.

## 11. 기능별 parity

### 탄성 정적

- displacement/reaction/member force의 absolute max와 relative L2
- 조합별·포락 governing ID
- steel/RC design status와 governing check
- 전체 force/moment equilibrium

### Direct P-Delta

- accepted iteration과 amplification
- tangent rebuild/factor reuse trace
- story drift와 member force
- instability/limit 판정 동일

### Modal/RSA/Buckling

- eigenvalue/period 상대오차
- mass-normalized mode vector의 MAC 또는 동등 상관지표
- mode sign/order canonicalization
- participation·combined response·buckling factor

### Pushover

- accepted step과 control displacement
- base shear, story/member response
- hinge/fiber transition과 termination reason
- CPU f64 equilibrium residual

### NLTH

- selected full history와 peak/envelope
- substep/cutback sequence 정규화
- hinge/fiber event와 committed state
- input/kinetic/strain/damping energy audit
- checkpoint/restart 결과

## 12. Design status 보호

수치차가 작아도 다음 중 하나가 달라지면 설계 parity 실패다.

- OK/NG/UNCK 상태
- governing load combination
- governing member 또는 station
- hinge acceptance level
- instability 또는 termination classification
- stale/designBlocked/qualification flag

경계값 tie는 명시한 tie tolerance와 deterministic sort key를 사용한다.

## 13. Device-loss와 partial result

- device loss 이전의 uncommitted GPU trial은 폐기한다.
- 마지막 canonical checkpoint만 재시작 입력으로 인정한다.
- partial GPU result는 화면 preview가 가능해도 design result로 저장하지 않는다.
- device loss 후 CPU 재실행은 새 run ID와 새 execution plan을 사용한다.
- GPU buffer content를 canonical checkpoint로 간주하지 않는다.

## 14. Qualification 단계

1. scalar/vector kernel을 analytic reference와 비교
2. sparse SpMV/reduction을 CPU `f64`와 비교
3. small matrix independent solve와 correction 검증
4. component element/fiber parity
5. S-tier end-to-end elastic parity
6. M-tier performance와 memory
7. Pushover/NLTH state·event·energy parity
8. multi-vendor/browser/device-loss matrix

앞 단계가 통과하지 않으면 뒤 단계에서 빠른 결과가 나와도 승격하지 않는다.

## 15. Run record 필수항목

```text
backend id/build/family
adapter identity bucket and browser build
operation route and precision mode
scaling/equilibration policy
matrix class and condition indicator
GPU iteration and CPU correction count
f32 residual and final f64 residual
assembly reduction policy
device limits and allocated bytes
parity/qualification profile
device-loss/fallback/correction status
```

\n