# WP-09 — Integrated Qualification & Capability Release

```yaml
id: WP-09
milestone: P15-M9
document_status: proposed
owners: [release, verification, structural-domain, evidence]
dependencies: [WP-08]
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

## 목표

clean environment에서 전체 evidence를 재생성하고 증거가 완전한 capability만 release한다.

## 작업

1. Phase 7~15 mandatory regression과 mutation batch
2. 11 published cases + 1 custom stabilization 실제 재실행
3. 동일 환경 3회 hash determinism
4. 별도 clean environment 재실행
5. 가능한 MIDAS·STRIX R4 full-precision result와 modeling mapping audit
6. JSON→Markdown/PDF artifact-only report 생성
7. UI·CLI·Agent·JSON·PDF value/unit/axis/sign/hash/status parity
8. requirement-risk-discrepancy-code-test-evidence-review validator
9. stale/hash/open finding·limitation을 포함한 capability manifest
10. release owner·구조전문가 claim 승인

## 수용기준

- mandatory fail/skip/timeout/flake 0
- mutation kill rate 100%
- traceability와 evidence schema/hash validation 100%
- same environment calculation/result hash 3/3 parity
- clean rerun PASS
- unresolved Critical/High 0
- external runtime solver dependency 0
- product surface parity 100%
- P3S2 custom claim label 강제

## Release 판정

- capability별 gate가 완전한 항목만 `releaseAllowed=true`
- R4 입력이 없으면 `crossSolverCompared=false` 또는 BLOCKED를 유지한다.
- 한 capability의 실패를 다른 capability에 숨기거나 전체 평균으로 상쇄하지 않는다.
- 구조전문가 별도 승인 없으면 `finalDesignTransferAllowed=false`다.

## Rollback

release manifest/hash 또는 clean rerun이 실패하면 artifact를 INVALIDATED하고 이전 Phase 14 상태로 승격하지 않는다. production code 수정은 WP-09 범위가 아니며 원 milestone으로 되돌려 새 변경·review·evidence를 요구한다.
