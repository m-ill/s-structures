# Phase 13 Reference Basis

```yaml
version: p13-reference-basis-v1
status: planned
reviewed_at: 2026-08-05
runtime_solver: s-structures-in-house
external_solver_runtime_allowed: false
```

## 1. 원칙

제품 실행은 자체 solver만 사용한다. 검증 reference는 production runtime과 분리된 정적·재현 가능한 근거이며,
OpenSees 또는 다른 해석 프로그램을 제품의 fallback·subprocess·network service로 호출하지 않는다.

## 2. reference 등급

| 등급 | 근거 | 독립성 | 사용 |
| --- | --- | --- | --- |
| R1 | 폐형해·독립 수계산 | 높음 | element/global numeric qualification |
| R2 | 공개 표준 benchmark·동료검토 문헌 | 높음 | plate/shell/dynamics 검증 |
| R3 | 공식 공개 검증예제와 원시 artifact | 중~높음 | complex frame·load procedure 비교 |
| R4 | 책임 검토자가 승인한 offline 제3자 결과 artifact | 중간 | project-like cross-check |
| R5 | 동일 구현의 재계산·internal invariants | 낮음 | regression만; 독립 검증 대체 불가 |

R4 artifact는 외부 프로그램 runtime을 제품에 포함한다는 뜻이 아니다. source file, version, input, output,
mapping과 hash가 고정된 offline reference만 허용한다.

## 3. 분야별 근거

### Frame elastic

- axial, torsion, 2-axis bending closed form
- portal/frame hand calculation과 equilibrium
- support settlement, release, partial fixity, offset, Timoshenko reference
- modal SDOF/MDOF, RSA, P-Delta와 eigen buckling independent fixture

### Loads·KDS

- official standard edition/amendment와 source hash
- official example 또는 책임 검토자의 독립 calculation sheet
- input branch/rounding/boundary fixture
- 기준 원문 배포권이 없으면 원문 대신 clause map·hash·expected artifact만 저장

### MGT

- 재배포 가능한 synthetic/approved anonymized MGT fixture
- parser AST, mapping, canonical model과 export round-trip
- unsupported record와 line provenance golden file
- 외부 application 실행은 qualification 필수조건이 아님

### Plate/Shell

- rigid-body·patch·Jacobian·energy·equilibrium
- closed-form plate solution과 공개 benchmark
- mesh refinement/convergence와 distortion battery
- Phase 10 internal evidence는 regression이며 외부 자격을 자동 부여하지 않음

## 4. reference record 필드

```text
referenceId, referenceGrade, title, authority, edition,
sourceUrlOrLocator, sourceHash, license/access, inputArtifactHash,
expectedArtifactHash, quantityDefinitions, unit/axis/sign,
tolerance, mappingVersion, reviewer, approvedAt, limitations
```

기대값과 실제값은 `absTol + relTol × scale` 규칙을 사용하며 이산 code branch, ID, 계수와 조합 membership은 exact match한다.

## 5. fixture registry

- simple closed-form frame
- 3D diaphragm/asymmetric frame
- steel warehouse with release/offset/P-Delta/buckling
- RC office story/mass/RSA
- one/two-way slab load distributor
- KDS wind/seismic/snow branch fixtures
- legacy project migration
- pathological model battery
- limited/hostile MGT
- shell patch/plate/convergence/distortion
- S-tier performance model

M0에서 각 fixture의 source, owner, redistribution permission, expected result와 release eligibility를 확정한다.

## 6. 차단 규칙

- source hash, input, unit/axis/sign 또는 expected quantity 정의가 없으면 independent reference로 인정하지 않는다.
- screenshot이나 보고서 숫자 전사만으로 numeric PASS를 만들지 않는다.
- 동일 production 함수로 expected와 actual을 생성하지 않는다.
- pending external reference를 0 오차 또는 PASS로 기록하지 않는다.
- 외부 runtime이 없다는 이유로 공학 검증을 생략하지 않고 capability를 BLOCKED/REVIEW로 유지한다.
