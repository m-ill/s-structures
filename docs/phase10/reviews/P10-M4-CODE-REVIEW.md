# P10-M4 Code Review — 3D 단부 오프셋·삽입점·패널존

```yaml
review: P10-M4
date: 2026-07-22
verdict: PASS_FOR_P10_M4_GATE
release_qualification: NOT_RELEASE_QUALIFIED
milestone_status: complete
dedicated_gate: PASS
full_regression: PASS
externally_cross_validated: false
release_qualified: false
evidence_artifact: verification/evidence/validation/phase10/p10-m4-offsets-panelzone.json
evidence_records: 4/4 PASS
artifact_hash: 9052baa9bcd0cdf092b4db0d
```

## 판정

기존 숫자형 오프셋 호환, local/global 3D 강체팔, 단면 삽입점, 패널존 spring 재사용,
DomainBinary v4 및 복원·평형·KG 연결을 승인한다. 판정은
`PASS_FOR_P10_M4_GATE / NOT_RELEASE_QUALIFIED`다.

## 리뷰 결과

1. `T_off`는 절점 변위에서 유연 부재단 변위로의 단일 변환이며 강성·고정단력·복원에 동일 적용된다.
2. 숫자형 i/j는 이전 축방향 clear-length 의미를 보존한다. 벡터형은 절점→유연단 부호계약을 가진다.
3. 삽입점은 단면 도심 편심을 같은 강체팔에 더해 별도 요소나 중복 보정을 피한다.
4. 패널존은 M3 회전스프링의 안정 응축·복원을 재사용하고 trace source를 `panelZone`으로 고정한다.
5. 패널존과 명시 spring 동일 축, 비-frame 패널존, `rigidFactor<1`, 잘못된 frame/성분은 fail-closed한다.
6. DomainBinary v4와 analysis/factor hash가 M4 입력을 포함하며 pack/unpack에서 값과 종류를 보존한다.
7. Direct P-Delta KG는 동일 요소 변환을 사용한다. 미검증 nonlinear corotational은 명시 차단한다.
8. Agent update/delete 계약과 도움말·사용자 문서에 새 필드와 제한을 공개했다.

## 검증 요약

| 범위 | 결과 |
| --- | --- |
| EL-O01 zero-vector 회귀 | PASS — 오차 0 < 1e-12 |
| EL-O02 축력 `N·e` 모멘트 전달 | PASS — 오차 0 < 1e-8 |
| EL-O03 자동/수동 패널존 등가 | PASS — 오차 0 < 1e-9 |
| EL-O04 강체팔 평형 audit | PASS — 잔차 0 < 1e-10 |
| legacy 숫자형 offset | PASS — 기존 clear length·metadata 유지 |
| insertion/schema/DomainBinary v4/hash | PASS |
| P-Delta KG/nonlinear limitation | PASS — 유한값 및 canonical blocker |
| Evidence artifact | PASS — 4/4, hash `9052baa9bcd0cdf092b4db0d` |
| M4 전용 runner | PASS — 3/3 |
| 최종 통합 `npm.cmd test` | PASS — exit 0 (2026-07-22 KST) |

## 비차단 한계와 release 차단 항목

- 벡터 오프셋/비도심 삽입점 nonlinear corotational: **blocked** — `NONLINEAR_3D_OFFSET_UNSUPPORTED`.
- `rigidFactor<1`: **blocked** — 부분 강체 구간 요소가 필요하다.
- 패널존은 현재 `K=G·tp·db·dc` 탄성 1차 회전스프링 근사다.
- 외부 solver 기준해와 XV-01~10 required-source green은 pending이다.

## 최종 리뷰 문구

`PASS_FOR_P10_M4_GATE / NOT_RELEASE_QUALIFIED`
