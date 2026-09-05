# P9-M0 Truthful Baseline

```yaml
milestone: P9-M0
status: complete
qualification: G0-baseline-only
design_transfer_allowed: false
nonlinear_solver_rerun: false
```

## 목적

Phase 9 최적화 전 실제 입력 규모, 작은 수치 기준, 계산 경로, 메모리와 기술부채를 재현 가능한 산출물로 고정한다. 이 기준선은 GPU 구현 또는 설계 전용 자격을 의미하지 않는다.

## 실행

```powershell
npm.cmd run baseline:p9:m0
npm.cmd run test:p9 -- M0
npm.cmd run test:p9docs
```

`baseline:p9:m0`는 S/M/L fixture를 실제 생성하고 hash와 크기를 기록한다. 작은 탄성, Direct P-Delta, modal/RSA, buckling 기준 문제만 solver로 실행한다. M/L solve는 현재 dense 경로의 메모리 위험 때문에 preflight에서 중단한다.

## 비선형 증거 정책

Pushover와 MDOF NLTH는 긴 Phase 8 solver suite를 다시 실행하지 않는다. 다음 기존 PASS artifact를 schema와 hash로 재검증하고 `rerun: false`로 기록한다.

- `reports/validation-evidence/phase8/p8-m5-formal-pushover.json`
- `reports/validation-evidence/phase8/p8-m8-mdof-nlth.json`

이 재사용 증거는 Phase 9 코드 변경 후 비선형 수치 parity를 대신하지 않는다. 관련 계산 코드가 변경되는 마일스톤은 해당 범위의 작은 회귀와 자격 시험을 별도로 수행해야 한다.

## 산출물

| 산출물 | 역할 |
| --- | --- |
| `reports/validation-evidence/phase9/p9-m0-baseline.json` | 수치·시간·메모리·fixture·기존 증거 hash |
| `reports/validation-evidence/phase9/p9-m0-debt-inventory.json` | owner와 목표 마일스톤이 지정된 부채 레지스트리 |
| `docs/verification/phase9/release-manifest.json` | fail-closed G0 릴리스 상태 |

## 현재 blocker

- `M_TIER_ELASTIC_CURRENT_DENSE_PATH_NOT_EXECUTED`
- `M_TIER_PUSHOVER_END_TO_END_REQUIRED`
- `M_TIER_NLTH_END_TO_END_REQUIRED`
- `BROWSER_UI_LATENCY_EVIDENCE_REQUIRED`

모든 blocker는 후속 마일스톤 증거가 만들어질 때까지 release manifest에 남긴다.
