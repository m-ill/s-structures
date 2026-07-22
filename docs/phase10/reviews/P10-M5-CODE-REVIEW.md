# P10-M5 Code Review — 일반 MPC·Rigid Link·Master-Slave

```yaml
review: P10-M5
date: 2026-07-22
verdict: PASS_FOR_P10_M5_GATE
release_qualification: NOT_RELEASE_QUALIFIED
milestone_status: complete
dedicated_gate: PASS
full_regression: PASS
externally_cross_validated: false
release_qualified: false
evidence_artifact: reports/validation-evidence/phase10/p10-m5-mpc-rigidlink.json
evidence_records: 5/5 PASS
artifact_hash: 9cb8470ec77fd50f7a7ac138
```

## 판정

일반 MPC, 6DOF rigid link, 선택 DOF master-slave를 기존 affine 구속 변환 `u=Tq+u_bar`에 통합했다.
선형 K/F, 모달 K/M, Direct P-Delta K/KG가 같은 변환을 사용하고 반력 및 구속력을 복원한다.
판정은 `PASS_FOR_P10_M5_GATE / NOT_RELEASE_QUALIFIED`이다.

## 검토 결과

1. slave 방정식은 `u_s = Σ(c_i u_i) + d`로 정규화되며, 강체 링크는 절점 좌표 편심으로 6개 방정식을 생성한다.
2. `CONSTRAINT_SLAVE_REDEFINED`, `CONSTRAINT_CYCLE`, `CONSTRAINT_SUPPORT_CONFLICT`를 위치 정보와 함께 fail-closed로 반환한다.
3. 선형 조립과 Direct P-Delta는 구속 축소 후 해를 full DOF로 복원하고, full residual에서 지점반력과 내부 구속력을 분리한다.
4. 모달 경로는 `T'KT`, `T'MT`를 함께 적용하며 기존 rigid-diaphragm 전용 경로는 일반 구속이 없을 때 그대로 유지된다.
5. DomainBinary v5 typed buffer와 structural/factor hash에 구속 입력이 포함된다.
6. Agent는 add/update/deleteConstraint를 제공하고 절점 삭제 시 참조 구속을 함께 정리한다.

## 검증 요약

| 범위 | 결과 |
| --- | --- |
| CN-M01 rigid-link 등가 | PASS — 1.4211e-14 < 1e-10 |
| CN-M02 MPC 평형 | PASS — 1.4803e-16 < 1e-10 |
| CN-M03 diaphragm 회귀 | PASS — 0 |
| CN-M04 충돌 코드 | PASS — 3/3 |
| 모달 K/M 변환 | PASS — 0 |
| Direct P-Delta K/KG | PASS — 2.0512e-15 |
| DomainBinary v5 / Agent | PASS |
| Evidence artifact | PASS — 5/5, `9cb8470ec77fd50f7a7ac138` |

외부 OpenSees/SAP2000/ETABS 기준 artifact는 아직 pending이다. 따라서 이 리뷰는 M5 내부 기능 gate만 승인하며 M11 제품 release 자격을 부여하지 않는다.
