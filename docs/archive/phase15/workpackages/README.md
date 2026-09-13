# Phase 15 Work Packages

| WP | Milestone | 범위 | Primary gate |
| --- | --- | --- | --- |
| [WP-00](WP-00-corrective-baseline.md) | P15-M0 | baseline·reference·tolerance·discrepancy | governance |
| [WP-01](WP-01-verification-harness.md) | P15-M1 | benchmark/evidence contract | false-PASS 차단 |
| [WP-02](WP-02-sparse-numeric-infrastructure.md) | P15-M2 | common sparse assembly·SPD solve | fine-model solve |
| [WP-03](WP-03-membrane-assembly.md) | P15-M3 | global membrane assembly·SB2/SB3 | SB2·SB3 |
| [WP-04](WP-04-plate-workflow.md) | P15-M4 | boundary·sparse plate·SB5/SB6 | SB5·SB6 |
| [WP-05](WP-05-winkler-recovery.md) | P15-M5 | end action·station closure | SB7 |
| [WP-06](WP-06-shell-stabilization.md) | P15-M6 | actual static/modal parameter sweep | P3S2-SS custom |
| [WP-07](WP-07-preliminary-pass-hardening.md) | P15-M7 | 기존 PASS 6건 evidence 강화 | SB1·8·9·10·PD1·SM5 |
| [WP-08](WP-08-module-review.md) | P15-M8 | 중복 제거·코드베이스 리뷰 | architecture/NFR |
| [WP-09](WP-09-integrated-release.md) | P15-M9 | clean rerun·manifest·release | 전체 |

## 공통 제출물

- requirement·risk·discrepancy·verification mapping
- red reproduction과 negative-control mutation
- production code와 focused test 또는 계획 milestone의 승인 artifact
- schema/API/migration/rollback note
- invariant·metamorphic·independent reference 결과
- CLI·Agent·UI·JSON·report consumer parity
- deterministic evidence JSON과 code review record
- limitation·stale capability·performance 변화

## 공통 stop condition

- dirty baseline 또는 reference/tolerance 미승인
- 사용자 변경 overwrite
- expected/oracle의 production import
- extraction과 numeric behavior 변경 혼합
- feature-off·legacy project 회귀
- unit·axis·sign·probe·source 없는 결과
- true residual·평형·에너지·mutation 실패
- failed/partial/stale publish
- unresolved Critical/High finding

각 WP의 live 상태는 [Implementation Status](../IMPLEMENTATION_STATUS.md)만 따른다.
