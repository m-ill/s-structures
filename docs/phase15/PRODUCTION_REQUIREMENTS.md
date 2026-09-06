# Phase 15 Production Requirements

```yaml
version: p15-production-requirements-v1
status: proposed
created_at: 2026-08-27
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

## 1. 범위·거버넌스

| ID | 요구사항 |
| --- | --- |
| P15-FR-GOV-01 | Phase 15는 Phase 14 1차 benchmark의 검증결함·수치경로·증거강도를 교정하며 신규 해석요소 개발을 범위로 삼지 않는다. |
| P15-FR-GOV-02 | production runtime owner는 S-Structures 자체 엔진이며 외부 solver runtime fallback을 금지한다. |
| P15-FR-GOV-03 | 구현·내부검증·독립자격·교차비교·release·최종설계전이를 별도 상태로 관리한다. |
| P15-FR-GOV-04 | source revision, dirty summary, build, input, reference, tolerance, calculation, result와 review hash를 추적한다. |
| P15-FR-GOV-05 | reference와 tolerance는 결과 계산 전에 별도 변경으로 승인·동결한다. |
| P15-FR-GOV-06 | production source 또는 canonical input이 바뀌면 영향 capability evidence를 자동 `INVALIDATED` 처리한다. |
| P15-FR-GOV-07 | unresolved Critical/High finding, mandatory skip/timeout/flake 또는 stale hash가 있으면 release를 차단한다. |
| P15-FR-GOV-08 | `IMPLEMENTATION_STATUS.md`만 live 상태를 소유하며 charter·plan·review 문서에는 상태를 복제하지 않는다. |

## 2. Benchmark·evidence 계약

| ID | 요구사항 |
| --- | --- |
| P15-FR-VFY-01 | reference manifest는 source/page/hash, R1~R5 등급, 사용권, 표시 정밀도, geometry/material/support/load/mass/mesh를 포함한다. |
| P15-FR-VFY-02 | probe manifest는 위치, result kind, 축, 부호, 단위와 raw/extrapolated/averaged 여부를 고정한다. |
| P15-FR-VFY-03 | tolerance canonical 단위는 fraction이며 percent는 report 표시에서만 파생한다. |
| P15-FR-VFY-04 | `calculationHash`는 timestamp·hostname·hardware를 제외하고 model/reference/tolerance/build/solver settings를 포함한다. |
| P15-FR-VFY-05 | `resultHash`는 full-precision 결과·잔차·수렴 이력에서 계산하고 null payload를 금지한다. |
| P15-FR-VFY-06 | `runRecordHash`는 calculation/result hash와 실행시각·환경·toolchain metadata를 포함한다. |
| P15-FR-VFY-07 | metric은 signed quantity를 기본으로 하며 magnitude 비교는 metric type에 명시된 경우만 허용한다. |
| P15-FR-VFY-08 | PASS 판정은 공통 gate가 담당하며 case runner가 상태 개수나 expected status를 하드코딩하지 않는다. |
| P15-FR-VFY-09 | evidence는 수렴·평형·에너지·solver·dense/sparse parity·metamorphic·negative-control·review 결과를 포함한다. |
| P15-FR-VFY-10 | verification oracle은 production solver/assembly/recovery를 import하지 않으며 production bundle에 포함하지 않는다. |
| P15-FR-VFY-11 | 동일 환경의 동일 계산은 3회 연속 같은 calculation/result hash를 생성해야 한다. |
| P15-FR-VFY-12 | report는 immutable evidence만 표현하며 숨은 재계산이나 artifact에 없는 설명을 삽입하지 않는다. |

## 3. 공통 수치 인프라

| ID | 요구사항 |
| --- | --- |
| P15-FR-NUM-01 | membrane·plate·frame benchmark와 production assembly가 공통 symmetric triplet/CSC assembler를 사용한다. |
| P15-FR-NUM-02 | 대형 workflow는 전체 dense K와 dense reduced K를 materialize하지 않는다. |
| P15-FR-NUM-03 | SPD solve policy는 equilibration, preconditioner, convergence tolerance, iteration budget와 fallback reason을 명시한다. |
| P15-FR-NUM-04 | iterative solve 후 원래 unscaled system에서 true residual을 재계산한다. |
| P15-FR-NUM-05 | solver tolerance는 후속 평형·에너지 gate보다 느슨하게 설정되지 않는다. |
| P15-FR-NUM-06 | factor/session 결과는 backend, matrix storage, scaling, preconditioner, iterations, residual, fallback과 factor reuse를 기록한다. |
| P15-FR-NUM-07 | dense와 sparse가 모두 가능한 자격 fixture는 변위·반력·부재력·고유값 parity를 검증한다. |
| P15-FR-NUM-08 | factorization 실패, nonfinite, max-iteration, false convergence는 구분된 reason code로 fail-closed한다. |
| P15-FR-NUM-09 | 공통 sparse owner는 `src/compute/`에 두고 solver·shell·verification이 자체 sparse kernel을 복제하지 않는다. |

## 4. Membrane — SB2·SB3

| ID | 요구사항 |
| --- | --- |
| P15-FR-MEM-01 | reduced membrane assembly는 변환 완료된 global compatible matrix의 승인된 DOF block만 사용한다. |
| P15-FR-MEM-02 | `localMatrix`를 global DOF에 직접 조립할 수 없도록 API 이름·type guard·회귀시험을 제공한다. |
| P15-FR-MEM-03 | SB2는 최소 24×12, 48×24, 64×32, 96×48 정련 lineage를 실행 가능한 희소 경로로 제공한다. |
| P15-FR-MEM-04 | SB3는 4×4, 8×8, 12×12, 16×16의 왜곡 mesh lineage와 global rotation/reflection 불변성을 보존한다. |
| P15-FR-MEM-05 | SB2 raw nearest-Gauss tangential principal stress와 SB3 loaded-edge midpoint response의 probe lineage를 변경하지 않는다. |
| P15-FR-MEM-06 | curved mesh nodal averaging은 각 요소 stress tensor를 공통 global frame으로 회전한 뒤 평균한다. |
| P15-FR-MEM-07 | edge traction resultant·moment, energy, Jacobian·aspect·warp qualification을 각 mesh level에서 기록한다. |

## 5. Plate — SB5·SB6

| ID | 요구사항 |
| --- | --- |
| P15-FR-PLT-01 | boundary enum을 `simply-supported-soft`, `simply-supported-hard`, `clamped`로 구분한다. |
| P15-FR-PLT-02 | hard SS는 현재 plate DOF 계약에서 모든 변 `w`, x-constant 변 `rx`, y-constant 변 `ry`를 구속한다. |
| P15-FR-PLT-03 | legacy `simply-supported` 입력은 명시적 migration/version과 warning 없이 의미를 바꾸지 않는다. |
| P15-FR-PLT-04 | boundary result에는 실제 constrained DOF, edge role, canonical boundary hash를 포함한다. |
| P15-FR-PLT-05 | plate system은 공통 희소 assembler와 SPD solve policy를 사용한다. |
| P15-FR-PLT-06 | 무차원 처짐계수의 characteristic side는 `min(width,height)`이며 단위·식 provenance를 보존한다. |
| P15-FR-PLT-07 | center recovery는 assembly에 사용한 실제 shear correction factor를 사용한다. |
| P15-FR-PLT-08 | SB5 8행은 각기 3개 이상 mesh level과 short-side 기준 정련을 가지며 aggregate가 실패를 숨기지 않는다. |
| P15-FR-PLT-09 | SB6 6행은 hard SS, thickness/aspect lineage와 bending/shear energy split을 기록한다. |
| P15-FR-PLT-10 | pressure resultant·centroid moment와 point-load resultant를 system solve와 독립적으로 감사한다. |

## 6. Winkler recovery — SB7

| ID | 요구사항 |
| --- | --- |
| P15-FR-FND-01 | 결과계약은 `structuralEnd`, `foundationEnd=Kf·d`, `equilibriumEnd=structuralEnd+foundationEnd`를 분리한다. |
| P15-FR-FND-02 | foundation 분포하중이 있으면 station equilibrium recovery는 `equilibriumEnd`에서 시작한다. |
| P15-FR-FND-03 | constitutive section force와 equilibrium-recovered force를 별도 채널로 보존하고 혼용하지 않는다. |
| P15-FR-FND-04 | station 첫·끝은 element equilibrium end action과 tolerance 안에서 닫혀야 하며 closure residual을 기록한다. |
| P15-FR-FND-05 | 1차와 P-Delta recovery는 동일 foundation recovery contract를 사용한다. |
| P15-FR-FND-06 | `equivalentActionLocal=-Kf·d`, foundation resultant·first moment·strain energy 항등식을 감사한다. |
| P15-FR-FND-07 | SB7 probe는 중앙 좌우 부재의 명시적 signed endpoint와 global/local 축 mapping을 기록한다. |
| P15-FR-FND-08 | benchmark fixture는 실제 작용 foundation 방향만 활성화한다. |
| P15-FR-FND-09 | release·offset·Timoshenko·member reversal·dense/sparse 경로에서 end/station closure를 검증한다. |

## 7. Shell stabilization — P3S2-SS

| ID | 요구사항 |
| --- | --- |
| P15-FR-STAB-01 | parameter sweep의 각 점은 실제 canonical model의 K/M과 하중을 새로 조립하고 정적·고유치 문제를 재해석한다. |
| P15-FR-STAB-02 | sweep evidence는 requested/effective value, clamp 여부, solve count, model/matrix/result hash를 기록한다. |
| P15-FR-STAB-03 | 범위 밖 값, baseline 누락, 최소 log-span 미달 또는 동일 effective value 반복은 INVALID/BLOCKED다. |
| P15-FR-STAB-04 | physical mode는 mode number가 아니라 질량가중 MAC·참여율·에너지로 추적한다. |
| P15-FR-STAB-05 | static response shift, physical period shift, stabilization/physical energy와 spurious null-mode 제거를 동시에 판정한다. |
| P15-FR-STAB-06 | dense와 sparse unsupported-rotation classifier는 하나의 canonical owner와 동일 affected DOF를 사용한다. |
| P15-FR-STAB-07 | 실제 physical mechanism이나 rigid-body mode를 floor stiffness로 가리는 경우 fail-closed한다. |
| P15-FR-STAB-08 | 결과 label은 `S-Structures custom stabilization qualification`이며 STRIX P3S2 동일성 주장을 금지한다. |

## 8. 기존 PASS 강화

| ID | 요구사항 |
| --- | --- |
| P15-FR-PASS-01 | SB1은 폐형해로 signed displacement·rotation·reaction·moment와 energy를 독립 검증한다. |
| P15-FR-PASS-02 | SB8은 32→64→128→256 수렴, six-mode residual·MAC·mass audit와 Timoshenko scope를 검증한다. |
| P15-FR-PASS-03 | SB9은 bending-only, axial-only와 combined response를 분리해 상쇄 오류를 차단한다. |
| P15-FR-PASS-04 | SB10은 axial force의 signed convention을 동결하고 magnitude-only PASS를 금지한다. |
| P15-FR-PASS-05 | PD1은 mesh/load-step convergence, 각 converged stage 평형과 work balance를 기록한다. |
| P15-FR-PASS-06 | SM5는 eigenvalue 외에 질량가중 MAC, mass orthogonality, participation과 mass-unit audit를 수행한다. |

## 9. 모듈화·제품 호환성

| ID | 요구사항 |
| --- | --- |
| P15-FR-MOD-01 | verification runner, reference/oracle, common checker, evidence serializer와 report renderer를 서로 분리한다. |
| P15-FR-MOD-02 | case runner는 production public API만 호출하고 별도 강성조립·선형해법을 복제하지 않는다. |
| P15-FR-MOD-03 | behavior-preserving extraction과 수치 behavior change를 별도 PR로 수행한다. |
| P15-FR-MOD-04 | 기존 public API는 additive wrapper 또는 명시적 migration 기간 없이 제거하지 않는다. |
| P15-FR-MOD-05 | UI·CLI·Agent·report는 immutable canonical result를 소비하고 수치 계산을 복제하지 않는다. |
| P15-FR-MOD-06 | compute dependency cycle 0, UI의 numeric-core 직접 import 0을 유지한다. |
| P15-FR-MOD-07 | 신규 module owner·public API·consumer·deprecation·test를 module architecture에 기록한다. |
| P15-FR-MOD-08 | milestone마다 solver/numerical/domain/evidence review와 finding closure artifact를 남긴다. |

## 10. 비기능 요구사항

| ID | 요구사항 |
| --- | --- |
| P15-NFR-NUM-01 | 공통 정적 fixture의 normalized force/moment/energy residual은 각각 `1e-8` 이하를 목표로 하고 manifest에서 사례별 scale floor를 동결한다. |
| P15-NFR-NUM-02 | stiffness matrix symmetry residual은 `1e-12` 이하이며 nonfinite entry는 0이다. |
| P15-NFR-NUM-03 | 동일 환경 반복 10회에서 mandatory fail·flake·비결정 hash는 0이다. |
| P15-NFR-PERF-01 | unchanged representative cases의 median runtime과 peak memory는 승인된 M0 baseline의 1.25배를 넘지 않는다. |
| P15-NFR-PERF-02 | fine membrane/plate assembly memory는 active DOF와 nonzero 수에 선형이어야 한다. |
| P15-NFR-COMPAT-01 | legacy project의 save/reopen·undo·backup/restore와 feature-off 결과가 허용범위 안에서 무회귀다. |
| P15-NFR-EVID-01 | evidence JSON은 schema validation, 누락·NaN·Infinity·중복 case ID 0을 만족한다. |
| P15-NFR-TEST-01 | 각 수정은 red reproduction, unit, contract, numeric, metamorphic, negative-control, integration과 regression 시험을 가진다. |
| P15-NFR-REVIEW-01 | 구현자가 자기 변경의 최종 numerical/release 승인을 단독 수행할 수 없다. |
| P15-NFR-ROLL-01 | 각 v2 route는 shadow comparison과 rollback 경로를 제공하며 rollback 후 신규 evidence를 구버전 PASS로 재사용하지 않는다. |
| P15-NFR-SEC-01 | 외부 reference/result importer는 path·size·record 제한을 적용하고 macro·script를 실행하지 않는다. |

## 11. Phase release gate

- requirement → risk → code → test → evidence → review 추적률 100%
- mandatory fail·skip·timeout·flake·hash mismatch 0
- 모든 열린 discrepancy에 owner와 상태가 있고 release 대상 Critical/High 0
- 11개 공개 사례와 1개 custom stabilization 사례가 각 claim 범위의 mandatory gate 통과
- negative-control mutation kill rate 100%
- dense/sparse·unit·rotation·reflection·permutation mandatory parity PASS
- Phase 7~15 필수 회귀 PASS
- UI·CLI·Agent·JSON·PDF의 값·단위·축·부호·hash·판정 parity 100%
- external solver runtime/process/network route 0
- owner 승인 없는 capability의 `releaseAllowed=false`
- 별도 구조전문가 승인 전 `finalDesignTransferAllowed=false`
