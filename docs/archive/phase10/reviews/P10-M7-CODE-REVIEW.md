# P10-M7 Code Review — 동적 확장

```yaml
review: P10-M7
date: 2026-07-22
verdict: PASS_FOR_P10_M7_GATE
release_qualification: NOT_RELEASE_QUALIFIED
milestone_status: complete
dedicated_gate: PASS
phase10_regression: PASS
full_regression: PASS
externally_cross_validated: false
release_qualified: false
evidence_artifact: verification/evidence/validation/phase10/p10-m7-dynamics-extension.json
evidence_records: 6/6 PASS
artifact_hash: 8d018a9af8d2a1bdc48b9175
```

## 결정

Prestressed 모달·RSA는 선택 중력 조합의 Direct P-Delta 수렴 축력에서 조립한 `Kt=Ke+Kg`를 고정해 사용한다.
`stiffnessBasis`가 없거나 Kt가 제공되지 않은 prestressed 요청은 설계 전달을 차단한다. 좌굴은 P9 requested-mode sparse
eigen 경로를 유지하며 코어 기본 요청 모드를 6으로 확장했다. 선형 direct THA는 Rayleigh 감쇠와 평균가속도 Newmark를
사용하고 상수 K_eff를 P9 factorSession에서 한 번만 분해한다.

## 검토 결과

1. 중력 조합 ID, Direct P-Delta 수렴, 축력, Kt, 모드 및 RSA provenance가 추적된다.
2. prestressed 모드와 RSA는 동일한 Kt 기준을 사용하며 basis 누락은 fail-closed한다.
3. 좌굴 다중모드는 deterministic order/residual 계약과 기존 최저모드 회귀를 유지한다.
4. direct THA는 가속도 단위 변환, Rayleigh C, β=1/4·γ=1/2, K_eff 단일 분해 재사용을 제공한다.
5. direct THA 결과에는 에너지 balance와 `energyTol` 판정이 포함된다.

## 게이트 요약

| 범위 | 결과 |
| --- | --- |
| DY-01 zero-prestress parity | PASS — 0 < 1e-10 |
| DY-02 압축 주기 방향성 | PASS — +29.099% |
| DY-03 Euler 좌굴 | PASS — 3.6860e-16 < 1e-6 |
| DY-04 최저모드 회귀 | PASS — 0 < 1e-8 |
| DY-05 direct/modal THA | PASS — 4.9023e-15 < 1e-6 |
| DY-06 에너지 | PASS — 1.9235e-14 < 1e-8 |
| K_eff factorSession | PASS — 1 factorization / 298 reused solves |

외부 OpenSees/SAP2000/ETABS 기준 artifact는 pending이다. 따라서 이 리뷰는 M7 내부 기능 gate만 승인하며
M11 제품 release 자격은 부여하지 않는다.
