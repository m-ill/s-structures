# WP-00 — Corrective Baseline

```yaml
id: WP-00
milestone: P15-M0
document_status: proposed
owners: [governance, verification, structural-domain, architecture]
dependencies: []
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

## 목표

사용자 변경과 기존 evidence를 보존하면서 Phase 15가 수정할 discrepancy, reference, tolerance, probe와 reviewer를 결과 계산 전에 고정한다.

## 비목표

- production numeric code 수정
- benchmark 재실행·새 PASS 판정
- Phase 14 artifact 덮어쓰기

## 작업

1. source revision, dirty/untracked inventory와 dirty summary hash 기록
2. Node/toolchain/OS, 기존 test·runtime·memory baseline 기록
3. 1차 JSON/PDF와 Phase 14 evidence/manifest hash 보존
4. `P15-D001~D016`의 reproduction·impact owner 승인
5. reference/tolerance/probe manifest schema와 R1~R5 source record 작성
6. tolerance fraction·rounding·characteristic floor를 결과 전에 동결
7. expected/reference production import audit
8. numerical/domain/verification/architecture/release reviewer 역할 배정
9. Phase 15 test/evidence/review path와 stale policy 승인

## 수용기준

- baseline required field·hash 누락 0
- reference source/page/hash/unit/axis/sign/probe coverage 100%
- requirement-risk-discrepancy-test 예정 trace 100%
- production expected import 0
- artifact overwrite 0
- reviewer 미배정 Critical capability 0

## 제출물

- `p15-m0-corrective-baseline.json`
- reference/tolerance/probe manifests
- P15-M0 review record
- 승인된 active branch/worktree/checkpoint 식별자

## Rollback

M0는 production behavior를 변경하지 않는다. baseline mismatch가 발견되면 계획 상태를 유지하고 해당 artifact를 BLOCKED로 표시한다.
