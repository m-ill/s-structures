# Phase 16 Implementation Status

```yaml
reviewed_at: 2026-08-28
phase_status: complete-with-existing-product-debt
implemented_milestones:
  - P16-M0-snapshot-freeze
  - P16-M1-non-runtime-asset-separation
  - P16-M2-runner-and-harness-separation
  - P16-M3-production-verification-dependency-removal
  - P16-M4-framework-and-product-responsibility-split
  - P16-M5-recursive-test-taxonomy
  - P16-M6-output-and-retention-policy
  - P16-M7-dual-root-audit-and-regression
numerical_behavior_changed: false
product_release_status: BLOCKED
```

## 완료 결과

제품 실행 코드와 검증 정본을 다음 책임 경계로 분리했다.

| 책임 | canonical 위치 | 결과 |
| --- | --- | --- |
| 제품 해석·서비스 | `src/` | 검증 framework import 0건 |
| 제품 진단 benchmark | `src/diagnostics/` | product-owned 진단 10개 모듈 |
| 제품 release 정책 | `src/platform/` | Phase 10/13 readiness와 공용 release contract |
| 검증 framework | `verification/framework/` | qualification·reference·matrix·evidence 책임 |
| 검증 runner | `verification/runners/` | 기존 실행기 49개 이동 |
| 검증 harness | `verification/harnesses/` | 기존 검사기 14개와 Phase 16 gate 통합 |
| 검증 테스트 분류 | `verification/tests/taxonomy.json` | 413개 재귀 수집 |
| 임시/납품 산출물 | `tmp/verification/`, `output/verification/` | 삭제 가능 영역과 보존 영역 분리 |

기존 `src/verification/` 48개 파일은 책임별로 물리 이동했고 빈 디렉터리도 제거했다. 기존 `tools/` 진입점 63개는 외부 명령 호환을 위한 얇은 launcher이며 검증 로직을 보유하지 않는다. 재배치 원본 111개·773,720 bytes의 경로와 hash는 `verification/archive/p16-m2-m5-relocation-map.json`에 동결했다.

## 자산 무결성

- 비실행 자산: 209개, 2,036,389 bytes
- 이동 전 hash 정확 일치: 208개
- 등록된 legacy mutable evidence 예외: 1개
- 활성 옛 자산 경로: 0건
- 누락된 재배치 대상: 0건
- 미해결 검증 모듈 상대 import: 0건
- 제품→검증 import: 0건

`p4-preview-integrated-validation.json` 예외는 기존 임의 project ID 생성 동작으로 생긴 역사 자료이며 Phase 16 신규 qualification 근거로 사용하지 않는다.

## 테스트 inventory

`tests/**`와 `verification/tests/**`를 재귀 수집한다. 기존 404개 Phase 12 inventory는 역사 snapshot으로 보존하고, 현재 계약은 Phase 16 taxonomy가 담당한다.

| 분류 | 개수 |
| --- | ---: |
| unit | 166 |
| integration | 30 |
| e2e | 5 |
| qualification | 212 |
| 합계 | 413 |

기본 runner 포함 313개, release-long 100개이며 모든 항목에 owner와 실행 정책이 있다.

수정 완료 상태에서 `npm.cmd test`를 처음부터 끝까지 단일 연속 실행해 exit code 0을 확인했다. 다만 기존 dirty worktree에서 수행했으므로 clean-environment qualification은 주장하지 않는다. 실행 판정은 `verification/evidence/validation/phase16/p16-m7-repository-separation.json`에 기록했다.

## 이중 루트 감사

`p16-m7-dual-root-architecture-audit-v1` 결과:

- production files: 648
- verification framework files: 37
- import edges: 2,312
- import cycles: 0
- source digest: `2d79e164994cf49cdd3304853e3c9fa2ce35a74d004f09824127e4abd0b5f4d1`
- audit hash: `14b7670edde4a4150f22f6e3af4d3478915f90dbaba045b806329597be35aa89`
- sparse assembler, plate boundary, foundation recovery, stabilization classifier: 각각 단일 canonical owner

Phase 16 분리 gate는 통과했다. 전체 architecture `ok`는 기존 제품 부채 때문에 계속 false다. 이는 폴더 분리 실패와 구분한다.

## 기존 제품 부채와 릴리스 판정

| 항목 | 개수 | 판정 |
| --- | ---: | --- |
| UI→numeric core 직접 의존 | 40 | High, 후속 service boundary 필요 |
| report→solver 재실행 위험 | 1 | High, immutable result 소비로 변경 필요 |
| 미문서 product compatibility wrapper | 5 | 정책·owner·제거 gate 필요 |
| 기한 경과 compatibility policy | 4 | 재승인 또는 제거 필요 |

따라서 repository separation은 완료됐지만 제품 release와 최종 설계전이는 계속 `BLOCKED`다. MIDAS·STRIX R4 원본 교차검증, PD1·SM5 자격, clean environment·독립 reviewer 등 Phase 15 잔여 조건도 자동 해제하지 않는다.

## 운영 gate

```powershell
npm.cmd run check:verification-layout
npm.cmd run check:test-taxonomy
npm.cmd run check:public-imports
node tools/check-phase15-architecture.mjs --output=tmp/verification/phase16/architecture-dual-root.json
npm.cmd test
```

상세 리뷰와 후속 개선 순서는 [CODEBASE_REVIEW.md](CODEBASE_REVIEW.md)를 따른다.
