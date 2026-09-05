# Phase 14 Production Requirements

```yaml
version: p14-production-requirements-v1
status: review-ready
created_at: 2026-08-27
```

## 1. 범위·거버넌스

| ID | 요구사항 |
| --- | --- |
| P14-FR-SCOPE-01 | 생산 해석 runtime owner는 S-Structures 자체 엔진이다. |
| P14-FR-SCOPE-02 | 외부 solver는 reference·교차비교에만 사용하고 runtime fallback·expected generator로 호출하지 않는다. |
| P14-FR-SCOPE-03 | 부분 지원 10개를 capability별로 구현하되 구현·내부검증·독립자격·교차비교·릴리스를 분리 판정한다. |
| P14-FR-SCOPE-04 | SB12·SH1, compression-only foundation, general contact, full PBSD와 nonlinear THA는 비범위다. |
| P14-FR-GOV-01 | requirement·reference·tolerance·test·evidence·review를 stable ID로 추적한다. |
| P14-FR-GOV-02 | 허용오차와 reference hash는 production 결과 확인 전에 승인·동결한다. |
| P14-FR-GOV-03 | production 함수가 test expected value를 생성하지 않는다. |
| P14-FR-GOV-04 | 코어·기준·schema 변경은 영향 capability를 stale 처리하고 관련 gate를 재실행한다. |

## 2. Winkler 탄성지반 보

| ID | 요구사항 |
| --- | --- |
| P14-FR-FND-01 | frame member에 local-y/local-z 선형 양방향 Winkler line stiffness를 독립 지정한다. |
| P14-FR-FND-02 | 직접 line stiffness와 `subgrade modulus × tributary width` 유도 입력을 구분하고 단위·근거를 보존한다. |
| P14-FR-FND-03 | foundation stiffness는 실제 beam interpolation으로 `Kf=∫NᵀkN dx`를 적분한다. |
| P14-FR-FND-04 | EB/Timoshenko, local axis, 3D transform, release·부분강접·offset과 조립 순서를 명시하고 검증한다. |
| P14-FR-FND-05 | soil reaction, resultant, centroid와 member force/deflection을 station별로 복구한다. |
| P14-FR-FND-06 | 전체 외력과 support+foundation reaction 평형 및 foundation strain energy를 감사한다. |
| P14-FR-FND-07 | truss·zero-length·negative stiffness·unsupported nonlinear foundation을 fail-closed한다. |
| P14-FR-FND-08 | Project JSON·CLI·Agent API·UI·report가 동일 property와 결과를 사용한다. |
| P14-FR-FND-09 | element metadata는 `klStructural`, `klFoundation`, `klTotal`을 분리하고 조립/release 복구와 설계용 frame 내력의 owner를 구분한다. |
| P14-FR-FND-10 | `analysisDomainHashes`, element descriptor, factor stiffness identity, canonical snapshot과 DomainBinary가 foundation property·assignment를 포함한다. |
| P14-FR-FND-11 | linear full assembly와 stiffness-only/modal/P-Delta assembly가 같은 foundation builder를 사용하고 dense/sparse/cache 결과가 일치한다. |
| P14-FR-FND-12 | schema v5→v6 migration은 additive하며 default empty collection, unique reference, save/reopen, copy/delete/undo를 검증한다. |
| P14-FR-FND-13 | v1은 uniform·full-member·zero-ground-displacement frame으로 제한하고 미자격 taper·generated·nonlinear 조합은 reason code와 함께 차단한다. |

## 3. 선형 시간이력

| ID | 요구사항 |
| --- | --- |
| P14-FR-THA-01 | Newmark average acceleration `β=1/4, γ=1/2`를 qualified 기본값으로 고정한다. |
| P14-FR-THA-02 | ground acceleration unit, sign, component, interpolation, start/end와 time step을 명시한다. |
| P14-FR-THA-03 | modal damping과 Rayleigh `C=αM+βKref`의 source modes·stiffness policy를 snapshot한다. |
| P14-FR-THA-04 | displacement·velocity·acceleration·reaction·energy와 peak provenance를 복구한다. |
| P14-FR-THA-05 | dt-halving, zero excitation, undamped energy와 exact SDOF limit을 자동 검사한다. |
| P14-FR-THA-06 | cancel·failure·restart에서 partial current publish와 state corruption이 없어야 한다. |
| P14-FR-THA-07 | `C=MΦ diag(2ζω)ΦᵀM` modal damping을 고유치·mode hash에 결속하고 Rayleigh와 별도 type으로 지원한다. |

## 4. RSA·질량

| ID | 요구사항 |
| --- | --- |
| P14-FR-RSA-01 | SRSS, CQC, ABS와 NRC-10% modal combination을 별도 enum과 trace로 지원한다. |
| P14-FR-RSA-02 | signed modal value, absolute envelope와 cross-modal term을 잃지 않는다. |
| P14-FR-RSA-03 | damping, close-mode threshold, spectrum interpolation·scale·direction을 결과에 기록한다. |
| P14-FR-MASS-01 | 기존 nonlinear mass domain과 일치하게 `node.mass=[mx,my,mz,jx,jy,jz]` 6성분을 linear modal/RSA·schema·UI·hash에서 공식 지원한다. |
| P14-FR-MASS-02 | rigid diaphragm은 `TᵀMT`로 translation-rotation coupling과 offset inertia를 정확히 응축한다. |
| P14-FR-MASS-03 | 직접 회전관성과 offset translational mass의 중복을 검사한다. |
| P14-FR-MASS-04 | modal/RSA physical DOF selection이 회전질량을 보존하되 participation direction은 병진 excitation과 구분한다. |
| P14-FR-RSA-04 | combined nodal Ux/Uy/Rz와 frame/truss member force를 동일 mode set에서 복구한다. |

## 5. Membrane·Plate·Shell

| ID | 요구사항 |
| --- | --- |
| P14-FR-SH-01 | QM6-EAS membrane과 MITC4 plate CPU f64 경로를 단일 formulation owner로 유지한다. |
| P14-FR-SH-02 | benchmark·사용자 형상의 deterministic mesh, element quality와 refinement lineage를 제공한다. |
| P14-FR-SH-03 | curved boundary approximation, aspect ratio, Jacobian condition, warp와 local axis를 preflight한다. |
| P14-FR-SH-04 | raw integration-point, nodal extrapolated, averaged result를 구분하고 probe 위치·방법을 보존한다. |
| P14-FR-SH-05 | plane stress membrane stress와 plate displacement·moment·shear의 단위·면·부호를 고정한다. |
| P14-FR-SH-09 | membrane recovery는 요소 중심에 고정하지 않고 승인된 `(xi,eta)`/Gauss/edge probe를 지원한다. |
| P14-FR-SH-10 | membrane edge traction은 consistent nodal load로 materialize하고 resultant·moment를 감사한다. |
| P14-FR-SH-06 | simply-supported/clamped boundary template가 실제 constrained DOF를 preview한다. |
| P14-FR-SH-07 | uniform pressure와 central nodal point load의 resultant·moment 평형을 감사한다. |
| P14-FR-SH-08 | mesh convergence가 없는 사용자 shell 결과의 design transfer를 차단한다. |
| P14-FR-STAB-01 | drilling stabilization 입력 범위·default·dimensionless 정의와 element energy ratio를 기록한다. |
| P14-FR-STAB-02 | 안정화 sweep에서 spurious mode 제거와 mass-dominant physical mode 비오염을 동시에 판정한다. |
| P14-FR-STAB-03 | S-Structures 고유 시험을 STRIX P3S2와 동일 요소 검증이라고 표시하지 않는다. |
| P14-FR-STAB-04 | global unsupported-rotation floor ratio를 explicit criteria/hash로 승격하고 실제 null rotational DOF에만 적용한다. |

## 6. Production Pushover

| ID | 요구사항 |
| --- | --- |
| P14-FR-NL-01 | global residual·increment·iteration·tangent update를 기록하는 전역 nonlinear equilibrium driver를 제공한다. |
| P14-FR-NL-02 | load/displacement control과 arc-length를 명시적 strategy로 지원한다. |
| P14-FR-NL-03 | nonconvergence 시 cutback·strategy switch·rollback 정책이 결정적이어야 한다. |
| P14-FR-NL-04 | hinge trial/commit/revert와 element/global state가 같은 step transaction을 사용한다. |
| P14-FR-NL-05 | false convergence, limit point, snap-through/back, strength drop과 residual branch를 구분한다. |
| P14-FR-NL-06 | base reaction, control displacement, hinge rotation·force·state와 energy를 step별 복구한다. |
| P14-FR-NL-07 | 중단·재시작은 checkpoint hash가 맞을 때만 허용하고 결과를 이어 붙이지 않는다. |
| P14-FR-NL-08 | preliminary·qualified·unsupported hinge family를 UI/API/report에서 동일하게 표시한다. |

## 7. AI-native 인터페이스

| ID | 요구사항 |
| --- | --- |
| P14-FR-AGENT-01 | 모든 신규 capability는 GUI 없이 schema+CLI로 생성·검증·실행·조회할 수 있다. |
| P14-FR-AGENT-02 | Agent 변경은 preview diff, affected capability, stale evidence와 실행 전 preflight를 반환한다. |
| P14-FR-AGENT-03 | AI가 코어 코드를 변경해도 qualification을 자동 승인하지 않고 mandatory regression 결과를 제시한다. |
| P14-FR-AGENT-04 | 결과 응답은 값·단위·축·부호·case/mode/step·run hash·qualification을 포함한다. |

## 8. 비기능 요구사항

| ID | 요구사항 |
| --- | --- |
| P14-NFR-NUM-01 | 기능 off 상태의 기존 mandatory fixture는 설명되지 않는 수치 drift가 없어야 한다. |
| P14-NFR-NUM-02 | 모든 신규 stiffness/mass matrix는 symmetry, finite value, expected definiteness와 rigid mode를 검사한다. |
| P14-NFR-DATA-01 | schema migration, save/reopen, undo와 N-1 recovery가 데이터 손실 없이 동작한다. |
| P14-NFR-PERF-01 | feature-off solve p95 회귀는 기준 장치에서 10% 이하다. |
| P14-NFR-PERF-02 | foundation·6DOF mass·modal combination의 추가 메모리는 활성 모델 크기에 선형이어야 한다. |
| P14-NFR-TEST-01 | 각 milestone은 unit, contract, independent numeric, metamorphic, integration, UI/API/report parity, failure injection을 가진다. |
| P14-NFR-EVID-01 | evidence는 source revision, dirty summary, build/runtime, reference/tolerance hash, input/result hash와 limitation을 포함한다. |
| P14-NFR-SEC-01 | 외부 비교 파일 parser는 size·record·path limit를 가지며 macro·script를 실행하지 않는다. |
| P14-NFR-ROLL-01 | capability별 feature flag와 additive rollback을 제공한다. |

## 9. Phase release gate

- requirement-test-evidence-review 추적률 100%
- mandatory skip·timeout·flake·hash mismatch 0
- 기존 필수 회귀 PASS와 feature-off 수치 회귀 허용범위 충족
- capability별 독립 reference와 변형시험 PASS
- 외부 solver runtime route 0
- UI·CLI·Agent API·report의 값·상태·run hash parity 100%
- unresolved Critical/High finding 0
- benchmark를 실행한 경우 사전 동결된 tolerance와 input hash 사용
- owner 승인 없는 capability의 `designTransferAllowed=false`
