# P10-M6 Code Review — 변단면 부재

```yaml
review: P10-M6
date: 2026-07-22
verdict: PASS_FOR_P10_M6_GATE
release_qualification: NOT_RELEASE_QUALIFIED
milestone_status: complete
dedicated_gate: PASS
phase10_regression: PASS
full_regression: PASS
externally_cross_validated: false
release_qualified: false
evidence_artifact: reports/validation-evidence/phase10/p10-m6-tapered.json
evidence_records: 3/3 PASS
artifact_hash: bf73a838dd2c01d200741dae
```

## 결정

변단면은 기존 프리즘 행렬을 대체하지 않고 `member.taper`가 존재할 때만 force-based 유연도 적분을 사용한다.
축·비틀림·2축 휨 및 선택적 Timoshenko 전단 유연도를 5점 또는 10점 Gauss-Legendre로 적분한다.
상수 단면은 기존 폐형식 행렬과 기계정밀도로 일치한다.

## 검토 결과

1. `linear`, `parabolic-depth`, `segments` 프로파일과 끝단·구간 단면 참조를 fail-closed 검증한다.
2. 강성, 21 station 단면 스냅샷, consistent fixed-end trace와 `∫ρA dx` lumped mass가 동일 taper 계약을 공유한다.
3. Direct P-Delta·좌굴 KG 경로는 taper provenance를 보존하고, 축력 복원은 적분된 축강성을 사용한다.
4. DomainBinary v6는 프로파일·Gauss 수·끝단 단면·segment offset/bounds/section을 typed buffer로 왕복한다.
5. element descriptor v4, factor hash, property/mass domain hash와 Agent member 편집이 taper를 포함한다.

## 검증 요약

| 범위 | 결과 |
| --- | --- |
| EL-P01 프리즘 회귀 | PASS — 5.9212e-16 < 1e-12 |
| EL-P02 선형 변단면 폐형해 | PASS — 4.0464e-9 < 1e-6 |
| EL-P03 5→10점 적분 수렴 | PASS — 4.0464e-9 < 1e-8 |
| 질량·KG·fixed-end·station | PASS |
| DomainBinary v6 / descriptor v4 / Agent v5 | PASS |
| Phase 10 M0~M6 | PASS |

외부 OpenSees/SAP2000/ETABS 기준 artifact는 pending이다. 따라서 이 리뷰는 M6 내부 기능 gate만 승인하며
M11 제품 release 자격을 부여하지 않는다.
