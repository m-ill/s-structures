# Phase 5 Work Packages

WP는 Phase 5 실행 단위다. 착수 시 담당·시작일 기입, 완료 시 Result 섹션에 결과·증빙 링크.

## Status Board

| WP | 이름 | Track | 마일스톤 | 티켓 | 상태 |
| --- | --- | --- | --- | --- | --- |
| WP-01 | 기준선 + 해석 케이스 스키마 | — | P5-M0 | T01~T03 | not-started |
| WP-02 | 해석 센터 + 정적/모달/RSA | A | P5-M1 | T04~T10 | not-started |
| WP-03 | 좌굴·P-Delta·THA 케이스 | A | P5-M2 | T11~T13 | not-started |
| WP-04 | 지지 확장 (스프링·침하) | B | P5-M3 | T14~T15 | not-started |
| WP-05 | 부재 하중·거동 확장 | B | P5-M4 | T16~T18 | not-started |
| WP-06 | 하중 케이스·KDS·질량 | B | P5-M5 | T19~T22 | not-started |
| WP-07 | 힌지 배정 | C | P5-M6 | T23 | not-started |
| WP-08 | Pushover 케이스 + 뷰 | C | P5-M7 | T24~T25 | not-started |
| WP-09 | 성능 판정 + NLTH | C | P5-M8 | T26~T28 | not-started |
| WP-10 | 결과 3D 전환 | D | P5-M9 | T29~T30 | not-started |
| WP-11 | 색상 맵 + 차트 | D | P5-M10 | T31~T32 | not-started |
| WP-12 | 계산서 편입 + 출시 | D | P5-M11~M12 | T33~T37 | not-started |

## Recommended Order

```text
1. WP-01 (스키마 기반 — 전체의 토대)
2. WP-02 (해석 센터 — 가장 비어있던 핵심, 눈에 보이는 성과)
   이후 병렬 가능:
3a. WP-03 (해석 케이스 확장)
3b. WP-04~06 (하중 — A와 독립)
4. WP-07 → WP-08 → WP-09 (비선형, 순차)
5. WP-10 → WP-11 → WP-12 (결과·계산서·출시)
```

## Document Template

각 WP: Objective / Scope(In·Out) / Preconditions / Work Breakdown(파일 경로 단계) / Deliverables / Acceptance Criteria / Verification / Result.

각 WP의 상세는 착수 시점에 해당 SPEC(`../specs/SPEC-*.md`)을 근거로 이 폴더에 `WP-##-*.md`로 전개한다. 현재는 SPEC이 상세를 담고 있으므로, WP는 SPEC의 해당 절 + 티켓 묶음으로 시작한다.

| WP | 근거 SPEC 절 |
| --- | --- |
| WP-01 | ARCHITECTURE §2 |
| WP-02 | SPEC-A §1~§6 |
| WP-03 | SPEC-A §3(buckling/linearTha)·§7 |
| WP-04 | SPEC-B §1 |
| WP-05 | SPEC-B §2·§3 |
| WP-06 | SPEC-B §4·§5·§6 |
| WP-07 | SPEC-C §1 |
| WP-08 | SPEC-C §2 |
| WP-09 | SPEC-C §3·§4 |
| WP-10 | SPEC-D §1 |
| WP-11 | SPEC-D §2·§3 |
| WP-12 | SPEC-D §4 + README 출시 |
