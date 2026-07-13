# Phase 8 Production Requirements

```yaml
document_status: governing
product_target: commercial-grade nonlinear building-frame analysis within a declared supported domain
implementation_status: p8-m6.1-complete
release_rule: numerical correctness, model fidelity, workflow completeness, scale, and independent qualification are all mandatory
```

## 1. 제품 목표

Phase 8의 목표는 버튼과 해석 종류의 수를 상용 프로그램처럼 보이게 만드는 것이 아니다. **지원한다고 선언한 3D 건축 골조 범위 안에서 상용 건축구조해석 프로그램과 같은 수준의 해석 일관성, 수렴제어, 결과 추적성, 실패 안전성, 실무 workflow를 제공하는 것**이다.

이를 `commercial-grade within supported scope`로 정의한다. ETABS, MIDAS Gen, OpenSees와 기능 개수 전체를 동일하게 만드는 `full feature parity`와는 구분한다.

### 동급 판정의 다섯 조건

| 축 | 요구수준 |
| --- | --- |
| 수치 정확도 | 전역 잔차, 일관접선, 상태 commit/rollback, 독립 benchmark를 통과 |
| 모델 일치 | 모델링·선형·P-Delta·모달/RSA·비선형이 같은 절점, 부재, 단면, 하중, 질량, constraint를 사용 |
| 실무 workflow | 초기 중력상태, case continuation, hinge/fiber 배정, 수렴 실패 수정, 결과 비교와 보고가 하나의 흐름으로 연결 |
| 계산 성능 | sparse/typed-memory/worker 기반으로 대표 건축 골조를 UI 정지 없이 계산하고 취소·재시작 가능 |
| 검증과 책임경계 | 기능별 qualification, model hash, 입력 snapshot, 기준출처, 미지원 차단을 결과와 계산서에 유지 |

다섯 축 중 하나라도 빠지면 제품 명칭은 `prototype`, `preliminary`, `candidate` 중 하나이며 `commercial-grade`로 표시하지 않는다.

## 2. 외부 제품·연구 기준에서 가져올 동작 원칙

상용 프로그램은 load pattern과 analysis case를 분리하고, 비선형 case가 초기상태와 mass source, solution control을 명시하도록 구성한다. ETABS 공식 도움말도 nonlinear static, nonlinear direct-integration history, mass source를 별도 case 설정으로 관리한다.

- [ETABS Load Case Data](https://docs.csiamerica.com/help-files/etabs/Menus/Define/Load_Cases/Load_Case_Data_Form.htm)
- [ETABS Nonlinear Static](https://docs.csiamerica.com/help-files/etabs/Menus/Define/Load_Cases/Static_Nonlinear_Pushover_Cases/Nonlinear_Static.htm)
- [ETABS Solution Control](https://docs.csiamerica.com/help-files/etabs/Menus/Define/Load_Cases/Solution_Control.htm)
- [ETABS Mass Source](https://docs.csiamerica.com/help-files/etabs/Menus/Define/Mass_Source.htm)

전역 Newton은 반복마다 현재 접선을 다시 형성해야 하며, 변위제어와 arc-length는 추가 제약방정식을 실제 전역계에 결합해야 한다. 요소는 basic system과 global system 사이에서 내력과 접선을 일관되게 변환하고 fiber beam-column은 요소 내부 compatibility를 만족해야 한다.

- [OpenSees Newton Algorithm](https://opensees.github.io/OpenSeesDocumentation/user/manual/analysis/algorithm/Newton.html)
- [OpenSees Displacement Control](https://opensees.github.io/OpenSeesDocumentation/user/manual/analysis/integrator/DisplacementControl.html)
- [OpenSees Arc-Length Control](https://opensees.github.io/OpenSeesDocumentation/user/manual/analysis/integrator/ArcLength.html)
- [OpenSees Corotational Transformation](https://opensees.github.io/OpenSeesDocumentation/user/manual/model/geomTransf/Corotational.html)
- [OpenSees Force-Based Beam-Column](https://opensees.github.io/OpenSeesDocumentation/user/manual/model/elements/forceBeamColumn.html)

힌지는 auto/user 입력, 위치, 성분, 상호작용, hysteresis, lumped/distributed/fiber 종류를 구분해야 한다. MIDAS Gen 공식 매뉴얼은 이러한 속성과 initial load, large displacement, step subdivision을 별도 설정으로 다룬다.

- [MIDAS Gen Inelastic Hinge Properties](https://manual.midasuser.com/EN_Common/Gen/845/Start/04_Model/05_Properties/Inelastic_Hinge_Properties.htm)
- [MIDAS Gen Pushover Global Control](https://manual.midasuser.com/EN_Common/Gen/905/Start/08_Design/07_Pushover_Analysis/01_Pushover_Global_Control.htm)

비선형 건축해석의 모델링, 불확실성, 검증, 성능평가 원칙은 NIST 지침을 기준 출처로 등록한다.

- [NIST GCR 17-917-46v1, Guidelines for Nonlinear Structural Analysis and Design of Buildings](https://nvlpubs.nist.gov/nistpubs/gcr/2017/NIST.GCR.17-917-46v1.pdf)
- [NIST GCR 10-917-5, Nonlinear Structural Analysis for Seismic Design](https://www.nist.gov/publications/nehrp-seismic-design-technical-brief-no-4-nonlinear-structural-analysis-seismic-design)

외부 프로그램의 숫자를 복제하는 것이 아니라 동작 계약과 검증방식을 참고한다. 세부 모델 parameter와 acceptance criterion은 프로젝트가 채택한 기준판과 근거문서 snapshot을 별도로 요구한다.

## 3. Phase 8 지원 도메인

### P8-S1 Production Frame Scope

- 3D frame 및 truss, 절점당 6자유도
- steel H/BOX/PIPE 및 RC rectangular frame section
- linear support spring, prescribed displacement preload
- member local axis, end release, rigid offset
- rigid diaphragm와 검증된 semi-rigid equivalent domain
- nodal/member load, self weight, temperature/settlement 중 검증된 preload 항목
- load case, load combination, mass source, analysis case의 분리
- geometric nonlinearity: small-displacement, P-Delta, corotational large-displacement
- concentrated M, P, PMM hinge와 user-defined hinge backbone
- steel/RC fiber section과 distributed-plasticity frame 경로
- load/displacement/arc-length static control
- gravity-preloaded Pushover
- MDOF nonlinear direct-integration time history
- 결과 recovery, convergence, energy, provenance, report, agent/API

### P8-S2 Extended Building Scope

- tension-only/compression-only truss와 nonlinear link
- damper, isolator, gap, hook, multilinear spring 중 검증된 material
- 다성분 동시 지반가속도와 방향회전
- case-to-case nonlinear state continuation
- cyclic static protocol
- checkpoint/restart와 batch record suite

### 명시적 미지원 또는 후속 phase

- 실제 nonlinear shell/wall/plate/solid FEM
- staged construction의 재료시간의존·시공순서 전체
- cable, tendon, catenary, contact
- multi-support excitation와 wave passage
- soil-structure interaction 및 foundation uplift/contact
- fracture, low-cycle fatigue, local buckling, bar buckling, connection failure
- collapse 후 element removal과 debris/contact

기존 wall/slab/shell equivalent frame link는 원본 객체가 아니라 generated elastic domain으로만 사용할 수 있다. 이를 nonlinear wall 또는 shell로 표시하지 않는다.

## 4. 상용 기능 대비 목표표

| 기능군 | P8 목표 | 릴리스 판정 |
| --- | --- | --- |
| load pattern/case 분리 | 기존 load case/combo와 nonlinear analysis case를 명확히 분리 | S1 필수 |
| initial conditions | nonlinear gravity preload, verified state continuation | S1 필수 |
| mass source | self/member/node/load-derived mass의 단일 snapshot | S1 필수 |
| geometric nonlinearity | P-Delta와 full corotational을 구분 | S1 필수 |
| concentrated hinge | M/P/PMM, 축·단부·방향별 state와 hysteresis | S1 필수 |
| distributed plasticity | 3D section response와 integration-point state | S1 필수 |
| nonlinear link | spring/gap/unilateral 기본군 | S2 |
| static control | load, displacement, arc-length, cutback | S1 필수 |
| nonlinear history | MDOF direct integration, substep, energy | S1 필수 |
| staged construction | 제한적 initial-state import만 | 미지원 표시 |
| nonlinear shell/wall | equivalent elastic mapping만 | 미지원 표시 |
| result review | step/time/object 연동, table/chart/viewport | S1 필수 |
| automation | case CRUD, validation, run/cancel/restart/result slice | S1 필수 |

## 5. 사용자 workflow 요구사항

### W1. 모델 준비

1. 사용자는 Phase 7 모델의 story/grid/member/section/material/load를 그대로 사용한다.
2. 비선형 해석 전용 복제모델을 만들지 않는다.
3. 시스템은 선형 해석에서 사용한 실제 analysis domain과 Phase 8 domain의 차이를 보여준다.
4. unsupported 객체는 ID, 위치, 원인, 수정동작과 함께 표시한다.

### W2. 비선형 속성 준비

1. steel/RC/member role과 설계 snapshot을 이용해 hinge/fiber 후보를 생성한다.
2. auto-calculation과 user-defined 값을 구분한다.
3. 축별 강도, hinge length, initial stiffness, hysteresis, source를 표로 검토한다.
4. 적용 전 diff를 제공하고 한 transaction으로 commit/undo한다.

### W3. Pushover

1. gravity initial case를 선택한다.
2. lateral pattern, control node/DOF, target, geometry formulation을 선택한다.
3. 실행 전 예상 DOF, element, memory, unsupported 항목을 확인한다.
4. 실행 중 step, iteration, cutback, event, residual을 확인하고 취소할 수 있다.
5. 결과에서 capacity curve, hinge sequence, story/member response, 종료사유를 연동 검토한다.

### W4. NLTH

1. gravity initial state와 mass source를 선택한다.
2. ground-motion record의 dt, unit, sign, component, angle, scale을 검토한다.
3. damping, integrator, output/substep size와 convergence를 설정한다.
4. 실행 중 time, substep, iteration, energy drift, memory를 확인한다.
5. 결과에서 time history, peak/envelope, hinge/fiber state, story response, energy를 검토한다.

### W5. 보고와 자동화

1. 모든 결과는 model/domain/case hash와 solver version을 가진다.
2. UI, report, agent/MCP가 같은 run record를 읽는다.
3. 모델 변경 시 결과는 stale이 되며 현재 모델에 design transfer되지 않는다.
4. 실패 run도 입력과 수렴 trace를 보존해 재현 가능해야 한다.

## 6. 기능 요구사항

### 모델·도메인

| ID | 요구사항 |
| --- | --- |
| P8-FR-MDL-01 | Phase 7 `schemaVersion`, units, stories, diaphragms, materials, sections, nodes, members, loads를 canonical input으로 사용 |
| P8-FR-MDL-02 | 모델링·선형·비선형이 공통 analysis-domain builder와 origin map을 사용 |
| P8-FR-MDL-03 | topology/property/load/constraint/mass/nonlinear hash를 분리 생성 |
| P8-FR-MDL-04 | model transaction 후 영향 hash에 해당하는 case/cache만 stale 처리 |
| P8-FR-MDL-05 | local axis, release, offset, insertion point를 viewport와 solver가 동일하게 해석 |
| P8-FR-MDL-06 | generated members는 source object와 formulation을 보존 |
| P8-FR-MDL-07 | unsupported feature를 근사 대체하지 않고 fail-closed |
| P8-FR-MDL-08 | analysis domain 생성이 원본 model을 변경하지 않음 |

### 재료·단면·설계 snapshot

| ID | 요구사항 |
| --- | --- |
| P8-FR-PROP-01 | elastic E/G/rho와 nonlinear material model이 같은 material snapshot에 연결 |
| P8-FR-PROP-02 | A/I/J/Ay/Az와 fiber geometry가 같은 section geometry에서 파생 |
| P8-FR-PROP-03 | steel grade/thickness 및 RC concrete/rebar 속성 source를 보존 |
| P8-FR-PROP-04 | RC hinge/fiber auto 생성은 실제 reinforcement snapshot 없이는 verified 불가 |
| P8-FR-PROP-05 | stiffness modifier가 elastic, initial nonlinear, tangent 용도를 구분 |
| P8-FR-PROP-06 | section/material 변경 시 관련 nonlinear assignment를 stale 처리 |
| P8-FR-PROP-07 | user-defined backbone/fiber import에 unit과 source validation 적용 |
| P8-FR-PROP-08 | auto property와 user override diff 및 undo 제공 |

### case와 초기상태

| ID | 요구사항 |
| --- | --- |
| P8-FR-CASE-01 | load pattern, load combination, mass source, analysis case를 별도 entity로 유지 |
| P8-FR-CASE-02 | nonlinear case가 `engineId`, formulation, initialStateRef, output policy를 명시 |
| P8-FR-CASE-03 | gravity preload를 nonlinear equilibrium으로 수행하고 accepted state만 전달 |
| P8-FR-CASE-04 | linear result import는 명시적 initial-state policy와 제한조건을 가짐 |
| P8-FR-CASE-05 | case dependency DAG의 cycle과 stale reference를 차단 |
| P8-FR-CASE-06 | topology/constraint가 다른 case 간 state continuation을 차단 |
| P8-FR-CASE-07 | failed case를 subsequent case 초기상태로 사용할 수 없음 |
| P8-FR-CASE-08 | case 복제 시 source와 qualification을 새 snapshot으로 기록 |

### solver와 상태

| ID | 요구사항 |
| --- | --- |
| P8-FR-SOL-01 | 요소가 current trial state의 resisting force와 consistent tangent를 반환 |
| P8-FR-SOL-02 | full Newton은 반복마다 tangent와 internal force를 재조립 |
| P8-FR-SOL-03 | committed/trial/line-search branch를 분리 |
| P8-FR-SOL-04 | nonconvergence 시 rollback 후 adaptive cutback 수행 |
| P8-FR-SOL-05 | 최소 step/substep 이하에서 명시 실패하고 정상 결과를 만들지 않음 |
| P8-FR-SOL-06 | SPD와 indefinite/general sparse backend를 분리 |
| P8-FR-SOL-07 | load/displacement/arc-length가 실제 augmented global equation을 풂 |
| P8-FR-SOL-08 | static과 dynamic이 같은 element/material state kernel을 사용 |
| P8-FR-SOL-09 | force/displacement/energy convergence를 scale-aware하게 판정 |
| P8-FR-SOL-10 | cancellation/checkpoint가 committed state 경계에서 동작 |

### Pushover와 NLTH

| ID | 요구사항 |
| --- | --- |
| P8-FR-ANA-01 | Pushover가 gravity state에서 시작하고 lateral load를 별도 reference pattern으로 적용 |
| P8-FR-ANA-02 | control displacement와 load factor를 함께 풀고 accepted curve만 저장 |
| P8-FR-ANA-03 | first yield, peak, mechanism, post-peak, failure event를 추적 |
| P8-FR-ANA-04 | NLTH가 model M/C/Pint/Kt와 ground influence vector를 사용 |
| P8-FR-ANA-05 | NLTH가 output step과 internal substep을 분리 |
| P8-FR-ANA-06 | Rayleigh damping의 stiffness source 정책을 기록 |
| P8-FR-ANA-07 | input/kinetic/damping/strain/plastic energy를 audit |
| P8-FR-ANA-08 | time-step/mesh/control sensitivity 결과를 qualification에 포함 |

### 결과·보고·API

| ID | 요구사항 |
| --- | --- |
| P8-FR-RES-01 | global/story/node/member/hinge/section 결과가 stable object ID를 사용 |
| P8-FR-RES-02 | step/time별 외력·내력·반력·잔차와 convergence를 저장 |
| P8-FR-RES-03 | raw result와 downsampled chart result를 분리 |
| P8-FR-RES-04 | table/chart/viewport 선택이 같은 result slice를 참조 |
| P8-FR-RES-05 | 실패 run도 마지막 committed step과 rejected trace를 저장 |
| P8-FR-RES-06 | 결과 dimension에 velocity, acceleration, curvature, strain, stress, energy를 포함 |
| P8-FR-RES-07 | report에 입력, initial state, formulation, source, tolerance, 경고를 포함 |
| P8-FR-RES-08 | agent/MCP가 validate/run/cancel/restart/result/explain을 같은 contract로 제공 |

## 7. 비기능 요구사항

| ID | 요구사항 |
| --- | --- |
| P8-NFR-01 | 동일 입력·backend·thread mode에서 deterministic result와 event order 보장 |
| P8-NFR-02 | solver를 Web Worker에서 실행해 사용자 입력과 viewport가 멈추지 않음 |
| P8-NFR-03 | sparse matrix와 state를 typed array로 저장하고 전체 dense matrix 생성을 금지 |
| P8-NFR-04 | 실행 전 memory/runtime estimate와 hard limit를 제공 |
| P8-NFR-05 | result history를 chunk 저장·streaming하고 전 step의 전체 element state 상주를 금지 |
| P8-NFR-06 | topology가 같으면 symbolic sparsity와 ordering을 재사용 |
| P8-NFR-07 | long run의 취소, checkpoint, restart, crash recovery를 지원 |
| P8-NFR-08 | worker/WASM 오류가 UI process와 model data를 손상시키지 않음 |
| P8-NFR-09 | model, case, result, evidence integrity hash를 검증 |
| P8-NFR-10 | 작은 모델은 dense reference backend와 교차검산 가능 |
| P8-NFR-11 | 지원 브라우저와 reference hardware의 성능 artifact를 릴리스마다 보존 |
| P8-NFR-12 | Critical/High correctness finding 0, 전체 Phase 7 회귀 통과 |

## 8. Production equivalence 등급

| 등급 | 판정 |
| --- | --- |
| Q0 Prototype | 함수와 UI trace 존재 |
| Q1 Numerically Qualified | unit/component/solver benchmark와 잔차·접선 검증 통과 |
| Q2 Model-Integrated | 모델링·탄성·동적 도메인 및 result ID 일치 |
| Q3 Workflow-Complete | setup/run/failure/restart/result/report/API 전체 흐름 통과 |
| Q4 Scale-Qualified | 대표 규모의 시간·메모리·UI responsiveness 기준 통과 |
| Q5 Commercial-Grade in Scope | 독립 비교, pilot, code review, source governance까지 통과 |

Phase 8 최종 릴리스는 P8-S1 기능 모두 Q5여야 한다. 일부 기능만 Q5이면 제품 전체를 포괄적으로 `상용 동급`이라 하지 않고 기능별 qualification 표를 제공한다.

## 9. 최종 release gate

- P8-S1 기능의 required verification 100% pass
- modeling-elastic-nonlinear cross-domain 검증 100% pass
- 최소 steel 2종, RC 1종, dynamic 1종 independent pilot pass
- worker/WASM production path와 deterministic reference path 모두 pass
- medium workload 성능 budget pass, target workload는 제한과 측정값 공개
- unsupported feature의 silent fallback 0
- stale/failed/unverified 결과의 design transfer 0
- report/API/UI의 model hash와 주요 결과값 일치
- 전체 regression pass와 Critical/High finding 0
