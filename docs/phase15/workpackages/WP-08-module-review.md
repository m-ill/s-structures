# WP-08 — Module Extraction & Codebase Review

```yaml
id: WP-08
milestone: P15-M8
document_status: proposed
owners: [architecture, solver, compute, product, verification]
dependencies: [WP-03, WP-04, WP-05, WP-06, WP-07]
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

## 목표

기능 수정 중 유지한 compatibility façade를 정리하고 수치 owner·import 방향·consumer parity·NFR을 전체 코드베이스 수준에서 검토한다.

## 집중 항목

1. `linear3dAssembly`의 중복 member/foundation build 경로 통합
2. private sparse accumulator·CSC submatrix 제거
3. dense/sparse unsupported-rotation 공통 classifier 확인
4. verification 내부 root barrel import 제거
5. plate가 membrane workflow에서 mesh만 빌리는 결합 해소
6. stabilization MAC의 common eigen owner 사용
7. core/solver foundation validation 중복 제거
8. report/CLI/Agent/UI consumer migration
9. old dense benchmark helper·상태개수 test·stale manifest 제거
10. 전체 `src` dependency audit와 compatibility wrapper removal

## 리뷰

- numerical formula·residual·convergence
- structural boundary/load/sign/probe
- compute/solver/verification/report dependency
- schema/API migration·rollback
- deterministic hash·evidence integrity
- performance/memory/security·failure behavior

## 수용기준

- full `src` cycle 0
- internal root barrel import 0
- UI numeric-core direct import 0
- production→verification/reference import 0
- sparse/boundary/foundation recovery/stabilization classifier owner 각 1
- compatibility consumer parity 100%, undocumented removal 0
- feature-off·legacy project regression 0
- M0 runtime/memory 1.25배 budget PASS
- unresolved Critical/High finding 0

## 제출물

- `docs/phase15/reviews/P15-M8-CODE-REVIEW.md`
- duplicate owner/import graph report
- deprecated wrapper removal/migration record
- performance·memory·determinism evidence
