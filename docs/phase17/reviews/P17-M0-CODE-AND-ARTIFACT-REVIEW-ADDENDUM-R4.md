# P17-M0 Code & Artifact Review Addendum R4

```yaml
reviewed_at: 2026-08-28
milestone: P17-M0
review_revision: 4
qualification_scope: R3_CR-02_DOCUMENTATION_CLAIM_ONLY
status: COMPLETE_WITH_SOURCE_BLOCKERS
cr02_status: PARTIALLY_CLOSED_BY_GENERATOR_ASSERTIONS
residual_debt_status: OPEN_SCHEMA_DEBT_CARRIED_TO_M1
m1_entry_allowed: true
release_allowed: false
final_design_transfer_allowed: false
solver_runs_in_scope: 0
```

## 정정 결론

R3 addendum의 CR-02 행은 content audit, claim qualification, final manifest와 closure의 nested record가 모두 엄격하게 계약화됐다고 표현하고 `CLOSED FOR M0 BY LAYERED VALIDATION`으로 판정했다. 재검토 결과 이 표현은 final manifest와 validation closure의 schema 수준을 실제보다 넓게 설명했다.

정확한 판정은 다음과 같다.

- CR-02: `PARTIALLY_CLOSED_BY_GENERATOR_ASSERTIONS`
- 잔여 부채: `OPEN_SCHEMA_DEBT_CARRIED_TO_M1`

M0 finalizer의 결정론적 생성, canonical self-hash, 구현 inventory와 선택된 evidence-chain assertion은 실제 R3 산출물을 상당 부분 보호한다. 그러나 이 보호를 모든 nested record가 독립적인 schema validation으로 엄격히 검증된 것과 동일하게 표현할 수는 없다.

이 R4는 append-only 문서 정정이다. R3 addendum, R3 closure, M0 baseline, source lock, 보고서와 QA 산출물을 수정하거나 무효화하지 않는다.

## 결속 대상

| 산출물 | Bytes | SHA-256 |
| --- | ---: | --- |
| `docs/phase17/reviews/P17-M0-CODE-AND-ARTIFACT-REVIEW-ADDENDUM-R3.md` | 8,723 | `1f0832d30d87dce7c28d5b0ee54243d5ad620a36778a4e9435fb0bdf980d9a71` |
| `verification/evidence/validation/phase17/p17-m0-validation-closure-r3.json` | 32,677 | `d7475f8a5140603b0fc6b43d44c81a29b8aedbc301a012c6fba6b51c37e0f0aa` |

R3 closure 내부 `closureHash`는 `4b0b748eadad0d48b2ffa80f9dbae7d37b2d4c1a808b4390fae1b9bc7abae224`다. R4 machine-readable 정본은 `verification/evidence/validation/phase17/p17-m0-documentation-qualification-r4.json`이다.

## 확인된 schema 한계

### Final report manifest

`verification/specs/phase17/p17-m0-report-final-manifest-schema.json`은 최상위 required key와 `additionalProperties=false`, claim boundary 등 일부 필드를 엄격히 제한한다. 그러나 다음 record는 `type: object` 또는 `items: {type: object}` 수준이다.

- `baselineEvidence`
- `claimQualification`
- `sourceValuePresenceAudit`
- `report`
- `qa`
- `sourceScreenshots[]`
- `renderer`

### Validation closure

`verification/specs/phase17/p17-m0-validation-closure-schema.json`은 repository state와 implementation inventory file record 등을 제한한다. 그러나 다음 record는 type 또는 array 길이만 확인한다.

- `supersedes`
- `evidenceChain`
- `checks[]`
- `semanticGateReview[]`
- `blockerClassification`
- `ciPolicy`

### Validator 범위

`verification/harnesses/json-schema-lite.mjs`는 dependency-free subset validator다. `type`, `required`, `properties`, `additionalProperties`, `const`, `enum`, pattern, 일부 format과 수치·문자열·배열 제한은 구현한다. 반면 `$ref/$defs`, `oneOf`, `allOf`, `if/then`, `minProperties`, `date-time` 같은 미지원 keyword를 fail-closed로 거부하지 않는다.

따라서 generator가 생성한 현재 R3 산출물과 그 hash chain이 보호된다는 주장과, 임의의 저장 artifact가 모든 nested schema 의미를 독립적으로 만족한다는 주장을 분리해야 한다.

## 유지되는 M0 판정

이번 문서 정정으로 다음 판정은 변하지 않는다.

- M0 상태: `COMPLETE_WITH_SOURCE_BLOCKERS`
- M1 진입: 허용
- M0 구조해석 실행: 0건
- STRIX/MIDAS 실제 R4 실행: 0건
- release: 금지
- final design transfer: 금지

CR-02 잔여 부채는 source custody 사실을 뒤집는 결함은 아니므로 M1 구현 착수를 막지 않는다. 다만 schema와 shared harness를 만드는 M1의 완료 gate에는 포함해야 한다.

## P17-M1 이관 gate

P17-M1은 다음 증거가 있어야 이 잔여 부채를 닫을 수 있다.

1. M1 정본 nested record가 지원되는 schema validator 또는 명시적 semantic validator로 모두 검증된다.
2. unknown 또는 unsupported schema keyword가 fail-closed로 거부된다.
3. artifact를 재생성하지 않고 저장된 artifact만 독립 검증하는 명령이 있다.
4. nested required-key 삭제, extra-key, enum, hash, NaN/Infinity, duplicate ID, cross-field binding과 unknown-keyword mutation이 모두 kill된다.

## `correctionHash` 규칙

기계 판독 정본의 `correctionHash`는 `p17-recursive-sorted-json-sha256-v1` 규칙을 따른다.

1. 최상위 `correctionHash` 필드를 제외한다.
2. 모든 object key를 재귀적으로 사전식 오름차순 정렬한다.
3. array 순서는 보존한다.
4. 불필요한 공백 없이 JSON으로 직렬화한다.
5. UTF-8 bytes에 SHA-256을 적용하고 소문자 64자리 16진수로 기록한다.

정본 `correctionHash`: `9e6ac01fa6f11c9898e82b9dba5c72cd160ecfec4d77a0b6d2f6744d975ccb47`
