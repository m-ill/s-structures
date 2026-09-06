# Phase 17 Workpackage Index

Phase 17은 WIP limit 1로 진행한다. 사례별 상세 WP는 해당 사례 착수 직전에 source lock과 model mapping이 준비된 상태에서 작성하며, 계획 단계에서 추정 입력을 문서로 굳히지 않는다.

| WP | 마일스톤 | 범위 |
| --- | --- | --- |
| [WP-00-baseline-source-lock](WP-00-baseline-source-lock.md) | `P17-M0` | 21개 source/version/checksum/roles/claim 동결 — `COMPLETE_WITH_SOURCE_BLOCKERS` |
| [WP-01-case-framework](WP-01-case-framework.md) | `P17-M1` | case schema, 21+1 scaffold, isolated runner, append-only evidence/report contract — `CONTRACT_READY_NO_BENCHMARK_RUNS` |
| [WP-02-SB1](WP-02-SB1.md) | `P17-M2` | Euler cantilever — `CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL / BLOCKED_PRE_EXECUTION` |
| `WP-03-SB2` | `P17-M3` | NAFEMS elliptic membrane |
| `WP-04-SB3` | `P17-M4` | Cook membrane |
| `WP-05-SB5` | `P17-M5` | thin plate |
| `WP-06-SB6` | `P17-M6` | thick plate |
| `WP-07-SB7` | `P17-M7` | Winkler beam |
| `WP-08-SB8` | `P17-M8` | Timoshenko modal beam |
| `WP-09-SB9` | `P17-M9` | portal frame |
| `WP-10-SB10` | `P17-M10` | asymmetric truss |
| `WP-11-SB12` | `P17-M11` | inclined 6-DOF link |
| `WP-12-PD1` | `P17-M12` | staged P-Delta |
| `WP-13-SM5` | `P17-M13` | Bathe-Wilson modal frame |
| `WP-14-SM5b` | `P17-M14` | rigid-diaphragm condensation |
| `WP-15-SM6` | `P17-M15` | ASME 3D pipe frame modal |
| `WP-16-SR1` | `P17-M16` | 2D response spectrum |
| `WP-17-SR2` | `P17-M17` | eccentric 3D response spectrum |
| `WP-18-SR2b` | `P17-M18` | L-shaped braced frame response spectrum |
| `WP-19-P3S2` | `P17-M19` | official stabilization sensitivity |
| `WP-20-SP1` | `P17-M20` | moment-hinge pushover |
| `WP-21-SH1` | `P17-M21` | custom P-M-M hinge equivalence decision |
| `WP-22-TH1` | `P17-M22` | Newmark THA convergence |
| `WP-23-integrated-suite` | `P17-M23` | 21-case aggregate, review, regression, release manifest |

## 사례 WP 필수 항목

- source/reference/tolerance/probe lock hash
- model equivalence와 silent-default checklist
- 사용 product API와 필요한 capability
- 구현 파일과 canonical owner
- 실행·물리·수렴·mutation test 목록
- Chrome capture 목록
- expected evidence와 report 경로
- blocker와 rollback/invalidation 조건
- reviewer와 승인 gate

## 현재 진입점

`WP-01 / P17-M1`은 framework 계약만 닫혔다. canonical contract smoke `22/22`는 공식 21개와 custom 1개의 폴더·manifest를 별도 프로세스에서 확인한 결과이며 benchmark나 solver 실행이 아니다. 일반 child exit code 0은 qualification이 아니고 M1 terminal authorization도 강제로 꺼져 있다. 공식 PASS는 0개이고 release는 금지다.

`WP-02 / P17-M2 / SB1`의 실행 기반과 내용 잠금 R1은 구현됐다. 준비 gate는 `5/8`, 종결 증거는 `1/8`이며 공식 solver/benchmark 실행은 0회다. external registry/pin과 독립 reviewer attestation이 제공되기 전에는 `BLOCKED_PRE_EXECUTION`을 유지한다.
