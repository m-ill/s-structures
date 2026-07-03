# Work Packages Index

WP는 Phase 4의 실행 단위다. 착수 시 담당·시작일을 기입하고, 완료 시 결과 요약과 증빙 링크를 문서 하단 Result 섹션에 남긴다.

## Status Board

| WP | 이름 | Stage | 마일스톤 | 티켓 | 상태 |
| --- | --- | --- | --- | --- | --- |
| [WP-01](WP-01-elastic-validation.md) | 탄성해석 실증 | V | P4-M1 | T01~T06 | not-started |
| [WP-02](WP-02-nonlinear-validation.md) | 비선형해석 실증 | V | P4-M2 | T07~T11 | not-started |
| [WP-03](WP-03-design-validation.md) | 설계모듈 실증 | V | P4-M3 | T12~T16 | not-started |
| [WP-04](WP-04-import-validation.md) | 도면/점군 import 실증 | V | P4-M4 | T17~T21 | not-started |
| [WP-05](WP-05-platform-hardening.md) | 플랫폼/보안 강화 | H | P4-M5 | T22~T28 | complete |
| [WP-06](WP-06-performance.md) | 성능/규모 실증 | H | P4-M6 | T29~T32 | complete |

| [WP-07](WP-07-modeler-integration.md) | 모델러 통합·프론트 완성 | H | P4-M7 | T33~T39 | complete |
| [WP-08](WP-08-packaging.md) | 패키징/배포 | R | P4-M8 | T40~T45 | not-started |
| [WP-09](WP-09-documentation.md) | 사용자 문서/온보딩 | R | P4-M9 | T46~T49 | not-started |
| [WP-10](WP-10-beta-launch.md) | 베타 파일럿·출시 | R | P4-M10~11 | T50~T52 | not-started |

## Document Template

각 WP 문서는 다음 섹션을 가진다: Objective / Scope (In·Out) / Preconditions / Work Breakdown (파일 경로 포함 단계) / Deliverables / Acceptance Criteria (기계 확인) / Verification Procedure / Risks & Rollback / Result (완료 시 기입).

## Recommended Order

착수 권장 순서 (의존성·리스크 기준):

```text
1. WP-07 스파이크 (R3 리스크 조기 해소 — TD-01 통합 난이도 실측, 1일)
2. WP-05 (보안 강화 — 이후 모든 작업의 기반, 독립적)
3. WP-01 → WP-03 (탄성 실증 후 설계 실증 — demand 기준 공유)
   병렬: WP-02, WP-04 (독립)
4. WP-07 본작업 → WP-06
5. WP-08 → WP-09 → WP-10
```
