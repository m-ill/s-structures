# WP-11 — Integrated Qualification & Release

## 목적

각 capability의 증거를 독립 판정하고 검증된 기능만 release manifest에 올린다.

## 작업

1. frozen 10-case qualification registry
2. metamorphic batch and full mandatory regression
3. offline MIDAS/STRIX result importer·mapping audit
4. discrepancy classification·review workflow
5. capability eligibility UI/CLI/Agent/report parity
6. migration/backup/restore/rollback
7. performance/accessibility/security/50-cycle resource
8. pilot and final manifest

## release 필드

```text
implemented
internallyVerified
independentlyQualified
crossSolverCompared
releaseAllowed
designTransferAllowed
referenceHash / toleranceHash / buildHash / resultHash
```

## 완료조건

- coverage·hash 100%
- mandatory fail/skip/timeout/flake 0
- Critical/High 0
- external runtime dependency 0
- unsupported/N/A/discrepancy 숨김 0
- capability별 owner approval
- final design transfer는 별도 승인 없으면 false

## 비범위

P13 source/pilot backlog를 P14 증거로 대신 닫는 것, SB12/SH1 구현, 모든 구조형식 상용동등 claim.
