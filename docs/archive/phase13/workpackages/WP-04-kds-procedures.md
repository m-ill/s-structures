# WP-04 — Source-bound KDS 하중 절차

```yaml
milestone: P13-M4
status: implementation-complete-qualification-blocked
depends_on: [P13-M3]
release_impact: core-conditional
owner_input_required: official-standard-sources-and-reviewer
```

## 1. 목표와 사용자 결과

지원한다고 선언한 하중 절차만 공식 source와 계산 trace에 결속해 자동화한다. 사용자는 자동값의 근거, 가정,
중간값과 생성된 case/combo를 확인하고 project 단위로 승인한다.

## 2. 재사용 자산

- `src/core/kdsLoadCombinations.js`
- `src/design/designBasisChangeSet.js`, `loadDerivationTrace.js`, `loadEstimation.js`
- `src/design/accidentalEccentricity.js`
- Phase 7 KDS rule pack preview/apply/audit와 source registry
- M3 load/mass/change-set workspace

## 3. source governance

각 procedure pack은 다음을 가진다.

```text
packId, standardId, edition, effectiveDate, sourceUrl,
sourceDocumentHash, clauseMap, applicability, exclusions,
inputSchema, formulaVersion, fixtureSet, reviewStatus,
reviewer, approvedAt, supersedes
```

- 기준 계수·조건은 UI component에 하드코딩하지 않는다.
- 유료·배포 제한 원문은 repository/evidence에 복제하지 않고 hash·접근기록만 보존한다.
- 원문 hash 또는 fixture가 미적격이면 `candidate`이고 설계전이가 차단된다.

## 4. 지원 범위 승격 순서

### WP04-A. Gravity·live·roof·snow

- 층별 용도와 D/L/Lr/S family
- 바닥구성·칸막이·설비의 source와 user override
- 지원 가능한 활하중 저감·지붕/적설 applicability
- 지원하지 않는 토압·수압·시공하중은 명시적 family/limitation으로 보존

### WP04-B. Wind

- project site·importance·exposure/topography 등 지원 input
- 방향·부호·풍상/풍하, 내외압과 tributary/story force
- 자동 생성된 W±X/W±Y 등 case와 source trace
- 범위를 벗어난 특수지붕·풍동 자료는 candidate/import workflow로 분리

### WP04-C. Seismic

- site class·importance·R 등 지원 input과 spectrum/ELF source
- equivalent lateral force, response spectrum, accidental eccentricity
- direction combination, base shear scaling before/after와 story distribution
- prestressed/dynamic advanced option은 capability 상태를 별도 표시

### WP04-D. Combination coverage

- strength/service/allowable family와 W/E 방향·부호 coverage matrix
- preview, merge/replace-generated, custom 보존과 rule update diff
- envelope group, governing purpose와 approval snapshot

### WP04-E. Project approval

- reviewer, memo, project revision, pack/source/factor hash 결속
- pack update 시 기존 approval stale 및 factor diff
- approval 없이 candidate를 final combination으로 숨겨 적용하지 않음

## 5. 검증·정량 수용기준

- P13-KDS-01: 지원 procedure의 official fixture 재현 100%
- P13-KDS-02: source/clause/formula/unit/intermediate trace 누락 0
- P13-KDS-03: required input silent default 0
- P13-KDS-04: direction/sign/load-family coverage 누락 0
- P13-KDS-05: 동일 pack/input 결정성 100%
- P13-KDS-06: generated/custom ownership 충돌 silent resolution 0
- P13-KDS-07: pack update diff factor·case·combo coverage 100%
- P13-KDS-08: unapproved candidate design-transfer 0
- P13-KDS-09: UI/API/report pack·source·approval parity 100%
- P13-KDS-10: outdated/superseded pack의 새 project 기본 선택 0

수치 tolerance와 rounding은 rule fixture에서 항목별로 고정하며 표시용 반올림값을 solver 입력으로 재사용하지 않는다.

## 6. failure injection

- source hash mismatch, missing clause, superseded pack, approval rev mismatch
- unsupported occupancy/site/roof input, unit ambiguity와 incomplete wind/seismic parameter
- pack apply 중 custom combination conflict와 M3 transaction failure

모든 경우 current approved load set을 보존하고 candidate diff만 반환한다.

## 7. evidence·완료판정

- `p13-m4-kds-procedures.json`
- procedure별 fixture artifact와 source-eligibility review
- 일부 procedure만 green이면 pack·procedure 단위로 상태를 분리하고 전체 KDS 완료로 표시하지 않는다.

## 8. 비범위·잔여 위험

- 공식 source가 확보되지 않은 procedure의 자격 승격
- 풍동기관 Excel의 임의 형식 전체 지원
- 특수 구조·비정형 건물의 전문가 판단 자동화
- 기준 해석은 반드시 책임기술자 검토를 유지한다.

## 9. 2026-08-05 구현 결과

- Source snapshot, 조항·formula trace, fixture hash, 적용/제외 범위와 supersession을 실제 KDS Procedures UI에 연결했다.
- 프로젝트·revision·source·trace가 일치하는 별도 승인 없이는 설계전이를 차단한다.
- 공식 KDS source pack과 책임자 승인이 없어 자격은 BLOCKED로 유지한다.
