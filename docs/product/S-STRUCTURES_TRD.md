# S-Structures Technical Requirements Document

문서 버전: 0.1  
작성일: 2026-06-24  
제품명: S-Structures  
기술 방향: 브라우저 실행 가능한 자체 직접강성법 구조해석 엔진  
핵심 제약: OpenSees 및 외부 네이티브 해석엔진을 사용하지 않는다.

## 1. 기술 목표

S-Structures의 기술 목표는 단일 HTML 데모 수준의 구조해석 코드를 장기 확장 가능한 자체 엔진으로 재구성하는 것이다. 이 엔진은 선형 3D 프레임 해석을 안정적으로 수행하고, 그 위에 하중조합, 포락, 설계검토, 고유치/RSA, P-Delta, 소성힌지 기반 pushover를 단계적으로 추가할 수 있어야 한다.

핵심 목표:

- UI와 독립적인 `analyze(model, options)` API 제공
- 명시적인 구조 모델 스키마 제공
- 단위계와 좌표계를 엄격히 관리
- 해석결과를 설계엔진과 리포트엔진이 재사용 가능한 형태로 표준화
- 검증 예제 기반 회귀 테스트 체계 구축
- 선형해석에서 비선형해석으로 확장 가능한 내부 상태 구조 확보

## 2. 기술 원칙

- Pure JavaScript 또는 TypeScript 기반으로 구현한다.
- 브라우저에서 기본 기능이 실행되어야 한다.
- 연산량이 큰 기능은 Web Worker로 분리할 수 있어야 한다.
- 수치 알고리즘은 테스트 가능한 작은 함수로 분리한다.
- 모델 데이터는 직렬화 가능한 plain object를 원칙으로 한다.
- UI 상태와 해석 모델 상태를 분리한다.
- 모든 결과는 단위와 좌표계를 명시해야 한다.
- 설계검토는 해석결과를 직접 참조하지 않고 표준화된 demand envelope을 입력으로 받아야 한다.

## 3. 전체 아키텍처

목표 모듈 구조:

```text
src/
  core/
    model.js
    schema.js
    units.js
    validation.js
    geometry.js
    loads.js
    combinations.js
    envelope.js
    results.js
  solver/
    linear3d/
      elementFrame3d.js
      transform.js
      assemble.js
      constraints.js
      loadsToNodal.js
      recover.js
      solve.js
      analyze.js
    modal/
      mass.js
      eigen.js
      participation.js
      rsa.js
    pdelta/
      geometricStiffness.js
      iterate.js
    nonlinear/
      hinge.js
      state.js
      newton.js
      pushover.js
  design/
    steel/
      beamCheck.js
      columnCheck.js
      interaction.js
    rc/
      beamCheck.js
      columnCheck.js
      rebar.js
    common/
      demand.js
      dcr.js
      reportRows.js
  ui/
    viewer3d/
    panels/
    charts/
  examples/
  tests/
```

초기 구현은 기존 파일 구조를 그대로 유지할 수 있으나, 논리적 모듈 경계는 위 구조를 기준으로 한다.

## 4. 데이터 모델 요구사항

### 4.1 모델 최상위 구조

모델은 직렬화 가능한 JSON이어야 한다.

```js
{
  schemaVersion: 1,
  meta: {
    name: "Untitled",
    createdAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z"
  },
  units: {
    length: "mm",
    force: "N",
    stress: "MPa"
  },
  nodes: [],
  members: [],
  materials: [],
  sections: [],
  supports: [],
  loadCases: [],
  loadCombinations: [],
  stories: [],
  analysisOptions: {},
  designOptions: {}
}
```

내부 표준 단위는 다음을 권장한다.

- 길이: mm
- 힘: N
- 모멘트: N-mm
- 응력: MPa
- 질량: N-s2/mm 또는 변환 유틸을 통한 일관 표현

단위 변환은 입력/출력 경계에서만 수행한다.

### 4.2 노드

```js
{
  id: "N1",
  x: 0,
  y: 0,
  z: 0,
  mass: {
    mx: 0,
    my: 0,
    mz: 0,
    rx: 0,
    ry: 0,
    rz: 0
  },
  tags: []
}
```

요구사항:

- 좌표는 내부 단위로 저장한다.
- 노드 ID는 프로젝트 내에서 유일해야 한다.
- 해석 시 노드 순서와 DOF index map을 생성해야 한다.

### 4.3 부재

```js
{
  id: "M1",
  type: "frame",
  iNode: "N1",
  jNode: "N2",
  materialId: "MAT1",
  sectionId: "SEC1",
  localAxis: {
    beta: 0,
    yRef: null
  },
  releases: {
    i: { ux: false, uy: false, uz: false, rx: false, ry: false, rz: false },
    j: { ux: false, uy: false, uz: false, rx: false, ry: false, rz: false }
  },
  offsets: {
    i: { x: 0, y: 0, z: 0 },
    j: { x: 0, y: 0, z: 0 }
  },
  design: {
    role: "beam",
    unbracedLengthY: null,
    unbracedLengthZ: null,
    kY: 1.0,
    kZ: 1.0
  },
  tags: []
}
```

요구사항:

- 길이 0 부재는 validation error로 처리한다.
- section/material 누락은 해석 전 error로 처리한다.
- releases는 초기에는 rotational release 중심으로 구현하고, full release는 안정성 검토 후 확장한다.
- offsets는 M2 이후 구현 가능하나 스키마에는 초기부터 포함한다.

### 4.4 재료

```js
{
  id: "MAT1",
  name: "SS275",
  type: "steel",
  E: 205000,
  G: 79000,
  nu: 0.3,
  density: 7.85e-5,
  design: {
    Fy: 275,
    Fu: 410
  }
}
```

요구사항:

- E와 G가 모두 없을 경우 `G = E / (2 * (1 + nu))`로 계산 가능해야 한다.
- density는 자중 자동 생성에 사용한다.
- 설계 속성은 해석 필수값과 분리한다.

### 4.5 단면

```js
{
  id: "SEC1",
  name: "H-300x150x6.5x9",
  type: "steel-h",
  analysis: {
    A: 4678,
    Iy: 5084645,
    Iz: 71924254,
    J: 98715,
    Avy: null,
    Avz: null
  },
  dimensions: {
    h: 300,
    b: 150,
    tw: 6.5,
    tf: 9
  },
  design: {
    Zy: null,
    Zz: null,
    Sy: null,
    Sz: null,
    ry: null,
    rz: null
  }
}
```

요구사항:

- 해석에 필요한 `A, Iy, Iz, J`는 필수다.
- 설계에 필요한 속성이 없으면 설계검토에서 WARN 또는 BLOCKED로 처리한다.
- 단면 라이브러리는 JSON 또는 JS module로 관리할 수 있다.

### 4.6 지점조건

```js
{
  nodeId: "N1",
  restraint: {
    ux: true,
    uy: true,
    uz: true,
    rx: true,
    ry: true,
    rz: true
  },
  springs: {
    ux: null,
    uy: null,
    uz: null,
    rx: null,
    ry: null,
    rz: null
  }
}
```

요구사항:

- 고정 구속은 초기 버전에서 필수 지원한다.
- 탄성 스프링은 M2 이후 확장 항목이다.
- 구속 조건은 global DOF 기준으로 적용한다.

### 4.7 하중케이스

```js
{
  id: "LC1",
  name: "D",
  type: "D",
  selfWeight: {
    enabled: true,
    direction: "GZ",
    factor: -1
  },
  nodalLoads: [],
  memberLoads: []
}
```

절점하중:

```js
{
  nodeId: "N1",
  fx: 0,
  fy: 0,
  fz: -10000,
  mx: 0,
  my: 0,
  mz: 0
}
```

부재하중:

```js
{
  memberId: "M1",
  system: "local",
  direction: "z",
  type: "uniform",
  w1: -10,
  w2: -10,
  x1: 0,
  x2: 1,
  relative: true
}
```

요구사항:

- local/global 하중계를 명확히 구분한다.
- 부재하중은 등가절점하중으로 변환되어 global load vector에 조립되어야 한다.
- 부재력 복원 시 고정단력 기여를 포함해야 한다.

### 4.8 하중조합

```js
{
  id: "COMB1",
  name: "1.2D + 1.6L",
  type: "strength",
  factors: [
    { loadCaseId: "LC1", factor: 1.2 },
    { loadCaseId: "LC2", factor: 1.6 }
  ]
}
```

요구사항:

- 해석은 기본적으로 load case별로 수행하고, 선형 조합은 결과 조합으로 처리한다.
- 비선형/P-Delta는 조합 직접해석이 필요할 수 있으므로 결과 타입을 구분한다.
- 조합 결과는 어떤 load case result에서 유도되었는지 추적 가능해야 한다.

## 5. 선형 3D 프레임 해석 요구사항

### 5.1 해석 파이프라인

선형해석은 다음 순서로 수행한다.

```text
validate model
normalize units
build node index
build dof index
initialize global K and F
for each member:
  compute local axes
  compute local stiffness kLocal
  apply releases if any
  compute transform T
  compute global stiffness kGlobal
  assemble K
for each load:
  convert to equivalent nodal load
  assemble F
apply boundary conditions
solve Kff * Uf = Ff
recover full displacement U
compute reactions R = K * U - F
recover member local forces
compute force stations
return AnalysisResult
```

### 5.2 자유도

각 노드는 다음 순서의 6자유도를 가진다.

```text
ux, uy, uz, rx, ry, rz
```

전체 자유도 index:

```js
globalDofIndex = nodeIndex * 6 + localDofIndex
```

요구사항:

- DOF ordering은 문서화하고 테스트에서 고정한다.
- 결과도 동일한 ordering을 사용한다.

### 5.3 요소 local stiffness

3D 프레임 요소는 다음 자유도를 가진다.

```text
i: ux, uy, uz, rx, ry, rz
j: ux, uy, uz, rx, ry, rz
```

필수 강성 성분:

- axial: EA/L
- torsion: GJ/L
- bending about local z: EIz
- bending about local y: EIy

요구사항:

- local stiffness matrix는 독립 함수로 테스트 가능해야 한다.
- 단순 보 검증을 위해 y/z 방향 휨 부호 규약을 문서화한다.
- 전단변형은 초기 버전에서 제외할 수 있으나, 옵션 추가 가능성을 열어둔다.

### 5.4 좌표변환

요구사항:

- 부재 local x축은 iNode에서 jNode 방향이다.
- local y/z축은 reference vector 또는 beta angle로 결정한다.
- global Z와 평행한 부재에서도 안정적인 local axis를 생성해야 한다.
- 변환행렬 T는 12x12 matrix로 구성한다.

수용 기준:

- 수직 기둥, 수평 보, 임의 경사 부재에서 축 방향과 휨 방향이 일관된다.
- local load를 global load로 변환했을 때 방향 오류가 없어야 한다.

### 5.5 경계조건

초기 구현 방식:

- 자유 DOF만 추출해 reduced system을 푼다.

요구사항:

- fixed DOF는 displacement 0으로 처리한다.
- reaction은 full K와 full F로 계산한다.
- 모든 DOF가 구속되지 않은 rigid body mode를 감지해야 한다.

### 5.6 릴리즈

권장 구현 순서:

1. rotational end release only
2. static condensation 기반 release
3. partial spring release
4. full translational release

요구사항:

- release 적용 후 요소 강성의 대칭성이 유지되어야 한다.
- 양단 동일 회전 릴리즈로 mechanism이 발생하면 validation 또는 solver warning을 제공한다.

### 5.7 부재하중 등가절점하중

필수 지원:

- uniform load local y/z
- uniform load global X/Y/Z
- point load local y/z
- point load global X/Y/Z

추가 지원:

- trapezoidal load
- thermal load
- settlement

요구사항:

- 등가절점하중은 local fixed-end force로 계산 후 global로 변환한다.
- 부재력 복원 시 `kLocal * uLocal - fixedEndForce` 형태의 부호 규약을 일관되게 사용한다.

### 5.8 선형 솔버

초기 구현:

- dense matrix
- Gaussian elimination with partial pivoting 또는 LDLT/Cholesky 계열

확장 구현:

- sparse matrix
- iterative solver
- Web Worker offload

요구사항:

- pivot이 tolerance 이하이면 singular 또는 ill-conditioned warning을 발생시킨다.
- solve residual `||KU-F||`를 계산해 결과에 포함한다.
- 해석 실패 시 부분 결과를 정상 결과처럼 표시하지 않는다.

## 6. 결과 데이터 구조

### 6.1 AnalysisResult

```js
{
  ok: true,
  modelHash: "...",
  loadCaseId: "LC1",
  solver: {
    type: "linear3d",
    residualNorm: 1e-9,
    warnings: []
  },
  displacements: {
    N1: { ux: 0, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 }
  },
  reactions: {
    N1: { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 }
  },
  memberEndForces: {
    M1: {
      i: { n: 0, vy: 0, vz: 0, t: 0, my: 0, mz: 0 },
      j: { n: 0, vy: 0, vz: 0, t: 0, my: 0, mz: 0 }
    }
  },
  memberStations: {
    M1: [
      { x: 0, n: 0, vy: 0, vz: 0, t: 0, my: 0, mz: 0 },
      { x: 0.5, n: 0, vy: 0, vz: 0, t: 0, my: 0, mz: 0 },
      { x: 1, n: 0, vy: 0, vz: 0, t: 0, my: 0, mz: 0 }
    ]
  }
}
```

요구사항:

- member force는 local member axis 기준으로 저장한다.
- UI 표시용 global vector는 별도 변환 유틸에서 계산한다.
- 결과는 load case result, combination result, envelope result를 구분해야 한다.

### 6.2 EnvelopeResult

```js
{
  memberId: "M1",
  stations: [
    {
      x: 0.5,
      maxMz: { value: 1000000, comboId: "COMB1" },
      minMz: { value: -500000, comboId: "COMB2" },
      maxMy: {},
      minMy: {},
      maxN: {},
      minN: {},
      maxVy: {},
      maxVz: {}
    }
  ]
}
```

요구사항:

- 설계엔진은 envelope 또는 governing station을 입력으로 받아야 한다.
- 지배 조합과 지배 위치를 반드시 추적한다.

## 7. 하중조합 기술 요구사항

### 7.1 선형 조합 방식

선형해석에서는 load case별 결과를 먼저 계산하고, 조합 결과는 다음 방식으로 산출한다.

```text
U_combo = sum(factor_i * U_i)
R_combo = sum(factor_i * R_i)
F_member_combo = sum(factor_i * F_member_i)
```

요구사항:

- 모든 조합 대상 load case가 해석되어 있어야 한다.
- 누락 결과가 있으면 조합 결과를 생성하지 않는다.
- 조합 결과에는 source load cases와 factor가 포함되어야 한다.

### 7.2 포락

요구사항:

- 각 부재 station별로 최대/최소를 계산한다.
- 최대 절대값 포락과 부호별 포락을 모두 지원할 수 있어야 한다.
- 설계검토별로 필요한 demand 추출 규칙을 별도 정의한다.

## 8. 설계엔진 요구사항

### 8.1 설계엔진 입력

설계엔진은 다음 입력을 받는다.

```js
{
  model,
  envelopeResults,
  designOptions,
  codeOptions
}
```

해석 solver 내부 객체에 직접 접근하지 않는다.

### 8.2 설계 결과

```js
{
  memberId: "M1",
  status: "OK",
  dcr: 0.82,
  governingCheck: "steel-flexure-z",
  governingComboId: "COMB1",
  governingStation: 0.5,
  checks: [
    {
      id: "steel-flexure-z",
      status: "OK",
      demand: 1000000,
      capacity: 1500000,
      dcr: 0.67,
      notes: []
    }
  ],
  warnings: []
}
```

요구사항:

- 설계 미지원 항목은 `status: "NOT_SUPPORTED"` 또는 warning으로 표시한다.
- capacity 산정에 사용된 주요 입력값을 결과에 포함한다.
- 설계결과는 리포트와 UI가 동일하게 사용할 수 있어야 한다.

### 8.3 철골 설계 1차 요구사항

필수 체크:

- 인장
- 압축
- 강축/약축 휨
- 전단
- 휨-압축 조합
- KL/r slenderness warning
- 처짐

초기 단순화:

- 횡좌굴은 사용자 입력 Lb와 단순 보수식으로 시작한다.
- local buckling 세부 판폭두께비는 2차 구현으로 둔다.
- 설계기준 미반영 영역을 리포트에 명확히 표기한다.

### 8.4 RC 설계 1차 요구사항

필수 체크:

- 보 휨 요구철근량
- 보 전단 요구철근량
- 기둥 축력-휨 개략 검토
- 최소/최대 철근비 warning

초기 단순화:

- 정밀 P-M interaction surface는 후속 단계로 둔다.
- 전단벽 정밀 검토는 RC 보/기둥 이후에 구현한다.

## 9. 고유치 및 RSA 요구사항

### 9.1 질량행렬

초기 구현:

- lumped mass matrix
- translational mass only

확장:

- rotational inertia
- consistent mass matrix
- floor mass generation

요구사항:

- 자중 또는 사용자가 입력한 질량에서 mass vector를 생성할 수 있어야 한다.
- 질량이 없는 자유 DOF는 동적해석에서 제외하거나 warning 처리한다.

### 9.2 고유치해석

초기 구현 후보:

- Jacobi method for small symmetric matrices
- QR iteration
- power/subspace iteration

요구사항:

- `K phi = lambda M phi` 일반화 고유치 문제를 처리해야 한다.
- 초기 버전은 reduced DOF 기준으로 처리한다.
- 모드형상 정규화 방식을 명시한다.

### 9.3 RSA

요구사항:

- 사용자 정의 spectrum function 또는 table 입력을 지원한다.
- 방향별 participation factor를 계산한다.
- modal response를 SRSS/CQC로 조합한다.
- RSA 결과를 member force result로 변환한다.

주의:

- RSA의 부호 없는 결과와 선형 정적 결과를 같은 방식으로 설계 포락에 넣으면 오류가 발생할 수 있다.
- RSA 결과 타입을 별도로 표시하고 조합 규칙을 엄격히 관리해야 한다.

## 10. P-Delta 요구사항

### 10.1 구현 전략

1차 구현:

- 부재 축력 기반 geometric stiffness matrix를 구성한다.
- 선형해석 결과 축력을 사용해 반복한다.

파이프라인:

```text
linear solve
recover axial forces
build geometric stiffness Kg
solve with K + Kg
check displacement convergence
repeat until tolerance or max iteration
```

요구사항:

- 압축축력 부호 규약을 명확히 한다.
- 수렴 tolerance와 max iteration을 options로 제공한다.
- 불안정 또는 발산 시 결과를 warning 또는 failed로 표시한다.

## 11. 비선형 Pushover 요구사항

### 11.1 범위

초기 비선형은 다음으로 제한한다.

- 2D 또는 3D 프레임
- lumped plastic hinge
- 회전힌지 중심
- monotonic pushover
- displacement control
- 탄성 unloading/reloading은 초기 범위에서 제외 가능

### 11.2 비선형 상태

```js
{
  step: 12,
  lambda: 0.45,
  controlDisplacement: 35.2,
  memberStates: {
    M1: {
      hinges: {
        i: { rotation: 0.002, moment: 12000000, state: "yielded" },
        j: { rotation: 0.0005, moment: 4000000, state: "elastic" }
      }
    }
  },
  residualNorm: 1e-5,
  converged: true
}
```

### 11.3 Newton-Raphson

요구사항:

- tangent stiffness를 구성한다.
- residual force를 계산한다.
- 수렴 기준은 displacement norm, force residual norm, iteration count를 포함한다.
- 실패 시 step size reduction을 지원한다.

### 11.4 Displacement Control

요구사항:

- control node와 control direction을 지정한다.
- 목표 변위와 step size를 지정한다.
- base shear와 control displacement를 기록한다.

결과:

- capacity curve
- hinge sequence
- final state
- convergence log

## 12. 수치 안정성 요구사항

필수 체크:

- zero length member
- duplicate node
- unconnected member
- missing support
- rigid body mode
- singular stiffness matrix
- ill-conditioned matrix
- extreme stiffness ratio
- invalid material property
- invalid section property
- isolated DOF

solver tolerance 기본값:

```js
{
  pivotTolerance: 1e-12,
  residualTolerance: 1e-8,
  displacementTolerance: 1e-8,
  maxIterations: 30
}
```

요구사항:

- tolerance는 advanced settings에서 조정 가능해야 한다.
- 모든 warning/error는 코드와 사람이 읽을 수 있는 메시지를 함께 가져야 한다.

## 13. 성능 요구사항

초기 목표:

- 100개 부재 이하: 선형해석 1초 이내
- 1,000개 부재 이하: 선형해석 5초 이내 목표
- UI freeze 방지를 위해 500개 부재 이상은 Web Worker 사용 검토

기술 전략:

- M2까지 dense matrix로 구현한다.
- M6 이후 sparse matrix 도입을 검토한다.
- assembly는 typed array 기반으로 개선 가능해야 한다.
- 결과 station 수는 기본값을 제한하고 필요 시 증가시킨다.

## 14. 테스트 및 검증 요구사항

### 14.1 테스트 종류

- unit test
- integration test
- verification test
- regression test
- visual smoke test

### 14.2 필수 검증 예제

선형해석:

- 캔틸레버 끝단 집중하중
- 캔틸레버 등분포하중
- 단순보 중앙 집중하중
- 단순보 등분포하중
- 양단고정보 등분포하중
- 2D 포털프레임 횡하중
- 3D 단층 프레임
- 릴리즈 있는 보
- local axis 회전 부재
- offset 부재

설계:

- 철골 보 휨 검토비
- 철골 기둥 압축 검토비
- 휨-압축 조합 검토비
- RC 보 요구철근량

동적:

- 1자유도 oscillator
- 2층 전단건물
- 3층 전단건물

비선형:

- bilinear spring 단일 자유도
- 단순 포털프레임 pushover

### 14.3 허용오차

권장 기준:

- 단순 정정 구조 반력: 상대오차 1e-8 이하
- 변위: 상대오차 1e-5 이하
- 부재력: 상대오차 1e-5 이하
- 고유주기: 상대오차 1e-3 이하
- 설계 검토비: 기준 계산서 대비 1e-3 이하

예외:

- 수치 condition이 나쁜 모델은 별도 tolerance를 기록한다.

## 15. 오류 처리 요구사항

오류 레벨:

- INFO: 사용자 참고
- WARNING: 해석 가능하지만 주의 필요
- ERROR: 해석 불가
- FATAL: 내부 오류 또는 복구 불가

오류 객체:

```js
{
  level: "ERROR",
  code: "MODEL_MEMBER_MISSING_SECTION",
  message: "Member M12 has no section.",
  target: {
    type: "member",
    id: "M12"
  },
  suggestion: "Assign a valid section before analysis."
}
```

요구사항:

- UI는 오류 대상 부재/노드를 강조할 수 있어야 한다.
- solver error는 원인 후보를 함께 제공해야 한다.
- 내부 exception은 사용자에게 stack trace 그대로 노출하지 않는다.

## 16. UI 연동 요구사항

엔진 API는 UI와 분리한다.

```js
const validation = validateModel(model);
const result = analyzeLinear3d(model, {
  loadCaseId: "LC1",
  includeSelfWeight: true
});
const comboResults = combineResults(model, loadCaseResults);
const envelope = buildEnvelope(model, comboResults);
const design = runDesignChecks(model, envelope);
```

요구사항:

- UI는 엔진 객체를 직접 수정하지 않는다.
- 모델 변경은 명시적인 action을 통해 이루어진다.
- 해석결과는 model hash와 연결해 stale result를 감지한다.
- 긴 해석은 progress event를 제공할 수 있어야 한다.

## 17. 저장 및 마이그레이션

요구사항:

- 모든 프로젝트 파일은 `schemaVersion`을 포함한다.
- migration은 순차 함수로 관리한다.
- migration 후 변경 사항을 로그로 남긴다.
- 저장 파일에는 해석결과를 포함할지 옵션으로 선택할 수 있다.

권장:

```text
migrations/
  v1_to_v2.js
  v2_to_v3.js
```

## 18. 리포트 요구사항

리포트 데이터는 UI 표시와 분리한다.

```js
{
  projectSummary: {},
  modelSummary: {},
  loadSummary: {},
  analysisSummary: {},
  designSummary: {},
  memberTables: [],
  warnings: [],
  limitations: []
}
```

요구사항:

- 리포트에는 해석 단위계와 제품 버전을 포함한다.
- 리포트에는 지원하지 않는 설계검토 항목을 명시한다.
- 리포트에는 최종 구조계산서 대체물이 아니라는 제한사항을 포함한다.

## 19. 구현 마일스톤

### T0. 현재 엔진 추출

작업:

- 현재 HTML 내부 해석 함수 식별
- 모델 생성과 UI 렌더링에서 solver 함수 분리
- `analyze(model)` 형태의 facade 작성

완료 기준:

- 기존 샘플과 동일 결과
- 브라우저 콘솔 또는 테스트에서 직접 호출 가능

### T1. 스키마와 validation

작업:

- model schema 작성
- validation error code 정의
- unit conversion 유틸 작성
- JSON import/export 작성

완료 기준:

- invalid model 20개 이상 테스트
- valid example 5개 이상 통과

### T2. 선형 solver 제품화

작업:

- element stiffness test
- transformation test
- load conversion test
- solver residual check
- member force recovery

완료 기준:

- 선형 검증 예제 10개 이상 통과

### T3. 하중조합/포락

작업:

- combination result builder
- envelope station builder
- governing combo tracker

완료 기준:

- 설계엔진 입력 demand 생성 가능

### T4. 설계 1차

작업:

- steel beam/column 검토비
- RC beam preliminary check
- result table
- utilization color map

완료 기준:

- 부재별 지배 체크 표시

### T5. P-Delta

작업:

- geometric stiffness
- iterative solver
- stability warning

완료 기준:

- P-Delta 검증 예제 통과

### T6. Modal/RSA

작업:

- mass matrix
- eigen solver
- modal participation
- RSA combination

완료 기준:

- 전단건물 예제 통과

### T7. Nonlinear Pushover

작업:

- plastic hinge data model
- nonlinear member state
- tangent stiffness
- displacement control
- convergence log

완료 기준:

- 단순 포털프레임 capacity curve 생성

## 20. 주요 기술 리스크

### 20.1 수치해석 리스크

문제:

- 직접 구현 solver의 안정성 부족
- singular matrix 진단 난이도
- 고유치해석 정확도
- 비선형 수렴 실패

대응:

- 작은 benchmark부터 단계적으로 검증
- residual과 condition warning 기록
- 고유치/RSA는 선형 solver 안정화 이후 착수
- pushover는 2D 단순 모델에서 시작

### 20.2 제품 복잡도 리스크

문제:

- 기능이 많아지면 UI가 복잡해짐
- 설계기준 구현 범위가 무제한으로 커짐

대응:

- 기본 모드와 advanced mode 분리
- 설계기준은 "지원 범위"를 명확히 versioning
- 미지원 항목은 자동 OK 처리 금지

### 20.3 성능 리스크

문제:

- dense matrix가 대형 모델에서 한계
- 브라우저 메인 스레드 blocking

대응:

- Web Worker 도입
- sparse matrix roadmap 확보
- 모델 크기별 경고

## 21. 미결정 사항

다음 항목은 구현 전 결정이 필요하다.

- 코드베이스를 TypeScript로 전환할지 여부
- 내부 단위를 `N, mm`로 확정할지 여부
- 초기 eigen solver를 직접 구현할지, 순수 JS 수치 라이브러리를 허용할지 여부
- 설계기준을 KDS 중심으로 할지, 범용 교육용 공식부터 시작할지 여부
- S-Structures를 단일 HTML로 유지할지, Vite 기반 앱으로 전환할지 여부
- 계산서 PDF 생성을 브라우저 내에서 처리할지, HTML report 우선으로 갈지 여부

## 22. 권장 초기 기술 결정

권장안:

- 내부 단위: N, mm, MPa
- 언어: 초기 JavaScript 유지, 모듈 분리 후 TypeScript 점진 도입
- solver: dense matrix 직접 구현으로 시작
- 테스트: Vitest 또는 Node 기반 순수 함수 테스트
- UI: 현재 UI 유지하면서 엔진부터 분리
- 저장: JSON schemaVersion 필수
- 비선형: M9 이전 착수 금지
- OpenSees: 사용하지 않음

이 결정은 S-Structures의 현재 장점인 "가벼운 웹 실행"을 유지하면서, 구조해석 엔진을 자체 제품으로 성장시키는 데 가장 현실적이다.
